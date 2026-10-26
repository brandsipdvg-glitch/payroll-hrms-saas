"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Check, Trash2, RefreshCw } from "lucide-react";
import { DataTable, Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch, ApiClientError, gratuityApi } from "@/lib/client/api";
import { formatCurrency } from "@/lib/utils";
import { EmployeeSelect } from "@/components/finance/employee-select";

type Row = Record<string, unknown>;

export function GratuityPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Row>({ employeeId: "", financialYear: currentFY() });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Array<Row & { employee?: { employeeCode: string; firstName: string; lastName: string } | null }>>(gratuityApi);
      setRows(
        (data ?? []).map((r) => ({
          ...r,
          employeeCode: r.employee?.employeeCode,
          employeeName: r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "",
        }))
      );
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load gratuity records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refresh]);

  const compute = async () => {
    if (!form.employeeId || !form.financialYear) {
      toast.error("Employee and financial year are required.");
      return;
    }
    try {
      await apiFetch(`${gratuityApi}/compute`, { method: "POST", body: JSON.stringify(form) });
      toast.success("Gratuity computed and stored.");
      setOpen(false);
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Computation failed.");
    }
  };

  const post = async (path: string, method = "POST") => {
    try {
      await apiFetch(path, { method });
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Operation failed.");
    }
  };

  const columns: Column<Row>[] = [
    { key: "employeeCode", title: "Employee", render: (r) => `${r.employeeCode} · ${r.employeeName ?? ""}` },
    { key: "financialYear", title: "Financial year" },
    { key: "yearsOfService", title: "Years", render: (r) => Number(r.yearsOfService) },
    { key: "basicLastDrawn", title: "Basic", className: "text-right", render: (r) => formatCurrency(Number(r.basicLastDrawn)) },
    { key: "gratuityAmount", title: "Provision", className: "text-right", render: (r) => formatCurrency(Number(r.gratuityAmount)) },
    { key: "status", title: "Status", render: (r) => (r.status === "APPROVED" ? <Badge variant="success">Approved</Badge> : <Badge variant="warning">Draft</Badge>) },
    {
      key: "actions",
      title: "",
      className: "text-right",
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          {r.status !== "APPROVED" && (
            <Button variant="outline" size="sm" onClick={() => void post(`${gratuityApi}/${r.id}/approve`)}>
              <Check className="mr-1 h-3.5 w-3.5" /> Approve
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void post(`${gratuityApi}/${r.id}`, "DELETE")}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Gratuity</h1>
          <p className="text-sm text-muted-foreground">Provisioning formula: (Basic × 15 × Years) / 26, eligible after 5 years.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRefresh((r) => r + 1)}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Compute
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Gratuity provisions</CardTitle>
          <CardDescription>Per-employee, per financial-year provision based on current basic and service period.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} rows={rows} loading={loading} total={rows.length} page={1} pageSize={Math.max(rows.length, 1)} onPageChange={() => undefined} empty={<>No gratuity records yet.</>} />
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Compute gratuity provision"
        description="Uses the employee's current basic and service to the end of the selected financial year."
        footer={
          <Button size="sm" onClick={() => void compute()}>
            Compute
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <EmployeeSelect value={String(form.employeeId)} onChange={(id) => setForm((f) => ({ ...f, employeeId: id }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Financial year</Label>
            <Input value={String(form.financialYear)} onChange={(e) => setForm((f) => ({ ...f, financialYear: e.target.value }))} placeholder="2026-27" />
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function currentFY(): string {
  const now = new Date();
  const start = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}