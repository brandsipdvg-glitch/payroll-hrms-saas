"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch, listResource, leaveTypeApi } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";
import { formatDate } from "@/lib/utils";

type Row = Record<string, unknown>;

function fmtDate(v?: unknown): string {
  return formatDate(v as string | Date | null | undefined);
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELLED: "outline",
} as const;

export function SelfLeave() {
  const [requests, setRequests] = useState<Row[]>([]);
  const [balances, setBalances] = useState<Row[]>([]);
  const [types, setTypes] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset } = useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqs, bals, t] = await Promise.all([
        apiFetch<Row[]>("/api/v1/me/leave"),
        apiFetch<Row[]>(`/api/v1/me/balances?year=${new Date().getFullYear()}`),
        listResource<Row>(leaveTypeApi, { pageSize: 100 }),
      ]);
      setRequests(reqs);
      setBalances(bals);
      setTypes(t.data);
    } catch {
      setRequests([]);
      setBalances([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSubmit = handleSubmit(async (values: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      await apiFetch("/api/v1/me/leave", { method: "POST", body: JSON.stringify(values) });
      toast.success("Leave request submitted.");
      reset({});
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Could not submit request.");
    } finally {
      setSubmitting(false);
    }
  });

  const onCancel = async (row: Row) => {
    if (String(row.status) !== "PENDING") {
      toast.error("Only pending requests can be cancelled.");
      return;
    }
    if (!window.confirm("Cancel this leave request?")) return;
    try {
      await apiFetch(`/api/v1/me/leave/${String(row.id)}/cancel`, { method: "POST" });
      toast.success("Request cancelled.");
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Cancel failed.");
    }
  };

  const columns = useMemo<Column<Row>[]>(
    () => [
      {
        key: "leaveType",
        title: "Type",
        render: (r) => {
          const t = r.leaveType as Row | undefined;
          return (
            <Badge variant="outline" className="gap-1.5">
              {typeof t?.color === "string" ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} /> : null}
              {String(t?.name ?? "—")}
            </Badge>
          );
        },
      },
      {
        key: "duration",
        title: "Duration",
        render: (r) => (
          <div>
            <p className="text-sm">
              {fmtDate(r.startDate)} → {fmtDate(r.endDate)}
            </p>
            <p className="text-xs text-muted-foreground">{String(r.daysRequested ?? "—")} day(s)</p>
          </div>
        ),
      },
      { key: "reason", title: "Reason", render: (r) => <span className="max-w-[200px] truncate text-sm">{String(r.reason ?? "—")}</span> },
      { key: "status", title: "Status", render: (r) => <Badge variant={(STATUS_STYLE[String(r.status)] ?? "outline") as "outline"}>{String(r.status)}</Badge> },
      {
        key: "_actions",
        title: "",
        className: "w-16",
        render: (r) =>
          String(r.status) === "PENDING" ? (
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onCancel(r)} aria-label="Cancel">
              <X className="h-4 w-4" />
            </Button>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">My leave</h1>
        <p className="text-sm text-muted-foreground">Apply for leave and track approvals.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {balances.map((b) => (
          <Card key={String(b.id)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{String((b.leaveType as Row | undefined)?.name ?? "Leave")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <p className="text-2xl font-bold leading-none">{Number(b.closingBalance ?? 0)}</p>
                <p className="text-xs text-muted-foreground">
                  +{Number(b.credited ?? 0)} credit · −{Number(b.availed ?? 0)} used
                </p>
              </div>
              {Number(b.closingBalance ?? 0) <= 0 ? <p className="mt-1 text-xs text-rose-500">No balance left</p> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Apply for leave</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Leave type *</Label>
              <Select required {...register("leaveTypeId")}>
                <option value="">Select…</option>
                {types.map((t) => (
                  <option key={String(t.id)} value={String(t.id)}>
                    {String(t.name)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>From *</Label>
              <Input type="date" required {...register("startDate")} />
            </div>
            <div className="space-y-1.5">
              <Label>To *</Label>
              <Input type="date" required {...register("endDate")} />
            </div>
            <div className="space-y-1.5">
              <Label>Half day</Label>
              <Select defaultValue="first" {...register("halfDayType")}>
                <option value="">Full day</option>
                <option value="first">First half</option>
                <option value="second">Second half</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Is half-day</Label>
              <Select defaultValue="false" {...register("isHalfDay")}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-3">
              <Label>Reason *</Label>
              <Textarea rows={1} required {...register("reason")} />
            </div>
            <div className="flex items-end justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <DataTable columns={columns} rows={requests} loading={loading} total={requests.length} page={1} pageSize={requests.length || 1} onPageChange={() => undefined} />
    </div>
  );
}