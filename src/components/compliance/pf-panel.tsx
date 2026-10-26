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
import { apiFetch, ApiClientError, pfConfigApi, pfRegisterApi, pfEcrApi, pfChallanApi, downloadCsv } from "@/lib/client/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PeriodPicker, Period } from "@/components/compliance/period-picker";
import { RegisterTable } from "@/components/compliance/register-table";

type Row = Record<string, unknown>;

export function PfPanel() {
  const now = new Date();
  const [period, setPeriod] = useState<Period>({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [configs, setConfigs] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [form, setForm] = useState<Row>({
    name: "PF configuration",
    employeeRate: "12",
    employerRate: "12",
    epsRate: "8.33",
    epfRate: "3.67",
    wageCeiling: "15000",
    pensionWageCeiling: "15000",
    wageComponents: "BASIC,CONVEYANCE,MEDICAL",
  });
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setConfigs(await apiFetch<Row[]>(pfConfigApi));
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load PF configurations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refresh]);

  const activate = async (id: string) => {
    try {
      await apiFetch(`${pfConfigApi}/${id}`, { method: "PUT", body: JSON.stringify({ isCurrent: true }) });
      toast.success("PF configuration activated.");
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Activation failed.");
    }
  };

  const create = async () => {
    try {
      await apiFetch(pfConfigApi, { method: "POST", body: JSON.stringify(form) });
      toast.success("PF configuration created.");
      setOpen(false);
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Creation failed.");
    }
  };

  const num = (v: unknown) => (v === "" || v === null ? "" : formatCurrency(Number(v)));
  const rate = (v: unknown) => (v === "" || v === null ? "" : `${Number(v)}%`);

  const columns: Column<Row>[] = [
    { key: "name", title: "Name" },
    { key: "employeeRate", title: "Employee", render: (r) => rate(r.employeeRate) },
    { key: "employerRate", title: "Employer", render: (r) => rate(r.employerRate) },
    { key: "epsRate", title: "EPS", render: (r) => rate(r.epsRate) },
    { key: "epfRate", title: "EPF", render: (r) => rate(r.epfRate) },
    { key: "wageCeiling", title: "Ceiling", render: (r) => num(r.wageCeiling) },
    { key: "effectiveFrom", title: "Effective", render: (r) => formatDate(String(r.effectiveFrom)) },
    {
      key: "isCurrent",
      title: "Status",
      render: (r) => (r.isCurrent ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
    {
      key: "id",
      title: "",
      className: "text-right",
      render: (r) =>
        r.isCurrent ? null : (
          <Button variant="outline" size="sm" onClick={() => void activate(String(r.id))}>
            <Check className="mr-1.5 h-3.5 w-3.5" /> Activate
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Provident Fund / EPS</h1>
          <p className="text-sm text-muted-foreground">EPF rules, employer &amp; employee contributions, ECR and challan.</p>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void downloadCsv(`${pfRegisterApi}.csv`, period.month, period.year).then(() => toast.success("PF register CSV downloaded.")).catch(() => toast.error("Download failed."))}>
          <Download className="mr-1.5 h-4 w-4" /> PF register CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => void downloadCsv(pfEcrApi, period.month, period.year).then(() => toast.success("ECR CSV downloaded.")).catch(() => toast.error("Download failed."))}>
          ECR (electronic return)
        </Button>
        <Button variant="outline" size="sm" onClick={() => void downloadCsv(pfChallanApi, period.month, period.year).then(() => toast.success("PF challan downloaded.")).catch(() => toast.error("Download failed."))}>
          Challan summary
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm">PF configurations</CardTitle>
            <CardDescription>Rates and ceilings are fully configurable and versioned by effective date.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add configuration
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} rows={configs} loading={loading} total={configs.length} page={1} pageSize={Math.max(configs.length, 1)} onPageChange={() => undefined} empty={<>No PF configurations yet.</>} />
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="New PF configuration"
        size="lg"
        footer={
          <Button size="sm" onClick={() => void create()}>
            Create configuration
          </Button>
        }
      >
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={String(form.name)} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Employee %" value={form.employeeRate} onChange={(v) => setForm((f) => ({ ...f, employeeRate: v }))} />
            <Field label="Employer %" value={form.employerRate} onChange={(v) => setForm((f) => ({ ...f, employerRate: v }))} />
            <Field label="EPS %" value={form.epsRate} onChange={(v) => setForm((f) => ({ ...f, epsRate: v }))} />
            <Field label="EPF %" value={form.epfRate} onChange={(v) => setForm((f) => ({ ...f, epfRate: v }))} />
            <Field label="Wage ceiling" value={form.wageCeiling} onChange={(v) => setForm((f) => ({ ...f, wageCeiling: v }))} />
            <Field label="Pension ceiling" value={form.pensionWageCeiling} onChange={(v) => setForm((f) => ({ ...f, pensionWageCeiling: v }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Wage components (comma separated codes)</Label>
            <Input value={String(form.wageComponents)} onChange={(e) => setForm((f) => ({ ...f, wageComponents: e.target.value }))} />
          </div>
        </div>
      </Dialog>

      <RegisterTable url={pfRegisterApi} title={`PF register · ${periodLabel(period)}`} description="Contributions computed from the active run" period={period} moneyKeys={["pfWages", "effectiveWages", "memberContribution", "epsContribution", "epfContribution", "employerContribution", "totalContribution"]} refreshKey={period.month * 100 + period.year} />
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: unknown; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function periodLabel(period: Period): string {
  return new Date(`${period.year}-${period.month}-01`).toLocaleString("en-US", { month: "short", year: "numeric" });
}
