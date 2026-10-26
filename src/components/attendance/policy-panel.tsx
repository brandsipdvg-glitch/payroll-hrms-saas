"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch, listResource, attendancePolicyApi } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";

type Row = Record<string, unknown>;

const FIELDS = [
  { key: "name", label: "Name", type: "text" },
  { key: "code", label: "Code", type: "text" },
  { key: "graceTimeMinutes", label: "Grace (min)", type: "number" },
  { key: "maxLateMinutes", label: "Max late (min)", type: "number" },
  { key: "lateAfterGraceMinutes", label: "Late after grace (min)", type: "number" },
  { key: "minHoursForFullDay", label: "Min hours full day", type: "decimal" },
  { key: "otEnabled", label: "OT enabled", type: "checkbox" },
  { key: "otAfterMinutes", label: "OT after (min)", type: "number" },
  { key: "otRoundToMinutes", label: "OT round to (min)", type: "number" },
  { key: "otMaxPerDayMinutes", label: "OT max/day (min)", type: "number" },
  { key: "absentIfNoPunch", label: "Absent if no punch", type: "checkbox" },
  { key: "absentAfterHalfDay", label: "Absent after half-day", type: "checkbox" },
] as const;

export function PolicyPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, reset, setValue, watch } = useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listResource<Row>(attendancePolicyApi, { pageSize: 100 });
      setRows(res.data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    reset({ graceTimeMinutes: 5, maxLateMinutes: 15, otEnabled: false, absentIfNoPunch: false, absentAfterHalfDay: false });
    setOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditing(row);
    reset(row);
    setOpen(true);
  };

  const onSubmit = handleSubmit(async (values: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { ...values };
      for (const f of FIELDS) {
        if (f.type === "checkbox") payload[f.key] = Boolean(values[f.key]);
        else if (f.type === "number" || f.type === "decimal") payload[f.key] = Number(values[f.key]);
      }
      if (editing) {
        await apiFetch(`${attendancePolicyApi}/${String(editing.id)}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast.success("Policy updated.");
      } else {
        await apiFetch(attendancePolicyApi, { method: "POST", body: JSON.stringify(payload) });
        toast.success("Policy created.");
      }
      setOpen(false);
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Save failed.");
    } finally {
      setSubmitting(false);
    }
  });

  const onDelete = async (row: Row) => {
    if (row.isDefault) {
      toast.error("Cannot delete the default policy.");
      return;
    }
    if (!window.confirm(`Delete policy "${String(row.name)}"?`)) return;
    try {
      await apiFetch(`${attendancePolicyApi}/${String(row.id)}`, { method: "DELETE" });
      toast.success("Policy deleted.");
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Delete failed.");
    }
  };

  const columns = useMemo<Column<Row>[]>(
    () => [
      {
        key: "name",
        title: "Policy",
        render: (r) => (
          <div className="flex items-center gap-2">
            <p className="font-medium">{String(r.name)}</p>
            {r.isDefault ? <Badge variant="secondary">Default</Badge> : null}
          </div>
        ),
      },
      { key: "code", title: "Code", render: (r) => <Badge variant="outline">{String(r.code)}</Badge> },
      { key: "graceTimeMinutes", title: "Grace", render: (r) => `${Number(r.graceTimeMinutes ?? 0)}m` },
      { key: "maxLateMinutes", title: "Max late", render: (r) => `${Number(r.maxLateMinutes ?? 0)}m` },
      { key: "minHoursForFullDay", title: "Min full day", render: (r) => `${Number(r.minHoursForFullDay ?? 0)}h` },
      { key: "otEnabled", title: "OT", render: (r) => (r.otEnabled ? <Badge variant="success">Enabled</Badge> : <Badge variant="outline">Off</Badge>) },
      { key: "absentIfNoPunch", title: "Absent w/o punch", render: (r) => (r.absentIfNoPunch ? "Yes" : "No") },
      {
        key: "_actions",
        title: "",
        className: "w-20",
        render: (r) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => openEdit(r)} aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onDelete(r)} aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Attendance policies</h1>
          <p className="text-sm text-muted-foreground">Define grace, late, half-day and overtime rules per policy.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add policy
        </Button>
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} total={rows.length} page={1} pageSize={rows.length || 1} onPageChange={() => undefined} />

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit policy" : "New policy"}
        size="lg"
      >
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input required {...register("name")} />
          </div>
          <div className="space-y-1.5">
            <Label>Code *</Label>
            <Input required {...register("code")} placeholder="ATT-STD" />
          </div>
          {FIELDS.filter((f) => f.type === "checkbox").map((f) => (
            <div key={f.key} className="space-y-1.5 pt-2 sm:col-span-2">
              <Label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input accent-primary"
                  checked={Boolean(watch(f.key))}
                  onChange={(e) => setValue(f.key, e.target.checked as never)}
                />
                {f.label}
              </Label>
            </div>
          ))}
          {FIELDS.filter((f) => f.type === "number" || f.type === "decimal").map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <Input type="number" step={f.type === "decimal" ? "0.5" : "1"} min={0} {...register(f.key)} />
            </div>
          ))}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : editing ? "Save changes" : "Create"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}