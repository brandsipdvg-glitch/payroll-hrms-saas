"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Download, Check } from "lucide-react";
import { DataTable, Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch, ApiClientError, lwfConfigApi, lwfRegisterApi, downloadCsv } from "@/lib/client/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PeriodPicker, Period } from "@/components/compliance/period-picker";
import { RegisterTable } from "@/components/compliance/register-table";

type Row = Record<string, unknown>;

export function LwfPanel() {
  const now = new Date();
  const [period, setPeriod] = useState<Period>({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [configs, setConfigs] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [form, setForm] = useState<Row>({ name: "LWF configuration", state: "Karnataka", employeeShare: "20", employerShare: "20" });
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setConfigs(await apiFetch<Row[]>(lwfConfigApi));
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load LWF configurations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refresh]);

  const activate = async (id: string) => {
    try {
      await apiFetch(`${lwfConfigApi}/${id}`, { method: "PUT", body: JSON.stringify({ isActive: true }) });
      toast.success("LWF configuration activated.");
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Activation failed.");
    }
  };

  const create = async () => {
    try {
      await apiFetch(lwfConfigApi, { method: "POST", body: JSON.stringify(form) });
      toast.success("LWF configuration created.");
      setOpen(false);
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Creation failed.");
    }
  };

  const columns: Column<Row>[] = [
    { key: "name", title: "Name" },
    { key: "state", title: "State" },
    { key: "employeeShare", title: "Employee", render: (r) => formatCurrency(Number(r.employeeShare ?? 0)) },
    { key: "employerShare", title: "Employer", render: (r) => formatCurrency(Number(r.employerShare ?? 0)) },
    { key: "effectiveFrom", title: "Effective", render: (r) => formatDate(String(r.effectiveFrom)) },
    { key: "isActive", title: "Status", render: (r) => (r.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>) },
    { key: "id", title: "", className: "text-right", render: (r) => (r.isActive ? null : <Button variant="outline" size="sm" onClick={() => void activate(String(r.id))}><Check className="mr-1.5 h-3.5 w-3.5" /> Activate</Button>) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Labour Welfare Fund</h1>
          <p className="text-sm text-muted-foreground">State-wise employer / employee contributions.</p>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void downloadCsv(`${lwfRegisterApi}.csv`, period.month, period.year).then(() => toast.success("LWF register downloaded.")).catch(() => toast.error("Download failed."))}>
          <Download className="mr-1.5 h-4 w-4" /> LWF register CSV
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm">LWF configurations</CardTitle>
            <CardDescription>Fixed per-head contribution per state, fully configurable.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add configuration
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} rows={configs} loading={loading} total={configs.length} page={1} pageSize={Math.max(configs.length, 1)} onPageChange={() => undefined} empty={<>No LWF configurations yet.</>} />
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="New LWF configuration"
        size="lg"
        footer={
          <Button size="sm" onClick={() => void create()}>
            Create configuration
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={String(form.name)} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>State</Label>
              <Input value={String(form.state)} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <Input value={String(form.employeeShare)} onChange={(e) => setForm((f) => ({ ...f, employeeShare: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Employer</Label>
              <Input value={String(form.employerShare)} onChange={(e) => setForm((f) => ({ ...f, employerShare: e.target.value }))} />
            </div>
          </div>
        </div>
      </Dialog>

      <RegisterTable url={lwfRegisterApi} title={`LWF register · ${periodLabel(period)}`} description="Per-head contribution recovered each month" period={period} moneyKeys={["employeeShare", "employerShare", "total"]} refreshKey={period.month * 100 + period.year} />
    </div>
  );
}

function periodLabel(period: Period): string {
  return new Date(`${period.year}-${period.month}-01`).toLocaleString("en-US", { month: "short", year: "numeric" });
}