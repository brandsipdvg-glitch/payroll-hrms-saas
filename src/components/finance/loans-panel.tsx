"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Check, Play, X, ListChecks, RefreshCw } from "lucide-react";
import { DataTable, Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { apiFetch, ApiClientError, loansApi } from "@/lib/client/api";
import { formatCurrency } from "@/lib/utils";
import { EmployeeSelect } from "@/components/finance/employee-select";
import { RunSelect, RunOption } from "@/components/finance/run-select";

type Row = Record<string, unknown>;
type EmiRow = { year: number; month: number; openingBalance: string | number; principal: string | number; interest: string | number; total: string | number; closingBalance: string | number; status: string };

export function LoansPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [viewTarget, setViewTarget] = useState<Row | null>(null);
  const [emis, setEmis] = useState<EmiRow[]>([]);
  const [target, setTarget] = useState<Row | null>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [runId, setRunId] = useState("");
  const [form, setForm] = useState<Row>({ employeeId: "", loanType: "EMPLOYEE_LOAN", principalAmount: "", interestRateAnnual: "10", tenureMonths: "12", startMonth: String(new Date().getMonth() + 1), startYear: String(new Date().getFullYear()), description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Array<Row & { employee?: { employeeCode: string; firstName: string; lastName: string } | null }>>(loansApi);
      setRows(
        (data ?? []).map((r) => ({
          ...r,
          employeeCode: r.employee?.employeeCode,
          employeeName: r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "",
        }))
      );
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load loans.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refresh]);

  const post = async (path: string, body?: Record<string, unknown>) => {
    try {
      await apiFetch(path, { method: "POST", body: JSON.stringify(body ?? {}) });
      setRefresh((r) => r + 1);
      return true;
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Operation failed.");
      return false;
    }
  };

  const create = async () => {
    if (!form.employeeId || !form.principalAmount || !form.tenureMonths) {
      toast.error("Employee, principal and tenure are required.");
      return;
    }
    try {
      await apiFetch(loansApi, { method: "POST", body: JSON.stringify(form) });
      toast.success("Loan created with EMI schedule.");
      setOpen(false);
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Creation failed.");
    }
  };

  const showEmis = async (loan: Row) => {
    try {
      const detail = await apiFetch<{ emis?: EmiRow[] }>(`${loansApi}/${loan.id}`);
      setEmis(detail?.emis ?? []);
      setViewTarget(loan);
      setViewOpen(true);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load EMI schedule.");
    }
  };

  const processEmis = async () => {
    if (!target || !runId) {
      toast.error("Select a payroll run.");
      return;
    }
    const okRes = await post(`${loansApi}/${target.id}/process-emis`, { year: Number(year), month: Number(month), runId });
    if (okRes) {
      toast.success("EMI recovered into payroll run.");
      setRecoverOpen(false);
    }
  };

  const statusBadge = (s: string) => {
    if (s === "ACTIVE") return <Badge variant="success">Active</Badge>;
    if (s === "CLOSED") return <Badge variant="default">Closed</Badge>;
    if (s === "CANCELLED") return <Badge variant="destructive">Cancelled</Badge>;
    return <Badge variant="warning">Approved</Badge>;
  };

  const columns: Column<Row>[] = [
    { key: "employeeCode", title: "Employee", render: (r) => `${r.employeeCode} · ${r.employeeName ?? ""}` },
    { key: "loanType", title: "Type", render: (r) => String(r.loanType).split("_").join(" ") },
    { key: "principalAmount", title: "Principal", className: "text-right", render: (r) => formatCurrency(Number(r.principalAmount)) },
    { key: "interestRateAnnual", title: "Rate", render: (r) => `${Number(r.interestRateAnnual)}%` },
    { key: "tenureMonths", title: "Tenure", render: (r) => `${r.tenureMonths} mo` },
    { key: "emiAmount", title: "EMI", className: "text-right", render: (r) => formatCurrency(Number(r.emiAmount)) },
    {
      key: "status", title: "Status", render: (r) => statusBadge(String(r.status)),
    },
    {
      key: "actions",
      title: "",
      className: "text-right",
      render: (r) => {
        const s = String(r.status);
        return (
          <div className="flex justify-end gap-1.5">
            <Button variant="outline" size="sm" onClick={() => void showEmis(r)} title="EMI schedule">
              <ListChecks className="mr-1 h-3.5 w-3.5" /> EMIs
            </Button>
            {s === "APPROVED" && (
              <Button variant="outline" size="sm" onClick={() => void post(`${loansApi}/${r.id}/activate`)}>
                <Check className="mr-1 h-3.5 w-3.5" /> Activate
              </Button>
            )}
            {s === "APPROVED" && (
              <Button variant="outline" size="sm" onClick={() => void post(`${loansApi}/${r.id}/cancel`)}>
                <X className="mr-1 h-3.5 w-3.5" /> Cancel
              </Button>
            )}
            {s === "ACTIVE" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTarget(r);
                  setRunId("");
                  setRecoverOpen(true);
                }}
              >
                <Play className="mr-1 h-3.5 w-3.5" /> Recover EMI
              </Button>
            )}
            {s === "ACTIVE" && (
              <Button variant="outline" size="sm" onClick={() => void post(`${loansApi}/${r.id}/close`)}>
                <Check className="mr-1 h-3.5 w-3.5" /> Close
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const emiColumns: Column<EmiRow>[] = [
    { key: "month", title: "Period", render: (r) => `${String(r.month).padStart(2, "0")}/${r.year}` },
    { key: "openingBalance", title: "Opening", className: "text-right", render: (r) => formatCurrency(Number(r.openingBalance)) },
    { key: "principal", title: "Principal", className: "text-right", render: (r) => formatCurrency(Number(r.principal)) },
    { key: "interest", title: "Interest", className: "text-right", render: (r) => formatCurrency(Number(r.interest)) },
    { key: "total", title: "Total", className: "text-right", render: (r) => formatCurrency(Number(r.total)) },
    { key: "closingBalance", title: "Balance", className: "text-right", render: (r) => formatCurrency(Number(r.closingBalance)) },
    { key: "status", title: "Status", render: (r) => (r.status === "PAID" ? <Badge variant="success">Paid</Badge> : <Badge variant="warning">Pending</Badge>) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Loans & Salary Advances</h1>
          <p className="text-sm text-muted-foreground">EMI schedules generated from the standard formula; recover into payroll runs.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRefresh((r) => r + 1)}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New loan
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Loans</CardTitle>
          <CardDescription>EMI = P·r·(1+r)ⁿ / ((1+r)ⁿ − 1). Recovered EMIs become a LOAN_RECOVERY deduction on the payslip.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} rows={rows} loading={loading} total={rows.length} page={1} pageSize={Math.max(rows.length, 1)} onPageChange={() => undefined} empty={<>No loans yet.</>} />
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="New loan / advance"
        size="lg"
        footer={
          <Button size="sm" onClick={() => void create()}>
            Create loan
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <EmployeeSelect value={String(form.employeeId)} onChange={(id) => setForm((f) => ({ ...f, employeeId: id }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={String(form.loanType)} onChange={(e) => setForm((f) => ({ ...f, loanType: e.target.value }))}>
                <option value="EMPLOYEE_LOAN">Employee Loan</option>
                <option value="SALARY_ADVANCE">Salary Advance</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Principal (₹)</Label>
              <Input type="number" min="0" step="0.01" value={String(form.principalAmount)} onChange={(e) => setForm((f) => ({ ...f, principalAmount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Annual interest (%)</Label>
              <Input type="number" min="0" step="0.01" value={String(form.interestRateAnnual)} onChange={(e) => setForm((f) => ({ ...f, interestRateAnnual: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Tenure (months)</Label>
              <Input type="number" min="1" value={String(form.tenureMonths)} onChange={(e) => setForm((f) => ({ ...f, tenureMonths: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Start month</Label>
              <Select value={String(form.startMonth)} onChange={(e) => setForm((f) => ({ ...f, startMonth: e.target.value }))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Start year</Label>
              <Input type="number" value={String(form.startYear)} onChange={(e) => setForm((f) => ({ ...f, startYear: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={String(form.description)} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={viewOpen}
        onOpenChange={setViewOpen}
        title="EMI schedule"
        description={viewTarget ? `${viewTarget.employeeName ?? ""} · ${viewTarget.loanType}` : undefined}
        size="lg"
      >
        <DataTable columns={emiColumns} rows={emis} loading={false} total={emis.length} page={1} pageSize={Math.max(emis.length, 1)} onPageChange={() => undefined} empty={<>No EMI schedule.</>} />
      </Dialog>

      <Dialog
        open={recoverOpen}
        onOpenChange={setRecoverOpen}
        title="Recover EMI into payroll"
        description={target ? `Recover the ${String(month).padStart(2, "0")}/${year} EMI into a draft run.` : undefined}
        footer={
          <Button size="sm" onClick={() => void processEmis()}>
            Recover into run
          </Button>
        }
      >
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Year</Label>
            <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Month</Label>
            <Select value={month} onChange={(e) => setMonth(e.target.value)}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Payroll run</Label>
            <RunSelect value={runId} onChange={setRunId} label={(run: RunOption) => `${String(run.month).padStart(2, "0")}/${run.year} · ${run.status}`} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}