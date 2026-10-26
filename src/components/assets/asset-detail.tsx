"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch } from "@/lib/client/api";
import { assetsApi } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";
import { formatDate, formatCurrency } from "@/lib/utils";

type Row = Record<string, unknown>;

const statusVariant: Record<string, "default" | "success" | "warning" | "secondary"> = {
  AVAILABLE: "success",
  ALLOCATED: "default",
  MAINTENANCE: "warning",
  RETIRED: "secondary",
};

export function AssetDetail({ id }: { id: string }) {
  const [asset, setAsset] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [employees, setEmployees] = useState<Row[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [returnOpen, setReturnOpen] = useState(false);
  const [condition, setCondition] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Row>(`${assetsApi}/${id}`);
      setAsset(data);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load asset.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!assignOpen) return;
    const timer = setTimeout(async () => {
      if (employeeQuery.trim().length < 2) return;
      try {
        const qs = new URLSearchParams({ search: employeeQuery });
        const rows = await apiFetch<Row[]>(`/api/v1/employees?${qs.toString()}`);
        setEmployees(rows ?? []);
      } catch {
        setEmployees([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [assignOpen, employeeQuery]);

  const activeAssignment = (asset?.assignments as Row[] | undefined)?.find((a) => a.status === "ACTIVE") as Row | undefined;
  const activeEmployee = activeAssignment?.employee as Row | undefined;

  const submitAssign = async () => {
    if (!selectedEmployee) {
      toast.error("Choose an employee first.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`${assetsApi}/assignments`, {
        method: "POST",
        body: JSON.stringify({
          assetId: id,
          employeeId: selectedEmployee,
          assignedAt: new Date().toISOString().slice(0, 10),
        }),
      });
      toast.success("Asset allocated.");
      setAssignOpen(false);
      setSelectedEmployee("");
      setEmployeeQuery("");
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to allocate.");
    } finally {
      setSaving(false);
    }
  };

  const submitReturn = async () => {
    if (!activeAssignment) return;
    setSaving(true);
    try {
      await apiFetch(`${assetsApi}/assignments/${String(activeAssignment.id)}/return`, {
        method: "POST",
        body: JSON.stringify({
          returnedAt: new Date().toISOString().slice(0, 10),
          conditionOnReturn: condition,
        }),
      });
      toast.success("Asset returned.");
      setReturnOpen(false);
      setCondition("");
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to return asset.");
    } finally {
      setSaving(false);
    }
  };

  const history: Row[] = ((asset?.assignments as Row[] | undefined) ?? []).map((a) => ({
    ...a,
    employeeName: `${String((a.employee as Row)?.firstName ?? "")} ${String((a.employee as Row)?.lastName ?? "")}`.trim(),
  }));

  const columns: Column<Row>[] = [
    {
      key: "employeeName",
      title: "Employee",
      render: (r) => (
        <div>
          <p className="font-medium">{String(r.employeeName || "—")}</p>
          <p className="text-xs text-muted-foreground">{String((r.employee as Row)?.employeeCode ?? "")}</p>
        </div>
      ),
    },
    { key: "assignedAt", title: "Assigned", render: (r) => formatDate(r.assignedAt as string) },
    { key: "returnedAt", title: "Returned", render: (r) => (r.returnedAt ? formatDate(r.returnedAt as string) : "—") },
    {
      key: "status",
      title: "Status",
      render: (r) => <Badge variant={r.status === "ACTIVE" ? "default" : "secondary"}>{String(r.status)}</Badge>,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <a href="/assets" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to assets
        </a>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">
              {String(asset?.name ?? "Loading…")} <span className="text-muted-foreground">· {String(asset?.assetTag ?? "")}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {asset ? `${String(asset.category)} · ${String(asset.model ?? "No model")}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeAssignment ? (
              <Button variant="outline" onClick={() => setReturnOpen(true)}>
                Mark as returned
              </Button>
            ) : (
              <Button disabled={asset?.status === "RETIRED"} onClick={() => setAssignOpen(true)}>
                Allocate to employee
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Asset details</CardTitle>
            <CardDescription></CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <Field label="Status" value={<Badge variant={statusVariant[String(asset?.status)] ?? "secondary"}>{String(asset?.status ?? "")}</Badge>} />
            <Field label="Serial number" value={String(asset?.serialNumber ?? "—")} />
            <Field label="Purchase date" value={asset?.purchaseDate ? formatDate(asset.purchaseDate as string) : "—"} />
            <Field label="Purchase value" value={asset?.purchaseValue ? formatCurrency(Number(asset.purchaseValue)) : "—"} />
            <Field label="Condition" value={String(asset?.condition ?? "—")} />
            <Field label="Warranty until" value={asset?.warrantyUntil ? formatDate(asset.warrantyUntil as string) : "—"} />
            <Field label="Notes" value={String(asset?.notes ?? "—")} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Current allocation</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {activeEmployee ? (
              <div className="space-y-2">
                <p className="font-medium">
                  {String(activeEmployee.firstName)} {String(activeEmployee.lastName)}
                </p>
                <p className="text-muted-foreground">{String(activeEmployee.employeeCode)}</p>
                <p className="text-xs text-muted-foreground">Assigned {formatDate(activeAssignment?.assignedAt as string)}</p>
              </div>
            ) : (
              <p className="text-muted-foreground">Not allocated.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <DataTable columns={columns} rows={history} loading={loading} total={history.length} page={1} pageSize={history.length || 1} onPageChange={() => undefined} empty={<span>No assignment history yet.</span>} />

      {assignOpen ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div>
              <Label>Search employee</Label>
              <Input
                className="mt-1"
                placeholder="Type name or code…"
                value={employeeQuery}
                onChange={(e) => setEmployeeQuery(e.target.value)}
              />
            </div>
            {employees.length > 0 ? (
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border p-2">
                {employees.map((e) => (
                  <button
                    key={String(e.id)}
                    onClick={() => setSelectedEmployee(String(e.id))}
                    className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted ${selectedEmployee === String(e.id) ? "bg-muted" : ""}`}
                  >
                    <span>
                      {String(e.firstName)} {String(e.lastName)}
                    </span>
                    <span className="text-xs text-muted-foreground">{String(e.employeeCode)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button onClick={submitAssign} disabled={saving}>
                {saving ? "Allocating…" : "Allocate"}
              </Button>
              <Button variant="outline" onClick={() => setAssignOpen(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {returnOpen ? (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div>
              <Label>Condition on return</Label>
              <Input
                className="mt-1"
                placeholder="Good / Damaged / Needs repair"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={submitReturn} disabled={saving}>
                {saving ? "Saving…" : "Confirm return"}
              </Button>
              <Button variant="outline" onClick={() => setReturnOpen(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value}</p>
    </div>
  );
}