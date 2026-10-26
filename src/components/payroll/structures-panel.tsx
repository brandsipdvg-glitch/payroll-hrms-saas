"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Pencil, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch, listResource, payComponentsApi, salaryStructuresApi, employeesApi, ApiClientError } from "@/lib/client/api";
import { formatCurrency, formatDate } from "@/lib/utils";

type Row = Record<string, unknown>;

interface Comp {
  payComponentId: string;
  code: string;
  name: string;
  componentType: string;
  calcType: string;
  value: string;
  percent: string;
  formula: string;
}

export function StructuresPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [employees, setEmployees] = useState<Row[]>([]);
  const [masters, setMasters] = useState<Row[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [comps, setComps] = useState<Comp[]>([]);
  const [preview, setPreview] = useState<{ earnings: Row[]; deductions: Row[]; perDay: number } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<Row[]>(salaryStructuresApi);
      setRows(res);
      const [empRes, compRes] = await Promise.all([
        listResource<Row>(employeesApi, { pageSize: 1000 }),
        apiFetch<Row[]>(payComponentsApi),
      ]);
      setEmployees(empRes.data ?? []);
      setMasters(compRes);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load salary structures.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "Primary", effectiveFrom: new Date().toISOString().slice(0, 10), grossSalary: "", paymentMode: "BANK", employeeId: "" });
    setComps(masters.map((m) => ({
      payComponentId: String(m.id),
      code: String(m.code),
      name: String(m.name),
      componentType: String(m.componentType),
      calcType: String(m.calcType),
      value: String(m.calcType === "FIXED" ? (m.defaultValue ?? 0) : ""),
      percent: String(m.percent ?? ""),
      formula: String(m.formula ?? ""),
    })));
    setPreview(null);
    setDialogOpen(true);
  }

  function openEdit(row: Row) {
    setEditing(row);
    const compsList = (row.components as Row[] | undefined) ?? [];
    setForm({
      name: String(row.name ?? "Primary"),
      effectiveFrom: String(row.effectiveFrom ?? new Date().toISOString().slice(0, 10)),
      grossSalary: String(Number(row.grossSalary ?? 0)),
      paymentMode: String(row.paymentMode ?? "BANK"),
      employeeId: String(row.employeeId ?? ""),
    });
    if (compsList.length) {
      setComps(compsList.map((c) => ({
        payComponentId: String(c.payComponentId),
        code: String((c.payComponent as Row | undefined)?.code ?? ""),
        name: String((c.payComponent as Row | undefined)?.name ?? ""),
        componentType: String((c.payComponent as Row | undefined)?.componentType ?? "EARNING"),
        calcType: String(c.calcType ?? (c.payComponent as Row | undefined)?.calcType ?? "FIXED"),
        value: c.value !== null && c.value !== undefined ? String(c.value) : "",
        percent: c.percent !== null && c.percent !== undefined ? String(c.percent) : "",
        formula: String(c.formula ?? ""),
      })));
    } else {
      setComps(masters.map((m) => ({
        payComponentId: String(m.id),
        code: String(m.code),
        name: String(m.name),
        componentType: String(m.componentType),
        calcType: String(m.calcType),
        value: "",
        percent: String(m.percent ?? ""),
        formula: String(m.formula ?? ""),
      })));
    }
    setPreview(null);
    setDialogOpen(true);
  }

  async function runPreview() {
    if (!Number(form.grossSalary ?? 0)) {
      toast.error("Enter a gross salary to preview.");
      return;
    }
    setPreviewing(true);
    try {
      const res = await apiFetch<{ earnings: Row[]; deductions: Row[]; perDay: number }>("/api/v1/payroll/structures/preview", {
        method: "POST",
        body: JSON.stringify({ grossSalary: Number(form.grossSalary), payrollDays: 30, components: comps }),
      });
      setPreview(res);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Preview failed.");
    } finally {
      setPreviewing(false);
    }
  }

  async function save() {
    if (!form.employeeId || !Number(form.grossSalary ?? 0)) {
      toast.error("Select an employee and enter gross salary.");
      return;
    }
    const payload = {
      ...form,
      grossSalary: Number(form.grossSalary),
      components: comps.map((c) => ({
        payComponentId: c.payComponentId,
        calcType: c.calcType,
        formula: c.formula,
        percent: c.percent ? Number(c.percent) : undefined,
        value: c.value !== "" ? Number(c.value) : undefined,
      })),
    };
    try {
      if (editing) {
        await apiFetch(`${salaryStructuresApi}/${String(editing.id)}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast.success("Salary structure updated.");
      } else {
        await apiFetch(salaryStructuresApi, { method: "POST", body: JSON.stringify(payload) });
        toast.success("Salary structure created.");
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to save salary structure.");
    }
  }

  const columns: Column<Row>[] = [
    {
      key: "employee",
      title: "Employee",
      render: (r) => {
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
    { key: "name", title: "Structure" },
    { key: "effectiveFrom", title: "Effective from", render: (r) => <span>{formatDate(r.effectiveFrom as string)}</span> },
    { key: "grossSalary", title: "Gross", render: (r) => <span className="font-semibold">{formatCurrency(Number(r.grossSalary))}</span> },
    {
      key: "paymentMode",
      title: "Mode",
      render: (r) => (
        <Badge variant={r.paymentMode === "BANK" ? "default" : "secondary"}>{String(r.paymentMode ?? "BANK")}</Badge>
      ),
    },
    {
      key: "isCurrent",
      title: "Active",
      render: (r) => (Boolean(r.isCurrent) ? <Badge variant="success">Current</Badge> : <Badge variant="secondary">Inactive</Badge>),
    },
    {
      key: "actions",
      title: "",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Link href={`/employees/${String(r.employeeId)}`}>
            <Button variant="ghost" size="sm">Profile</Button>
          </Link>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)} aria-label="Edit structure">
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Salary structures</h1>
          <p className="text-sm text-muted-foreground">
            Per-employee pay structure. Earnings and statutory deductions are computed by formula engine at run time.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" /> Build structure
        </Button>
      </div>

<DataTable columns={columns} rows={rows} loading={loading} total={rows.length} page={1} pageSize={rows.length || 1} onPageChange={() => undefined} empty="No salary structures yet. Build one to run payroll." />

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? `Edit structure · ${(editing.employee as Row)?.employeeCode ?? ""}` : "Build salary structure"}
        description="Set gross salary and override component values; formula/per-cent components compute automatically."
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="outline" disabled={previewing} onClick={() => void runPreview()}>
              <Calculator className="mr-1.5 h-4 w-4" /> {previewing ? "Computing…" : "Preview"}
            </Button>
            <Button onClick={() => void save()}>Save</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee">
            <Select value={form.employeeId ?? ""} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} disabled={editing !== null}>
              <option value="">Select employee…</option>
              {employees.map((e) => (
                <option key={String(e.id)} value={String(e.id)}>
                  {String((e as Row).firstName)} {String((e as Row).lastName)} · {String((e as Row).employeeCode)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Structure name">
            <Input value={form.name ?? "Primary"} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Monthly gross salary (₹)">
            <Input type="number" step="0.01" value={form.grossSalary ?? ""} onChange={(e) => setForm({ ...form, grossSalary: e.target.value })} />
          </Field>
          <Field label="Effective from">
            <Input type="date" value={(form.effectiveFrom ?? "").slice(0, 10)} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
          </Field>
          <Field label="Payment mode">
            <Select value={form.paymentMode ?? "BANK"} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}>
              <option value="BANK">Bank transfer</option>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
            </Select>
          </Field>
        </div>

        <div className="mt-5 max-h-72 overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Component</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 w-44">Override</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {comps.map((c) => (
                <tr key={c.payComponentId} className="hover:bg-muted/30">
                  <td className="px-3 py-1.5">
                    <p className="font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.code}</p>
                  </td>
                  <td className="px-3 py-1.5">
                    <Badge variant={c.componentType === "DEDUCTION" ? "destructive" : "success"}>
                      {c.componentType === "DEDUCTION" ? "Deduction" : "Earning"}
                    </Badge>
                  </td>
                  <td className="px-3 py-1.5">
                    {c.calcType === "FIXED" ? (
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8"
                        value={c.value}
                        onChange={(e) => setComps(comps.map((x) => (x.payComponentId === c.payComponentId ? { ...x, value: e.target.value } : x)))}
                      />
                    ) : c.calcType === "PERCENT_OF" ? (
                      <Input
                        type="number"
                        step="0.01"
                        className="h-8"
                        value={c.percent}
                        onChange={(e) => setComps(comps.map((x) => (x.payComponentId === c.payComponentId ? { ...x, percent: e.target.value } : x)))}
                      />
                    ) : c.calcType === "FORMULA" ? (
                      <Input
                        className="h-8 font-mono text-xs"
                        value={c.formula}
                        onChange={(e) => setComps(comps.map((x) => (x.payComponentId === c.payComponentId ? { ...x, formula: e.target.value } : x)))}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">auto (OT)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {preview ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="mb-2 text-xs font-semibold text-emerald-700">Earnings (per day {formatCurrency(preview.perDay)})</p>
              {preview.earnings.map((e) => (
                <div key={String(e.code)} className="flex justify-between py-0.5 text-sm">
                  <span className="text-muted-foreground">{String(e.name)}</span>
                  <span className="font-medium">{formatCurrency(Number(e.amount))}</span>
                </div>
              ))}
            </div>
            <div className="rounded-md border p-3">
              <p className="mb-2 text-xs font-semibold text-rose-700">Deductions</p>
              {preview.deductions.map((d) => (
                <div key={String(d.code)} className="flex justify-between py-0.5 text-sm">
                  <span className="text-muted-foreground">{String(d.name)}</span>
                  <span className="font-medium">{formatCurrency(Number(d.amount))}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}