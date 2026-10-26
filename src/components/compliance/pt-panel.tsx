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
import { apiFetch, ApiClientError, ptRegionsApi, ptRegisterApi, ptChallanApi, downloadCsv } from "@/lib/client/api";
import { formatCurrency } from "@/lib/utils";
import { PeriodPicker, Period } from "@/components/compliance/period-picker";
import { RegisterTable } from "@/components/compliance/register-table";

type Row = Record<string, unknown>;
type SlabRow = { fromAmount: string; toAmount: string; monthlyAmount: string };

export function PtPanel() {
  const now = new Date();
  const [period, setPeriod] = useState<Period>({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [regions, setRegions] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Row>({ name: "", state: "Karnataka" });
  const [slabs, setSlabs] = useState<SlabRow[]>([
    { fromAmount: "0", toAmount: "14999", monthlyAmount: "0" },
    { fromAmount: "15000", toAmount: "19999", monthlyAmount: "150" },
    { fromAmount: "20000", toAmount: "", monthlyAmount: "200" },
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRegions(await apiFetch<Row[]>(ptRegionsApi));
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load professional tax regions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refresh]);

  const activate = async (id: string) => {
    try {
      await apiFetch(`${ptRegionsApi}/${id}`, { method: "PUT", body: JSON.stringify({ isActive: true }) });
      toast.success("PT region made active.");
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Activation failed.");
    }
  };

  const create = async () => {
    try {
      await apiFetch(ptRegionsApi, {
        method: "POST",
        body: JSON.stringify({ ...form, slabs: slabs.map((s) => ({ fromAmount: s.fromAmount, toAmount: s.toAmount || null, monthlyAmount: s.monthlyAmount })) }),
      });
      toast.success("PT region created.");
      setOpen(false);
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Creation failed.");
    }
  };

  const setSlab = (i: number, key: keyof SlabRow, val: string) => setSlabs((s) => s.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));

  const columns: Column<Row>[] = [
    { key: "name", title: "Region" },
    { key: "state", title: "State" },
    {
      key: "slabs",
      title: "Slabs",
      render: (r) => <span className="whitespace-nowrap">{String(Number((r.slabs as Array<{ monthlyAmount: unknown }> | undefined)?.length ?? 0))} slabs</span>,
    },
    { key: "effectiveFrom", title: "Effective", render: (r) => new Date(String(r.effectiveFrom)).toLocaleDateString("en-IN") },
    { key: "isActive", title: "Status", render: (r) => (r.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Inactive</Badge>) },
    { key: "id", title: "", className: "text-right", render: (r) => (r.isActive ? null : <Button variant="outline" size="sm" onClick={() => void activate(String(r.id))}><Check className="mr-1.5 h-3.5 w-3.5" /> Activate</Button>) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Professional tax</h1>
          <p className="text-sm text-muted-foreground">State-wise slabs and monthly PT recoverable from gross wages.</p>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void downloadCsv(`${ptRegisterApi}.csv`, period.month, period.year).then(() => toast.success("PT register downloaded.")).catch(() => toast.error("Download failed."))}>
          <Download className="mr-1.5 h-4 w-4" /> PT register CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => void downloadCsv(ptChallanApi, period.month, period.year).then(() => toast.success("PT challan downloaded.")).catch(() => toast.error("Download failed."))}>
          <Download className="mr-1.5 h-4 w-4" /> PT challan CSV
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm">PT regions &amp; slabs</CardTitle>
            <CardDescription>Monthly tax per gross-salary slab, per state. All values are configurable.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add region
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} rows={regions} loading={loading} total={regions.length} page={1} pageSize={Math.max(regions.length, 1)} onPageChange={() => undefined} empty={<>No PT regions yet.</>} />
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="New professional-tax region"
        size="lg"
        footer={
          <Button size="sm" onClick={() => void create()}>
            Create region
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Region name</Label>
              <Input value={String(form.name)} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Karnataka" />
            </div>
            <div className="space-y-1.5">
              <Label>State</Label>
              <Input value={String(form.state)} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Slabs</Label>
            {slabs.map((s, i) => (
              <div key={i} className="grid grid-cols-4 gap-2">
                <Input placeholder="From" value={s.fromAmount} onChange={(e) => setSlab(i, "fromAmount", e.target.value)} />
                <Input placeholder="To (blank = above)" value={s.toAmount} onChange={(e) => setSlab(i, "toAmount", e.target.value)} />
                <Input placeholder="Monthly tax" value={s.monthlyAmount} onChange={(e) => setSlab(i, "monthlyAmount", e.target.value)} />
                <Button variant="outline" size="sm" onClick={() => setSlabs((prev) => prev.filter((_, idx) => idx !== i))}>Remove</Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setSlabs((prev) => [...prev, { fromAmount: "", toAmount: "", monthlyAmount: "" }])}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add slab
            </Button>
          </div>
        </div>
      </Dialog>

      <RegisterTable url={ptRegisterApi} title={`PT register · ${periodLabel(period)}`} description="Tax recoverable per employee from the active run" period={period} moneyKeys={["grossSalary", "ptAmount"]} refreshKey={period.month * 100 + period.year} />
    </div>
  );
}

function periodLabel(period: Period): string {
  return new Date(`${period.year}-${period.month}-01`).toLocaleString("en-US", { month: "short", year: "numeric" });
}