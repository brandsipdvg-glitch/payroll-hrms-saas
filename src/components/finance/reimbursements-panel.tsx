"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Check, X, Play, RefreshCw } from "lucide-react";
import { DataTable, Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { apiFetch, ApiClientError, reimbursementsApi } from "@/lib/client/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EmployeeSelect } from "@/components/finance/employee-select";
import { RunSelect } from "@/components/finance/run-select";

type Row = Record<string, unknown>;

const TYPES = ["TRAVEL", "MEDICAL", "FUEL", "MOBILE", "INTERNET", "FOOD", "LTA"];

export function ReimbursementsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState(false);
  const [processOpen, setProcessOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [target, setTarget] = useState<Row | null>(null);
  const [runId, setRunId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [form, setForm] = useState<Row>({ employeeId: "", type: "TRAVEL", description: "", expenseDate: "", amount: "", billReference: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = status ? `?status=${status}` : "";
      const data = await apiFetch<Array<Row & { employee?: { employeeCode: string; firstName: string; lastName: string } | null }>>(`${reimbursementsApi}${qs}`);
      setRows(
        (data ?? []).map((r) => ({
          ...r,
          employeeCode: r.employee?.employeeCode,
          employeeName: r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "",
        }))
      );
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load reimbursements.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load, refresh]);

  const run = async (action: string, id: string, body?: Record<string, unknown>) => {
    try {
      await apiFetch(`${reimbursementsApi}/${id}/${action}`, { method: "POST", body: JSON.stringify(body ?? {}) });
      toast.success("Claim updated.");
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Operation failed.");
    }
  };

  const create = async () => {
    if (!form.employeeId || !form.description || !form.expenseDate || !form.amount) {
      toast.error("Employee, description, date and amount are required.");
      return;
    }
    try {
      await apiFetch(reimbursementsApi, { method: "POST", body: JSON.stringify(form) });
      toast.success("Reimbursement created.");
      setOpen(false);
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Creation failed.");
    }
  };

  const process = async () => {
    if (!target || !runId) {
      toast.error("Select a payroll run.");
      return;
    }
    try {
      await apiFetch(`${reimbursementsApi}/${target.id}/process`, { method: "POST", body: JSON.stringify({ runId }) });
      toast.success("Claim processed into payroll run.");
      setProcessOpen(false);
      setRunId("");
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Processing failed.");
    }
  };

  const statusBadge = (s: string) => {
    if (s === "APPROVED") return <Badge variant="success">Approved</Badge>;
    if (s === "REJECTED") return <Badge variant="destructive">Rejected</Badge>;
    if (s === "PROCESSED") return <Badge variant="default">Processed</Badge>;
    return <Badge variant="warning">Submitted</Badge>;
  };

  const columns: Column<Row>[] = [
    { key: "employeeCode", title: "Employee", render: (r) => `${r.employeeCode} · ${r.employeeName ?? ""}` },
    { key: "type", title: "Type", render: (r) => String(r.type).split("_").join(" ") },
    { key: "description", title: "Description" },
    { key: "expenseDate", title: "Date", render: (r) => formatDate(String(r.expenseDate)) },
    { key: "amount", title: "Amount", className: "text-right", render: (r) => formatCurrency(Number(r.amount)) },
    { key: "status", title: "Status", render: (r) => statusBadge(String(r.status)) },
    {
      key: "actions",
      title: "",
      className: "text-right",
      render: (r) => {
        const s = String(r.status);
        return (
          <div className="flex justify-end gap-1.5">
            {s === "SUBMITTED" && (
              <>
                <Button variant="outline" size="sm" onClick={() => void run("approve", String(r.id))}>
                  <Check className="mr-1 h-3.5 w-3.5" /> Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTarget(r);
                    setRejectReason("");
                    setRejectOpen(true);
                  }}
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Reject
                </Button>
              </>
            )}
            {s === "APPROVED" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTarget(r);
                  setRunId("");
                  setProcessOpen(true);
                }}
              >
                <Play className="mr-1 h-3.5 w-3.5" /> Process
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Reimbursements</h1>
          <p className="text-sm text-muted-foreground">Employee claims — Travel, Medical, Fuel, Mobile, Internet, Food, LTA.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44">
            <option value="">All statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="PROCESSED">Processed</option>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setRefresh((r) => r + 1)}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New claim
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Claims</CardTitle>
          <CardDescription>Approve → process into a draft payroll run (recalc to reflect on payslips).</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} rows={rows} loading={loading} total={rows.length} page={1} pageSize={Math.max(rows.length, 1)} onPageChange={() => undefined} empty={<>No reimbursements found.</>} />
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="New reimbursement"
        size="lg"
        footer={
          <Button size="sm" onClick={() => void create()}>
            Create claim
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
              <Select value={String(form.type)} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Expense date</Label>
              <Input type="date" value={String(form.expenseDate)} onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={String(form.description)} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount (₹)</Label>
              <Input type="number" min="0" step="0.01" value={String(form.amount)} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Bill reference</Label>
              <Input value={String(form.billReference)} onChange={(e) => setForm((f) => ({ ...f, billReference: e.target.value }))} />
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={processOpen}
        onOpenChange={setProcessOpen}
        title="Process claim into payroll"
        description={target ? `Approved ${String(target.type)} claim of ${formatCurrency(Number(target.amount))}.` : undefined}
        footer={
          <Button size="sm" onClick={() => void process()}>
            Process into run
          </Button>
        }
      >
        <div className="space-y-1.5">
          <Label>Payroll run</Label>
          <RunSelect
            value={runId}
            onChange={setRunId}
            label={(run) => `${String(run.month).padStart(2, "0")}/${run.year} · ${run.status}`}
          />
        </div>
      </Dialog>

      <Dialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject claim"
        footer={
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (!target) return;
              void run("reject", String(target.id), { reason: rejectReason });
              setRejectOpen(false);
            }}
          >
            Reject
          </Button>
        }
      >
        <div className="space-y-1.5">
          <Label>Rejection reason</Label>
          <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Optional" />
        </div>
      </Dialog>
    </div>
  );
}