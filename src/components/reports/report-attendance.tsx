"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";
import { formatDate } from "@/lib/utils";

type Row = Record<string, unknown>;

function minsToHm(n?: unknown): string {
  const v = Number(n ?? 0);
  if (v <= 0) return "—";
  return `${Math.floor(v / 60)}h ${v % 60}m`;
}

export function ReportAttendance() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Row>({});
  const [daySpan, setDaySpan] = useState(0);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from, to });
      const data = await apiFetch<Row>(`/api/v1/reports/attendance?${qs.toString()}`);
      setRows((data.rows as Row[]) ?? []);
      setSummary((data.summary as Row) ?? {});
      setDaySpan(Number(data.daySpan ?? 0));
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load report.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: Column<Row>[] = [
    {
      key: "name",
      title: "Employee",
      render: (r) => (
        <div>
          <p className="font-medium">{String(r.name)}</p>
          <p className="text-xs text-muted-foreground">
            {String(r.employeeCode)} {r.department ? ` · ${String(r.department)}` : ""}
          </p>
        </div>
      ),
    },
    { key: "present", title: "Present", render: (r) => <span className="text-emerald-600">{Number(r.present)}</span> },
    { key: "absent", title: "Absent", render: (r) => <span className="text-rose-600">{Number(r.absent)}</span> },
    { key: "halfDay", title: "Half", render: (r) => <span className="text-amber-600">{Number(r.halfDay)}</span> },
    { key: "onLeave", title: "Leave", render: (r) => <span className="text-sky-600">{Number(r.onLeave)}</span> },
    { key: "holiday", title: "Holiday", render: (r) => <span>{Number(r.holiday)}</span> },
    { key: "working", title: "Hours", render: (r) => minsToHm(r.totalWorkingMin) },
    { key: "late", title: "Late", render: (r) => minsToHm(r.totalLateMin) },
    { key: "ot", title: "OT", render: (r) => minsToHm(r.totalOtMin) },
    {
      key: "presence",
      title: "Presence",
      render: (r) =>
        daySpan ? (
          <div className="w-28">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Number(r.presentationRate ?? 0))}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{Number(r.presentationRate ?? 0)}%</p>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Attendance report</h1>
        <p className="text-sm text-muted-foreground">Per-employee summary of presence, lateness and overtime for a period.</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex items-end lg:col-span-2">
              <Button onClick={() => void load()} disabled={loading}>
                {loading ? "Loading…" : "Run report"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            ["present", "Present records", "text-emerald-600"],
            ["absent", "Absent records", "text-rose-600"],
            ["halfDay", "Half-day records", "text-amber-600"],
            ["onLeave", "On-leave records", "text-sky-600"],
          ] as const
        ).map(([k, label, color]) => (
          <Card key={k}>
            <CardContent className="p-5">
              <p className={`text-2xl font-bold leading-none ${color}`}>{Number(summary[k] ?? 0)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} total={rows.length} page={1} pageSize={rows.length || 1} onPageChange={() => undefined} />
    </div>
  );
}