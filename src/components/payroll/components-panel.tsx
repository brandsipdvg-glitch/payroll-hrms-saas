"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch, payComponentsApi, ApiClientError } from "@/lib/client/api";

type Row = Record<string, unknown>;

const CALC_LABELS: Record<string, string> = {
  FIXED: "Fixed",
  PERCENT_OF: "% of",
  FORMULA: "Formula",
  ATTENDANCE: "Attendance",
};

export function ComponentsPanel() {
  const [components, setComponents] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState("EARNING");
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Record<string, string | boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiFetch<Row[]>(`${payComponentsApi}?type=${type}`);
      setComponents(rows);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load pay components.");
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setForm({
      name: "",
      code: "",
      componentType: type,
      calcType: "FIXED",
      formula: "",
      percentOf: "BASIC",
      percent: "",
      defaultValue: "",
      isTaxable: true,
      isStatutory: type === "DEDUCTION",
      isVariable: false,
      isLoanRecovery: false,
      sortOrder: "100",
      description: "",
    });
    setCreating(true);
  };

  const openEdit = (row: Row) => {
    setEditing(row);
    setForm({
      name: String(row.name ?? ""),
      code: String(row.code ?? ""),
      componentType: String(row.componentType ?? "EARNING"),
      calcType: String(row.calcType ?? "FIXED"),
      formula: String(row.formula ?? ""),
      percentOf: String(row.percentOf ?? "BASIC"),
      percent: String(row.percent ?? ""),
      defaultValue: String(row.defaultValue ?? ""),
      isTaxable: Boolean(row.isTaxable),
      isStatutory: Boolean(row.isStatutory),
      isVariable: Boolean(row.isVariable),
      isLoanRecovery: Boolean(row.isLoanRecovery),
      isActive: Boolean(row.isActive),
      sortOrder: String(row.sortOrder ?? 100),
      description: String(row.description ?? ""),
    });
  };

  const canSubmit = String(form.name ?? "").trim() && String(form.code ?? "").trim();

  async function save() {
    if (!canSubmit) return;
    try {
      if (creating) {
        await apiFetch(`${payComponentsApi}`, { method: "POST", body: JSON.stringify(form) });
        toast.success("Pay component created.");
      } else if (editing) {
        await apiFetch(`${payComponentsApi}/${String(editing.id)}`, { method: "PATCH", body: JSON.stringify(form) });
        toast.success("Pay component updated.");
      }
      setCreating(false);
      setEditing(null);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to save pay component.");
    }
  }

  async function archive(id: string) {
    try {
      await apiFetch(`${payComponentsApi}/${id}`, { method: "DELETE" });
      toast.success("Pay component archived.");
      await load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to archive pay component.");
    }
  }

  const columns: Column<Row>[] = [
    {
      key: "name",
      title: "Component",
      render: (r) => (
        <div>
          <p className="font-medium">{String(r.name)}</p>
          <p className="text-xs text-muted-foreground">{String(r.code)}</p>
        </div>
      ),
    },
    { key: "calcType", title: "Calculation", render: (r) => <span>{CALC_LABELS[String(r.calcType)] ?? String(r.calcType)}</span> },
    {
      key: "formula",
      title: "Formula / Percent",
      render: (r) => {
        const ct = String(r.calcType);
        if (ct === "FORMULA") return <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{String(r.formula ?? "—")}</code>;
        if (ct === "PERCENT_OF") return <span>{String(r.percent ?? 0)}% of <b>{String(r.percentOf ?? "gross")}</b></span>;
        if (ct === "FIXED") return <span>{Number(r.defaultValue ?? 0).toLocaleString("en-IN")}</span>;
        return "—";
      },
    },
    {
      key: "flags",
      title: "Flags",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {Boolean(r.isStatutory) ? <Badge variant="secondary">Statutory</Badge> : null}
          {Boolean(r.isVariable) ? <Badge variant="warning">Variable</Badge> : null}
          {Boolean(r.isLoanRecovery) ? <Badge variant="destructive">Recovery</Badge> : null}
          {!Boolean(r.isTaxable) ? <Badge variant="success">Exempt</Badge> : null}
        </div>
      ),
    },
    { key: "sortOrder", title: "Order", render: (r) => <span className="text-muted-foreground">{Number(r.sortOrder)}</span> },
    {
      key: "actions",
      title: "",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)} aria-label="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void archive(String(r.id))} aria-label="Archive">
            <Trash2 className="h-4 w-4 text-rose-500" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Pay components</h1>
          <p className="text-sm text-muted-foreground">
            Define earnings and deductions, then attach them to salary structures. Formulas support SUM, MIN, MAX, ROUND, IF, ABS, FLOOR, CEIL.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" /> Add component
        </Button>
      </div>

      <Tabs
        value={type}
        onValueChange={setType}
        tabs={[
          { value: "EARNING", label: "Earnings" },
          { value: "DEDUCTION", label: "Deductions" },
        ]}
      />

      <DataTable columns={columns} rows={components} loading={loading} total={components.length} page={1} pageSize={components.length || 1} onPageChange={() => undefined} empty="No pay components defined yet." />

      <Dialog
        open={creating || Boolean(editing)}
        onOpenChange={(v) => {
          if (!v) {
            setCreating(false);
            setEditing(null);
          }
        }}
        title={creating ? "Add pay component" : `Edit ${String(editing?.name ?? "")}`}
        description="Component-level definition; values can be overridden per salary structure."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setCreating(false); setEditing(null); }}>Cancel</Button>
            <Button disabled={!canSubmit} onClick={() => void save()}>Save</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={String(form.name ?? "")} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Basic" />
          </Field>
          <Field label="Code">
            <Input value={String(form.code ?? "")} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="BASIC" />
          </Field>
          <Field label="Type">
            <Select value={String(form.componentType ?? "EARNING")} onChange={(e) => setForm({ ...form, componentType: e.target.value })} disabled={editing !== null}>
              <option value="EARNING">Earning</option>
              <option value="DEDUCTION">Deduction</option>
            </Select>
          </Field>
          <Field label="Calculation type">
            <Select
              value={String(form.calcType ?? "FIXED")}
              onChange={(e) => setForm({ ...form, calcType: e.target.value })}
            >
              <option value="FIXED">Fixed amount</option>
              <option value="PERCENT_OF">Percentage of component</option>
              <option value="FORMULA">Formula</option>
              <option value="ATTENDANCE">Attendance engine (OT)</option>
            </Select>
          </Field>

          {form.calcType === "FIXED" ? (
            <Field label="Default value">
              <Input type="number" step="0.01" value={String(form.defaultValue ?? "")} onChange={(e) => setForm({ ...form, defaultValue: e.target.value })} />
            </Field>
          ) : null}

          {form.calcType === "PERCENT_OF" ? (
            <>
              <Field label="Percent">
                <Input type="number" step="0.01" value={String(form.percent ?? "")} onChange={(e) => setForm({ ...form, percent: e.target.value })} />
              </Field>
              <Field label="Percent of component">
                <Input value={String(form.percentOf ?? "BASIC")} onChange={(e) => setForm({ ...form, percentOf: e.target.value.toUpperCase() })} placeholder="BASIC" />
              </Field>
            </>
          ) : null}

          {form.calcType === "FORMULA" ? (
            <Field label="Formula">
              <Input value={String(form.formula ?? "")} onChange={(e) => setForm({ ...form, formula: e.target.value })} placeholder="BASIC * 0.40" className="font-mono" />
            </Field>
          ) : null}

          <Field label="Sort order">
            <Input type="number" value={String(form.sortOrder ?? 100)} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
          </Field>
          <Field label="Description">
            <Input value={String(form.description ?? "")} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={Boolean(form.isTaxable)} onChange={(e) => setForm({ ...form, isTaxable: e.target.checked })} /> Taxable
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={Boolean(form.isStatutory)} onChange={(e) => setForm({ ...form, isStatutory: e.target.checked })} /> Statutory (PF/ESI/PT/TDS/LWF)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={Boolean(form.isVariable)} onChange={(e) => setForm({ ...form, isVariable: e.target.checked })} /> Variable pay
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={Boolean(form.isLoanRecovery)} onChange={(e) => setForm({ ...form, isLoanRecovery: e.target.checked })} /> Loan / advance recovery
          </label>
        </div>
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