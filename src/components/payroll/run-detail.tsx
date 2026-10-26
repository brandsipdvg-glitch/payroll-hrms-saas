"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Printer, Download, CheckCircle2, XCircle, RefreshCcw, PlayCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch, downloadResource, payrollRunsApi, ApiClientError } from "@/lib/client/api";
import { formatCurrency, formatDate } from "@/lib/utils";

type Row = Record<string, unknown>;

export function RunDetail({ runId }: { runId: string }) {
  const router = useRouter();
  const [run, setRun] = useState<Row | null>(null);
  const [payslips, setPayslips] = useState<Row[]>([]);
  const [payouts, setPayouts] = useState<Row[]>([]);
  const [register, setRegister] = useState<Row[]>([]);
  const [adjustments, setAdjustments] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("payslips");
  const [busy, setBusy] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjForm, setAdjForm] = useState({ employeeId: "", type: "BONUS", amount: "", description: "" });
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, reg, adjs] = await Promise.all([
        apiFetch<Row>(`${payrollRunsApi}/${runId}`),
        apiFetch<{ run: Row; rows: Row[] }>(`${payrollRunsApi}/${runId}/register`),
        apiFetch<Row[]>(`${payrollRunsApi}/${runId}/adjustments`),
      ]);
      setRun(d);
      setPayslips((d.payslips as Row[] | undefined) ?? []);
      setRegister(reg.rows ?? []);
      setAdjustments(adjs ?? []);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load run.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    if (!payouts.length) return [];
    const byName = new Map<string, Row>();
    for (const p of payouts) {
      const key = String(p.name);
      const cur = byName.get(key);
      byName.set(key, { name: key, amount: Number(cur?.amount ?? 0) + Number(p.amount ?? 0) });
    }
    return Array.from(byName.values()).sort((a, b) => Number(b.amount) - Number(a.amount));
  }, [payouts]);

  useEffect(() => {
    if (tab === "summary" && run) {
      apiFetch<{ run: Row; earnings: Row[]; deductions: Row[] }>(`${payrollRunsApi}/${runId}/summary`)
        .then((s) => {
          const all = [...(s.earnings ?? []).map((e) => ({ name: e.name, amount: e.amount, kind: "Earning" })), ...(s.deductions ?? []).map((d) => ({ name: d.name, amount: d.amount, kind: "Deduction" }))];
          setPayouts(all);
        })
        .catch(() => setPayouts([]));
    }
  }, [tab, run, runId]);

  const status = useMemo(() => String(run?.status ?? ""), [run]);

  async function action(path: string) {
    if (confirming === null) {
      setConfirming(path);
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`${payrollRunsApi}/${runId}/${path}`, { method: "POST" });
      toast.success("Run updated.");
      setConfirming(null);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function addAdjustment() {
    if (!adjForm.employeeId || !Number(adjForm.amount ?? 0)) {
      toast.error("Select employee and enter amount.");
      return;
    }
    try {
      await apiFetch(`${payrollRunsApi}/${runId}/adjustments`, {
        method: "POST",
        body: JSON.stringify({
          runId,
          employeeId: adjForm.employeeId,
          type: adjForm.type,
          amount: Number(adjForm.amount),
          description: adjForm.description,
        }),
      });
      toast.success("Adjustment added. Recalculate to apply it.");
      setAdjOpen(false);
      setAdjForm({ employeeId: "", type: "BONUS", amount: "", description: "" });
      const adjs = await apiFetch<Row[]>(`${payrollRunsApi}/${runId}/adjustments`);
      setAdjustments(adjs ?? []);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to add adjustment.");
    }
  }

  async function removeAdjustment(id: string) {
    try {
      await apiFetch(`/api/v1/payroll/adjustments/${id}`, { method: "DELETE" });
      toast.success("Adjustment removed. Recalculate to apply.");
      setAdjustments(adjustments.filter((a) => a.id !== id));
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to remove adjustment.");
    }
  }

  function downloadRegister() {
    if (!register.length) {
      toast.error("No register rows to download.");
      return;
    }
    const headers = Object.keys(register[0]);
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(","), ...register.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `salary-register-${String(run?.month)}-${String(run?.year)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const payslipColumns: Column<Row>[] = [
    {
      key: "employee",
      title: "Employee",
      render: (r) => {
        const emp = r.employee as Row | undefined;
        const desig = emp?.designation as Row | undefined;
        return (
          <div>
            <p className="font-medium">
              {String(emp?.firstName ?? "")} {String(emp?.lastName ?? "")}
            </p>
            <p className="text-xs text-muted-foreground">
              {String(emp?.employeeCode ?? "")} · {String(desig?.title ?? "")}
            </p>
          </div>
        );
      },
    },
    {
      key: "status",
      title: "Status",
      render: (r) => <Badge variant={status === "PAID" ? "success" : status === "FINALIZED" ? "default" : "warning"}>{String(r.status)}</Badge>,
    },
    { key: "days", title: "Days", render: (r) => <span>{Number(r.presentDays)}/{Number(r.payrollDays)}</span> },
    { key: "lop", title: "LOP", render: (r) => <span>{Number(r.lopAmount) ? formatCurrency(Number(r.lopAmount)) : "—"}</span> },
    { key: "overtime", title: "OT", render: (r) => <span>{Number(r.overtimePay) ? formatCurrency(Number(r.overtimePay)) : "—"}</span> },
    { key: "totalEarnings", title: "Earnings", render: (r) => <span>{formatCurrency(Number(r.totalEarnings))}</span> },
    { key: "totalDeductions", title: "Deductions", render: (r) => <span>{formatCurrency(Number(r.totalDeductions))}</span> },
    { key: "netSalary", title: "Net", render: (r) => <span className="font-semibold">{formatCurrency(Number(r.netSalary))}</span> },
    {
      key: "actions",
      title: "",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Print payslip" onClick={() => window.open(`/api/v1/payroll/payslips/${String(r.id)}/print`, "_blank")}>
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const registerColumns: Column<Row>[] = [
    { key: "employeeCode", title: "Code" },
    { key: "employeeName", title: "Employee" },
    { key: "designation", title: "Designation" },
    { key: "payrollDays", title: "Days" },
    { key: "lopAmount", title: "LOP", render: (r) => <span>{formatCurrency(Number(r.lopAmount))}</span> },
    { key: "totalEarnings", title: "Earnings", render: (r) => <span>{formatCurrency(Number(r.totalEarnings))}</span> },
    { key: "reimbursements", title: "Reim.", render: (r) => <span>{formatCurrency(Number(r.reimbursements))}</span> },
    { key: "bonus", title: "Bonus", render: (r) => <span>{formatCurrency(Number(r.bonus))}</span> },
    { key: "totalDeductions", title: "Deductions", render: (r) => <span>{formatCurrency(Number(r.totalDeductions))}</span> },
    { key: "netSalary", title: "Net", render: (r) => <span className="font-semibold">{formatCurrency(Number(r.netSalary))}</span> },
  ];

  if (loading && !run) {
    return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
  }

  if (!run) {
    return (
      <div className="space-y-4">
        <Link href="/payroll/runs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to runs
        </Link>
        <p className="text-sm text-muted-foreground">Payroll run not found.</p>
      </div>
    );
  }

  const totals = [
    { label: "Gross pay", value: Number(run.totalGross) },
    { label: "Deductions", value: Number(run.totalDeductions) },
    { label: "Reimbursements", value: Number(run.totalReimbursements) },
    { label: "Bonus", value: Number(run.totalBonus) },
    { label: "Incentives", value: Number(run.totalIncentives) },
    { label: "Arrears", value: Number(run.totalArrears) },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/payroll/runs" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{periodLabel(run)}</h1>
              <Badge variant={statusVariant(status)}>{status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {payslips.length} payslips · {Number(run.payrollDays)} pay days{run.notes ? ` · ${String(run.notes)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status === "DRAFT" ? (
            <>
              <Button variant="outline" size="sm" onClick={() => void action("recalculate")}>
                <RefreshCcw className="mr-1.5 h-4 w-4" /> Recalculate
              </Button>
              <Button variant="default" size="sm" onClick={() => void action("finalize")}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Finalize
              </Button>
              <Button variant="outline" size="sm" className="text-rose-600" onClick={() => void action("cancel")}>
                <XCircle className="mr-1.5 h-4 w-4" /> Cancel
              </Button>
            </>
          ) : null}
          {status === "FINALIZED" ? (
            <>
              <Button variant="default" size="sm" onClick={() => void action("mark-paid")}>
                <PlayCircle className="mr-1.5 h-4 w-4" /> Mark paid
              </Button>
              <Button variant="outline" size="sm" onClick={() => void action("cancel")}>
                <XCircle className="mr-1.5 h-4 w-4" /> Cancel
              </Button>
            </>
          ) : null}
          {status === "PAID" ? (
            <Button variant="outline" size="sm" onClick={() => void action("cancel")}>
              <XCircle className="mr-1.5 h-4 w-4" /> Cancel
            </Button>
          ) : null}
          <Button variant="outline" size="sm" disabled={status === "DRAFT"} title="Available after finalization" onClick={() => void downloadResource(`${payrollRunsApi}/${runId}/bank-file`).catch((e) => toast.error(e instanceof ApiClientError ? e.message : "Bank file unavailable."))}>
            <Download className="mr-1.5 h-4 w-4" /> Bank file
          </Button>
          <Button variant="outline" size="sm" onClick={downloadRegister}>
            <Download className="mr-1.5 h-4 w-4" /> Register CSV
          </Button>
          <Button size="sm" disabled={status === "PAID"} onClick={() => setAdjOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Adjust
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {totals.map((t) => (
          <Card key={t.label}>
            <CardContent className="p-4">
              <p className="text-2xl font-bold leading-none">{formatCurrency(t.value)}</p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">{t.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Net pay (all payslips)</p>
            <p className="text-xl font-bold">{formatCurrency(Number(run.totalNet))}</p>
          </div>
        </CardContent>
      </Card>

      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: "payslips", label: `Payslips (${payslips.length})` },
          { value: "summary", label: "Summary" },
          { value: "adjustments", label: `Adjustments (${adjustments.length})` },
          { value: "register", label: `Register (${register.length})` },
        ]}
      />

      {tab === "payslips" ? (
        <DataTable columns={payslipColumns} rows={payslips} loading={loading} total={payslips.length} page={1} pageSize={payslips.length || 1} onPageChange={() => undefined} empty="No payslips in this run." />
      ) : null}

      {tab === "summary" ? (
        <DataTable
          columns={[
            { key: "name", title: "Component" },
            { key: "kind", title: "Type", render: (r) => <Badge variant={String(r.kind) === "Earning" ? "success" : "destructive"}>{String(r.kind)}</Badge> },
            { key: "amount", title: "Total", render: (r) => <span className="font-semibold">{formatCurrency(Number(r.amount))}</span> },
          ]}
          rows={summary}
          loading={!summary.length && !payouts.length}
          total={summary.length}
          page={1}
          pageSize={summary.length || 1}
          onPageChange={() => undefined}
          empty="No components to summarize."
        />
      ) : null}

      {tab === "adjustments" ? (
        <DataTable
          columns={[
            {
              key: "employee",
              title: "Employee",
              render: (r: Row) => {
                const emp = r.employee as Row | undefined;
                return (
                  <div>
                    <p className="font-medium">
                      {String(emp?.firstName ?? "")} {String(emp?.lastName ?? "")}
                    </p>
                    <p className="text-xs text-muted-foreground">{String(emp?.employeeCode ?? "")}</p>
                  </div>
                );
              },
            },
            { key: "type", title: "Type", render: (r: Row) => <Badge variant="secondary">{String(r.type)}</Badge> },
            { key: "amount", title: "Amount", render: (r: Row) => <span className="font-semibold">{formatCurrency(Number(r.amount))}</span> },
            { key: "description", title: "Description", render: (r: Row) => <span>{String(r.description ?? "—")}</span> },
            { key: "createdAt", title: "Added", render: (r: Row) => <span>{formatDate(r.createdAt as string)}</span> },
            {
              key: "actions",
              title: "",
              render: (r: Row) =>
                status !== "PAID" ? (
                  <div className="flex justify-end">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void removeAdjustment(String(r.id))} aria-label="Remove adjustment">
                      <Trash2 className="h-4 w-4 text-rose-500" />
                    </Button>
                  </div>
                ) : null,
            },
          ]}
          rows={adjustments}
          loading={loading}
          total={adjustments.length}
          page={1}
          pageSize={adjustments.length || 1}
          onPageChange={() => undefined}
          empty={status === "PAID" ? "No adjustments. Paid runs cannot be adjusted." : "No adjustments yet. Add bonus / incentive / reimbursement / arrears."}
        />
      ) : null}

      {tab === "register" ? (
        <DataTable columns={registerColumns} rows={register} loading={loading} total={register.length} page={1} pageSize={register.length || 1} onPageChange={() => undefined} empty="No register rows." />
      ) : null}

      <Dialog
        open={adjOpen}
        onOpenChange={setAdjOpen}
        title="Add payroll adjustment"
        description="Applies to the employee's payslip after a recalculation. For losses use a negative amount."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdjOpen(false)}>Cancel</Button>
            <Button onClick={() => void addAdjustment()}>Add</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee">
            <Select value={adjForm.employeeId} onChange={(e) => setAdjForm({ ...adjForm, employeeId: e.target.value })}>
              <option value="">Select employee…</option>
              {payslips.map((p) => {
                  const emp = p.employee as Row | undefined;
                  return (
                    <option key={String(p.employeeId)} value={String(p.employeeId)}>
                      {String(emp?.firstName ?? "")} {String(emp?.lastName ?? "")} · {String(emp?.employeeCode ?? "")}
                    </option>
                  );
                })}
            </Select>
          </Field>
          <Field label="Type">
            <Select value={adjForm.type} onChange={(e) => setAdjForm({ ...adjForm, type: e.target.value })}>
              <option value="BONUS">Bonus</option>
              <option value="INCENTIVE">Incentive</option>
              <option value="REIMBURSEMENT">Reimbursement</option>
              <option value="ARREARS">Arrears</option>
            </Select>
          </Field>
          <Field label="Amount (₹)">
            <Input type="number" step="0.01" value={adjForm.amount} onChange={(e) => setAdjForm({ ...adjForm, amount: e.target.value })} placeholder="e.g. 5000" />
          </Field>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label className="text-xs">Description (optional)</Label>
          <Input value={adjForm.description} onChange={(e) => setAdjForm({ ...adjForm, description: e.target.value })} placeholder="e.g. Diwali bonus" />
        </div>
      </Dialog>

      <Dialog
        open={Boolean(confirming)}
        onOpenChange={(v) => {
          if (!v) {
            setConfirming(null);
            setBusy(false);
          }
        }}
        title="Confirm action"
        description={`This will ${confirming === "cancel" ? "cancel the payroll run" : confirming === "mark-paid" ? "mark this run as paid" : confirming === "finalize" ? "finalize this run and lock payslips" : "recalculate payslips from the latest attendance and adjustments"} (${
          confirming === "mark-paid" ? "irreversible" : confirming === "cancel" ? "reversible by a new run" : "continue?"
        }).`}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setConfirming(null); setBusy(false); }}>Cancel</Button>
            <Button disabled={busy} onClick={() => confirming && void action(confirming)}>
              {busy ? "Working…" : "Confirm"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">The run will be updated. You can still add adjustments and recalculate while the run is not paid.</p>
      </Dialog>
    </div>
  );
}

function periodLabel(r: Row): string {
  const y = Number(r.year ?? new Date().getFullYear());
  const m = Number(r.month ?? 1);
  return new Date(`${y}-${m}-01`).toLocaleString("en-US", { month: "long", year: "numeric" });
}

function statusVariant(status: string): "default" | "secondary" | "success" | "warning" | "destructive" {
  if (status === "PAID") return "success";
  if (status === "FINALIZED") return "default";
  if (status === "DRAFT") return "warning";
  return "secondary";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}