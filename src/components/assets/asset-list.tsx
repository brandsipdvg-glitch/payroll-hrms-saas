"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Package, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch } from "@/lib/client/api";
import { assetsApi } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";
import { formatDate } from "@/lib/utils";

type Row = Record<string, unknown>;

const CATEGORIES = ["LAPTOP", "MOBILE", "TABLET", "PERIPHERAL", "VEHICLE", "FURNITURE", "SOFTWARE", "OTHER"];

const statusVariant: Record<string, "default" | "success" | "warning" | "secondary" | "destructive"> = {
  AVAILABLE: "success",
  ALLOCATED: "default",
  MAINTENANCE: "warning",
  RETIRED: "secondary",
};

export function AssetList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (category) qs.set("category", category);
      if (status) qs.set("status", status);
      if (q) qs.set("q", q);
      const data = await apiFetch<Row[]>(
        `${assetsApi}${qs.toString() ? `?${qs.toString()}` : ""}`
      );
      setRows((data as Row[]) ?? []);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load assets.");
    } finally {
      setLoading(false);
    }
  }, [category, status, q]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, status]);

  const submit = async () => {
    setSaving(true);
    try {
      await apiFetch<Row>(assetsApi, {
        method: "POST",
        body: JSON.stringify({
          category: form.category ?? "LAPTOP",
          assetTag: form.assetTag,
          name: form.name,
          serialNumber: form.serialNumber,
          model: form.model,
          purchaseDate: form.purchaseDate,
          purchaseValue: form.purchaseValue ? Number(form.purchaseValue) : undefined,
          warrantyUntil: form.warrantyUntil,
          condition: form.condition,
          notes: form.notes,
        }),
      });
      toast.success("Asset registered.");
      setShowForm(false);
      setForm({});
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to register asset.");
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<Row>[] = [
    {
      key: "asset",
      title: "Asset",
      render: (r) => (
        <a href={`/assets/${String(r.id)}`} className="font-medium hover:underline">
          {String(r.name)}
          <span className="ml-2 text-xs text-muted-foreground">{String(r.assetTag)}</span>
        </a>
      ),
    },
    {
      key: "category",
      title: "Category",
      render: (r) => <Badge variant="secondary">{String(r.category)}</Badge>,
    },
    { key: "serialNumber", title: "Serial", render: (r) => <span className="text-muted-foreground">{String(r.serialNumber ?? "—")}</span> },
    { key: "model", title: "Model", render: (r) => <span className="text-muted-foreground">{String(r.model ?? "—")}</span> },
    {
      key: "status",
      title: "Status",
      render: (r) => <Badge variant={statusVariant[String(r.status)] ?? "secondary"}>{String(r.status)}</Badge>,
    },
    {
      key: "assignee",
      title: "Assigned to",
      render: (r) => {
        const a = (r.assignments as Row[] | undefined)?.[0] as Row | undefined;
        const emp = a?.employee as Row | undefined;
        return emp ? (
          <span className="text-sm">
            {String(emp.firstName)} {String(emp.lastName)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Assets</h1>
            <p className="text-sm text-muted-foreground">Register assets, allocate to employees and track returns.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-4 w-4" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-1 h-4 w-4" /> Register asset
          </Button>
        </div>
      </div>

      {showForm ? (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Category *</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={form.category ?? "LAPTOP"}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Asset tag</Label>
                <Input placeholder="AST-0001 (auto)" value={form.assetTag ?? ""} onChange={(e) => setForm({ ...form, assetTag: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input placeholder="Dell Latitude 5540" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Serial number</Label>
                <Input placeholder="SN-1234" value={form.serialNumber ?? ""} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input placeholder="Latitude 5540" value={form.model ?? ""} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Purchase date</Label>
                <Input type="date" value={form.purchaseDate ?? ""} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Purchase value (INR)</Label>
                <Input type="number" placeholder="85000" value={form.purchaseValue ?? ""} onChange={(e) => setForm({ ...form, purchaseValue: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Condition</Label>
                <Input placeholder="New / Good / Fair" value={form.condition ?? ""} onChange={(e) => setForm({ ...form, condition: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input placeholder="Additional remarks" value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={submit} disabled={saving}>
                {saving ? "Saving…" : "Register asset"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search by name, tag or serial…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void load();
          }}
        />
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {Object.keys(statusVariant).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          Apply
        </Button>
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} total={rows.length} page={1} pageSize={rows.length || 1} onPageChange={() => undefined} empty={<span>No assets found.</span>} />
    </div>
  );
}