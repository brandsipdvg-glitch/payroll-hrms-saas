"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch, listResource, biometricApi } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";
import { formatDateTime } from "@/lib/utils";

type Row = Record<string, unknown>;

function fmtDateTime(v?: unknown): string {
  return formatDateTime(v as string | Date | null | undefined);
}

export function DevicesPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, reset, setValue, watch } = useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listResource<Row>(biometricApi, { pageSize: 100 });
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
    reset({ deviceType: "FINGERPRINT", useImportRows: true });
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
      payload.ipAddress = values.ipAddress ? String(values.ipAddress) : undefined;
      if (editing) {
        await apiFetch(`${biometricApi}/${String(editing.id)}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast.success("Device updated.");
      } else {
        await apiFetch(biometricApi, { method: "POST", body: JSON.stringify(payload) });
        toast.success("Device added.");
      }
      setOpen(false);
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Save failed.");
    } finally {
      setSubmitting(false);
    }
  });

  const onSync = async (row: Row) => {
    try {
      await apiFetch(`${biometricApi}/${String(row.id)}`, { method: "POST" });
      toast.success(`Sync requested for "${String(row.name)}".`);
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Sync failed.");
    }
  };

  const onDelete = async (row: Row) => {
    if (!window.confirm(`Remove device "${String(row.name)}"?`)) return;
    try {
      await apiFetch(`${biometricApi}/${String(row.id)}`, { method: "DELETE" });
      toast.success("Device removed.");
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Delete failed.");
    }
  };

  const columns = useMemo<Column<Row>[]>(
    () => [
      { key: "name", title: "Device", render: (r) => <p className="font-medium">{String(r.name)}</p> },
      { key: "code", title: "Code", render: (r) => <Badge variant="outline">{String(r.code)}</Badge> },
      {
        key: "deviceType",
        title: "Type",
        render: (r) => <Badge variant="secondary">{String(r.deviceType ?? "—").replace("_", " ")}</Badge>,
      },
      { key: "ipAddress", title: "Address", render: (r) => <span className="text-sm">{String(r.ipAddress ?? "—")}</span> },
      {
        key: "status",
        title: "Status",
        render: (r) => (
          <Badge variant={String(r.status) === "ONLINE" ? "success" : String(r.status) === "ERROR" ? "destructive" : "outline"}>
            {String(r.status ?? "—")}
          </Badge>
        ),
      },
      {
        key: "lastSyncedAt",
        title: "Last sync",
        render: (r) => <span className="text-xs text-muted-foreground">{fmtDateTime(r.lastSyncedAt)}</span>,
      },
      {
        key: "_actions",
        title: "",
        className: "w-28",
        render: (r) => (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => onSync(r)} aria-label="Sync">
              <RefreshCw className="h-4 w-4" />
            </Button>
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
          <h1 className="text-xl font-semibold">Biometric devices</h1>
          <p className="text-sm text-muted-foreground">Register fingerprint, face, card and mobile attendance devices.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add device
        </Button>
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} total={rows.length} page={1} pageSize={rows.length || 1} onPageChange={() => undefined} />

      <Dialog open={open} onOpenChange={setOpen} title={editing ? "Edit device" : "Add device"}>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input required {...register("name")} />
          </div>
          <div className="space-y-1.5">
            <Label>Code *</Label>
            <Input required {...register("code")} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select defaultValue="FINGERPRINT" {...register("deviceType")}>
              {["FINGERPRINT", "FACE", "CARD", "MOBILE"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>IP / host</Label>
            <Input placeholder="192.168.1.20" {...register("ipAddress")} />
          </div>
          <div className="space-y-1.5 pt-2 sm:col-span-2">
            <Label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input accent-primary"
                checked={Boolean(watch("useImportRows"))}
                onChange={(e) => setValue("useImportRows", e.target.checked as never)}
              />
              Sync via import rows (no direct device integration)
            </Label>
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : editing ? "Save changes" : "Add"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}