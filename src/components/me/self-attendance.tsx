"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";
import { formatDate } from "@/lib/utils";

type Row = Record<string, unknown>;

function fmtDate(v?: unknown): string {
  return formatDate(v as string | Date | null | undefined);
}

function fmtTime(v?: unknown): string {
  if (!v) return "—";
  return new Date(String(v)).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function SelfAttendance() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Row>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset } = useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<Row>("/api/v1/me/attendance");
      setRows((res.rows as Row[]) ?? []);
      setSummary((res.summary as Row) ?? {});
    } catch {
      setRows([]);
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
      const payload: Record<string, unknown> = { date: String(values.date), breakMinutes: Number(values.breakMinutes ?? 0) };
      for (const k of ["inTime", "outTime"] as const) {
        if (values[k]) payload[k] = new Date(String(values[k])).toISOString();
      }
      if (values.remarks) payload.remarks = String(values.remarks);
      await apiFetch("/api/v1/me/attendance", { method: "POST", body: JSON.stringify(payload) });
      toast.success("Attendance saved.");
      reset({});
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Save failed.");
    } finally {
      setSubmitting(false);
    }
  });

  const columns: Column<Row>[] = [
    { key: "date", title: "Date", render: (r) => fmtDate(r.date) },
    { key: "inTime", title: "In", render: (r) => fmtTime(r.inTime) },
    { key: "outTime", title: "Out", render: (r) => fmtTime(r.outTime) },
    {
      key: "status",
      title: "Status",
      render: (r) => <Badge variant={String(r.status) === "PRESENT" ? "success" : String(r.status) === "ABSENT" ? "destructive" : "outline"}>{String(r.status)}</Badge>,
    },
    { key: "source", title: "Source", render: (r) => <span className="text-xs text-muted-foreground">{String(r.source ?? "—")}</span> },
  ];

  const cards: { key: string; label: string; accent: string }[] = [
    { key: "present", label: "Days present", accent: "text-emerald-600" },
    { key: "absent", label: "Absent", accent: "text-rose-600" },
    { key: "halfDay", label: "Half days", accent: "text-amber-600" },
    { key: "onLeave", label: "On leave", accent: "text-sky-600" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">My attendance</h1>
        <p className="text-sm text-muted-foreground">Record your punches and review your attendance history.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.key}>
            <CardContent className="p-5">
              <p className={`text-2xl font-bold leading-none ${c.accent}`}>{Number(summary[c.key] ?? 0)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Power className="h-4 w-4" /> Punch record
          </CardTitle>
          <CardDescription>Optionally specify in/out times; leave blank to keep open.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" required defaultValue={new Date().toISOString().slice(0, 10)} {...register("date")} />
            </div>
            <div className="space-y-1.5">
              <Label>In time</Label>
              <Input type="datetime-local" {...register("inTime")} />
            </div>
            <div className="space-y-1.5">
              <Label>Out time</Label>
              <Input type="datetime-local" {...register("outTime")} />
            </div>
            <div className="space-y-1.5">
              <Label>Break (min)</Label>
              <Input type="number" min={0} {...register("breakMinutes")} />
            </div>
            <div className="space-y-1.5 lg:col-span-3">
              <Label>Remarks</Label>
              <Textarea rows={1} {...register("remarks")} />
            </div>
            <div className="flex items-end justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Year summary</CardTitle>
          <CardDescription>
            {Number(summary.overtimeMinutes ?? 0) > 0
              ? `Total overtime: ${Math.floor(Number(summary.overtimeMinutes) / 60)}h ${Number(summary.overtimeMinutes) % 60}m`
              : "No overtime recorded this year."}
          </CardDescription>
        </CardHeader>
      </Card>

      <DataTable columns={columns} rows={rows} loading={loading} total={rows.length} page={1} pageSize={rows.length || 1} onPageChange={() => undefined} />
    </div>
  );
}