"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch, payrollRunsApi, ApiClientError } from "@/lib/client/api";
import { formatCurrency, formatDate } from "@/lib/utils";

type Row = Record<string, unknown>;

export function RunsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [payrollDays, setPayrollDays] = useState("30");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [runToDelete, setRunToDelete] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<Row[]>(payrollRunsApi);
      setRows(res);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load payroll runs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!month || !year) {
      toast.error("Select month and year.");
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch<Row>(payrollRunsApi, {
        method: "POST",
        body: JSON.stringify({ month: Number(month), year: Number(year), payrollDays: Number(payrollDays) || 30, notes }),
      });
      toast.success(`Payroll run created with ${String((res.payslips as Row[] | undefined)?.length ?? 0)} payslips.`);
      setCreateOpen(false);
      await load();
      const runId = (res.run as Row)?.id ?? (res as Row).id;
      if (runId) window.location.href = `/payroll/runs/${String(runId)}`;
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to create payroll run.");
    } finally {
      setCreating(false);
    }
  }

  async function deleteDraftRun() {
    if (!runToDelete?.id) return;
    setDeleting(true);
    try {
      await apiFetch(`${payrollRunsApi}/${String(runToDelete.id)}`, { method: "DELETE" });
      toast.success(`Deleted ${periodLabel(runToDelete)} payroll run.`);
      setRunToDelete(null);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to delete payroll run.");
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<Row>[] = [
    {
      key: "period",
      title: "Period",
      render: (r) => (
        <div>
          <p className="font-medium">{periodLabel(r)}</p>
          <p className="text-xs text-muted-foreground">{Number(r.payrollDays)} pay days</p>
        </div>
      ),
    },
    {
      key: "status",
      title: "Status",
      render: (r) => <Badge variant={statusVariant(String(r.status))}>{String(r.status)}</Badge>,
    },
    { key: "payslips", title: "Payslips", render: (r) => <span>{Number((r._count as Row | undefined)?.payslips ?? 0)}</span> },
    { key: "totalGross", title: "Gross", render: (r) => <span>{formatCurrency(Number(r.totalGross))}</span> },
    { key: "totalDeductions", title: "Deductions", render: (r) => <span>{formatCurrency(Number(r.totalDeductions))}</span> },
    { key: "totalNet", title: "Net pay", render: (r) => <span className="font-semibold">{formatCurrency(Number(r.totalNet))}</span> },
    { key: "createdAt", title: "Created", render: (r) => <span>{formatDate(r.createdAt as string)}</span> },
    {
      key: "actions",
      title: "",
      render: (r) => (
        <div className="flex justify-end gap-2">
          <Link href={`/payroll/runs/${String(r.id)}`}>
            <Button variant="outline" size="sm">
              Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
          {r.status === "DRAFT" ? (
            <Button variant="destructive" size="sm" onClick={() => setRunToDelete(r)}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Payroll runs</h1>
          <p className="text-sm text-muted-foreground">
            Create a monthly run to generate payslips, then finalize, pay and export outputs.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/payroll/payslips">
            <Button variant="outline" size="sm">All payslips</Button>
          </Link>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New run
          </Button>
        </div>
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} total={rows.length} page={1} pageSize={rows.length || 1} onPageChange={() => undefined} empty="No payroll runs yet. Create one to process salaries." />

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create payroll run"
        description="Generates a draft run and creates payslips for every employee on an active salary structure for the period."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={creating} onClick={() => void create()}>
              {creating ? "Processing…" : "Create run"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Month">
            <Select value={month} onChange={(e) => setMonth(e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={String(m)}>
                  {new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "long" })}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Year">
            <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </Field>
          <Field label="Pay days">
            <Input type="number" value={payrollDays} onChange={(e) => setPayrollDays(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label className="text-xs">Notes (optional)</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. March payroll, includes travel reimbursement" />
        </div>
      </Dialog>

      <Dialog
        open={!!runToDelete}
        onOpenChange={(open) => !open && !deleting && setRunToDelete(null)}
        title="Delete draft payroll run?"
        description={`This permanently deletes the ${runToDelete ? periodLabel(runToDelete) : "selected"} draft run and its ${Number((runToDelete?._count as Row | undefined)?.payslips ?? 0)} generated payslip(s). This cannot be undone.`}
        footer={
          <>
            <Button variant="ghost" disabled={deleting} onClick={() => setRunToDelete(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void deleteDraftRun()}>
              {deleting ? "Deleting…" : "Delete run"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">Only draft runs can be deleted. Finalized or paid runs must be cancelled instead.</p>
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
