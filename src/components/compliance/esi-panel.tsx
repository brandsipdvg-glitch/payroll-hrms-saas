"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Download, FileText, Landmark, Check } from "lucide-react";
import { DataTable, Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch, ApiClientError, esiConfigApi, esiRegisterApi, esiChallanApi, esiReturnApi, downloadCsv } from "@/lib/client/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PeriodPicker, Period } from "@/components/compliance/period-picker";
import { RegisterTable } from "@/components/compliance/register-table";

type Row = Record<string, unknown>;

export function EsiPanel() {
  const now = new Date();
  const [period, setPeriod] = useState<Period>({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [configs, setConfigs] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [form, setForm] = useState<Row>({
    name: "ESI configuration",
    employeeRate: "0.75",
    employerRate: "3.25",
    wageCeiling: "21000",
    wageComponents: "BASIC,HRA,CONVEYANCE,MEDICAL,SPECIAL,OT",
  });
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setConfigs(await apiFetch<Row[]>(esiConfigApi));
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load ESI configurations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refresh]);

  const activate = async (id: string) => {
    try {
      await apiFetch(`${esiConfigApi}/${id}`, { method: "PUT", body: JSON.stringify({ isCurrent: true }) });
      toast.success("ESI configuration activated.");
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Activation failed.");
    }
  };

  const create = async () => {
    try {
      await apiFetch(esiConfigApi, { method: "POST", body: JSON.stringify(form) });
      toast.success("ESI configuration created.");
      setOpen(false);
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Creation failed.");
    }
  };

  const rate = (v: unknown) => (v === "" || v === null ? "" : `${Number(v)}%`);
  const columns: Column<Row>[] = [
    { key: "name", title: "Name" },
    { key: "employeeRate", title: "Employee", render: (r) => rate(r.employeeRate) },
    { key: "employerRate", title: "Employer", render: (r) => rate(r.employerRate) },
    { key: "wageCeiling", title: "Ceiling", render: (r) => formatCurrency(Number(r.wageCeiling ?? 0)) },
    { key: "effectiveFrom", title: "Effective", render: (r) => formatDate(String(r.effectiveFrom)) },
    { key: "isCurrent", title: "Status", render: (r) => (r.isCurrent ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>) },
    { key: "id", title: "", className: "text-right", render: (r) => (r.isCurrent ? null : <Button variant="outline" size="sm" onClick={() => void activate(String(r.id))}><Check className="mr-1.5 h-3.5 w-3.5" /> Activate</Button>) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">ESI</h1>
          <p className="text-sm text-muted-foreground">Employee State Insurance contributions, returns and challan.</p>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void downloadCsv(`${esiRegisterApi}.csv`, period.month, period.year).then(() => toast.success("ESI register CSV downloaded.")).catch(() => toast.error("Download failed."))}>
          <Download className="mr-1.5 h-4 w-4" /> Register CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => void downloadCsv(esiChallanApi, period.month, period.year).then(() => toast.success("ESI challan downloaded.")).catch(() => toast.error("Download failed."))}>
          <Landmark className="mr-1.5 h-4 w-4" /> Challan summary
        </Button>
        <Button variant="outline" size="sm" onClick={() => void downloadCsv(esiReturnApi, period.month, period.year).then(() => toast.success("ESI return downloaded.")).catch(() => toast.error("Download failed."))}>
          <FileText className="mr-1.5 h-4 w-4" /> Return
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm">ESI configurations</CardTitle>
            <CardDescription>Rates and wage ceiling are configurable; apply only to eligible employees.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add configuration
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} rows={configs} loading={loading} total={configs.length} page={1} pageSize={Math.max(configs.length, 1)} onPageChange={() => undefined} empty={<>No ESI configurations yet.</>} />
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="New ESI configuration"
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
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Employee %</Label>
              <Input value={String(form.employeeRate)} onChange={(e) => setForm((f) => ({ ...f, employeeRate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Employer %</Label>
              <Input value={String(form.employerRate)} onChange={(e) => setForm((f) => ({ ...f, employerRate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Wage ceiling</Label>
              <Input value={String(form.wageCeiling)} onChange={(e) => setForm((f) => ({ ...f, wageCeiling: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Wage components (comma separated codes)</Label>
            <Input value={String(form.wageComponents)} onChange={(e) => setForm((f) => ({ ...f, wageComponents: e.target.value }))} />
          </div>
        </div>
      </Dialog>

      <RegisterTable url={esiRegisterApi} title={`ESI register · ${periodLabel(period)}`} description="Contributions computed from the active run" period={period} moneyKeys={["esiWages", "employeeContribution", "employerContribution", "totalContribution"]} refreshKey={period.month * 100 + period.year} />
    </div>
  );
}

function periodLabel(period: Period): string {
  return new Date(`${period.year}-${period.month}-01`).toLocaleString("en-US", { month: "short", year: "numeric" });
}