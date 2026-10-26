"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Check, Play, X, Sparkles, Eye, RefreshCw, Trash2 } from "lucide-react";
import { DataTable, Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { apiFetch, ApiClientError, bonusPlansApi } from "@/lib/client/api";
import { formatCurrency } from "@/lib/utils";
import { EmployeeSelect } from "@/components/finance/employee-select";
import { RunSelect } from "@/components/finance/run-select";

type Row = Record<string, unknown>;
type AllocRow = { employeeId: string; amount: string; reason: string };

export function BonusPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [open, setOpen] = useState(false);
  const [statutoryOpen, setStatutoryOpen] = useState(false);
  const [processOpen, setProcessOpen] = useState(false);
  const [viewPlan, setViewPlan] = useState<Row | null>(null);
  const [target, setTarget] = useState<Row | null>(null);
  const [runId, setRunId] = useState("");
  const [form, setForm] = useState<Row>({ type: "FESTIVAL", title: "", month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) });
  const [allocations, setAllocations] = useState<AllocRow[]>([{ employeeId: "", amount: "", reason: "" }]);
  const [statForm, setStatForm] = useState<Row>({ title: "Statutory Bonus", month: String(new Date().getMonth() + 1), year: String(new Date().getFullYear()) });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Row[]>(bonusPlansApi);
      setRows(data ?? []);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load bonus plans.");
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
    if (!form.title) {
      toast.error("Title is required.");
      return;
    }
    const clean = allocations.filter((a) => a.employeeId && a.amount);
    if (!clean.length) {
      toast.error("Add at least one allocation.");
      return;
    }
    try {
      await apiFetch(bonusPlansApi, {
        method: "POST",
        body: JSON.stringify({ ...form, allocations: clean.map((a) => ({ employeeId: a.employeeId, amount: Number(a.amount), reason: a.reason || null })) }),
      });
      toast.success("Bonus plan created.");
      setOpen(false);
      setAllocations([{ employeeId: "", amount: "", reason: "" }]);
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Creation failed.");
    }
  };

  const generateStatutory = async () => {
    try {
      await apiFetch(`${bonusPlansApi}/statutory`, { method: "POST", body: JSON.stringify(statForm) });
      toast.success("Statutory bonus plan generated for eligible employees.");
      setStatutoryOpen(false);
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Generation failed.");
    }
  };

  const process = async () => {
    if (!target || !runId) {
      toast.error("Select a payroll run.");
      return;
    }
    if (await post(`${bonusPlansApi}/${target.id}/process`, { runId })) {
      toast.success("Bonus processed into payroll run.");
      setProcessOpen(false);
    }
  };

  const statusBadge = (s: string) => {
    if (s === "APPROVED") return <Badge variant="success">Approved</Badge>;
    if (s === "PROCESSED") return <Badge variant="default">Processed</Badge>;
    if (s === "CANCELLED") return <Badge variant="destructive">Cancelled</Badge>;
    return <Badge variant="warning">Draft</Badge>;
  };

  const columns: Column<Row>[] = [
    { key: "title", title: "Title" },
    { key: "type", title: "Type", render: (r) => String(r.type).toLowerCase() },
    { key: "period", title: "Period", render: (r) => (r.year ? `${r.month ? String(r.month).padStart(2, "0") + "/" : ""}${r.year}` : "—") },
    { key: "totalAmount", title: "Total", className: "text-right", render: (r) => formatCurrency(Number(r.totalAmount)) },
    { key: "status", title: "Status", render: (r) => statusBadge(String(r.status)) },
    { key: "count", title: "Employees", render: (r) => (r.allocations as unknown[])?.length ?? 0, className: "text-right" },
    {
      key: "actions",
      title: "",
      className: "text-right",
      render: (r) => {
        const s = String(r.status);
        return (
          <div className="flex justify-end gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setViewPlan(r)}>
              <Eye className="mr-1 h-3.5 w-3.5" /> View
            </Button>
            {s === "DRAFT" && (
              <Button variant="outline" size="sm" onClick={() => void post(`${bonusPlansApi}/${r.id}/approve`)}>
                <Check className="mr-1 h-3.5 w-3.5" /> Approve
              </Button>
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
            {(s === "DRAFT" || s === "APPROVED") && (
              <Button variant="outline" size="sm" onClick={() => void post(`${bonusPlansApi}/${r.id}/cancel`)}>
                <X className="mr-1 h-3.5 w-3.5" /> Cancel
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
          <h1 className="text-xl font-semibold">Bonuses</h1>
          <p className="text-sm text-muted-foreground">Statutory (8.33% of eligible wage), Festival and Performance bonus plans.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRefresh((r) => r + 1)}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStatutoryOpen(true)}>
            <Sparkles className="mr-1.5 h-4 w-4" /> Generate statutory
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> New plan
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Bonus plans</CardTitle>
          <CardDescription>Approve a plan, then process it into a draft payroll run.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} rows={rows} loading={loading} total={rows.length} page={1} pageSize={Math.max(rows.length, 1)} onPageChange={() => undefined} empty={<>No bonus plans yet.</>} />
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="New bonus plan"
        size="lg"
        footer={
          <Button size="sm" onClick={() => void create()}>
            Create plan
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={String(form.type)} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                <option value="FESTIVAL">Festival</option>
                <option value="PERFORMANCE">Performance</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Month</Label>
              <Select value={String(form.month)} onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Input type="number" value={String(form.year)} onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={String(form.title)} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Allocations</Label>
              <Button variant="outline" size="sm" onClick={() => setAllocations((a) => [...a, { employeeId: "", amount: "", reason: "" }])}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add row
              </Button>
            </div>
            {allocations.map((alloc, i) => (
              <div key={i} className="grid grid-cols-[1fr_130px_1fr_36px] items-end gap-2 rounded-md border p-2">
                <div className="space-y-1">
                  <Label className="text-xs">Employee</Label>
                  <EmployeeSelect value={alloc.employeeId} onChange={(id) => setAllocations((a) => a.map((x, j) => (j === i ? { ...x, employeeId: id } : x)))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Amount</Label>
                  <Input type="number" min="0" step="0.01" value={alloc.amount} onChange={(e) => setAllocations((a) => a.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reason</Label>
                  <Input value={alloc.reason} onChange={(e) => setAllocations((a) => a.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))} />
                </div>
                <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => setAllocations((a) => a.filter((_, j) => j !== i))} disabled={allocations.length === 1}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Dialog>

      <Dialog
        open={statutoryOpen}
        onOpenChange={setStatutoryOpen}
        title="Generate statutory bonus"
        description="Creates allocations of ~8.33% of basic for all eligible (≤₹21,000) active employees."
        footer={
          <Button size="sm" onClick={() => void generateStatutory()}>
            Generate plan
          </Button>
        }
      >
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={String(statForm.title)} onChange={(e) => setStatForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Month</Label>
            <Select value={String(statForm.month)} onChange={(e) => setStatForm((f) => ({ ...f, month: e.target.value }))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Year</Label>
            <Input type="number" value={String(statForm.year)} onChange={(e) => setStatForm((f) => ({ ...f, year: e.target.value }))} />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!viewPlan}
        onOpenChange={(o) => !o && setViewPlan(null)}
        title="Bonus plan"
        description={viewPlan ? `${viewPlan.title} · ${String(viewPlan.status).toLowerCase()}` : undefined}
        size="lg"
      >
        {viewPlan ? (
          <DataTable
            columns={[
              { key: "employeeCode", title: "Employee", render: (r) => `${r.employeeCode} · ${r.employeeName ?? ""}` },
              { key: "baseWage", title: "Base wage", className: "text-right", render: (r) => formatCurrency(Number(r.baseWage)) },
              { key: "amount", title: "Amount", className: "text-right", render: (r) => formatCurrency(Number(r.amount)) },
              { key: "reason", title: "Reason" },
              { key: "status", title: "Paid", render: (r) => (r.runId ? <Badge variant="success">Processed</Badge> : <Badge variant="warning">Pending</Badge>) },
            ]}
            rows={(viewPlan.allocations as unknown[] ?? []).map((a) => {
              const alloc = a as Row & { employee?: { employeeCode: string; firstName: string; lastName: string } | null };
              return { ...alloc, employeeCode: alloc.employee?.employeeCode, employeeName: alloc.employee ? `${alloc.employee.firstName} ${alloc.employee.lastName}` : "" } as Row;
            })}
            loading={false}
            total={(viewPlan.allocations as unknown[])?.length ?? 0}
            page={1}
            pageSize={Math.max((viewPlan.allocations as unknown[])?.length ?? 0, 1)}
            onPageChange={() => undefined}
            empty={<>No allocations.</>}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={processOpen}
        onOpenChange={setProcessOpen}
        title="Process bonus into payroll"
        footer={
          <Button size="sm" onClick={() => void process()}>
            Process into run
          </Button>
        }
      >
        <div className="space-y-1.5">
          <Label>Payroll run</Label>
          <RunSelect value={runId} onChange={setRunId} label={(run) => `${String(run.month).padStart(2, "0")}/${run.year} · ${run.status}`} />
        </div>
      </Dialog>
    </div>
  );
}