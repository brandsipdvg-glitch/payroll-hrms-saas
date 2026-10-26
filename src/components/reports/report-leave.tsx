"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";

type Row = Record<string, unknown>;

export function ReportLeave() {
  const [summary, setSummary] = useState<Row>({});
  const [byType, setByType] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from, to });
      const data = await apiFetch<Row>(`/api/v1/reports/leave?${qs.toString()}`);
      setSummary((data.summary as Row) ?? {});
      setByType((data.byType as Row[]) ?? []);
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

  const totalDays = byType.reduce((s, r) => s + Number(r.days ?? 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Leave report</h1>
        <p className="text-sm text-muted-foreground">Approved leave utilisation per type for a period.</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex items-end">
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
            ["total", "Total requests", "text-foreground"],
            ["approved", "Approved", "text-emerald-600"],
            ["pending", "Pending", "text-amber-600"],
            ["rejected", "Rejected", "text-rose-600"],
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Days approved by leave type</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {byType.length === 0 ? (
            <p className="text-sm text-muted-foreground">No approved leave in this period.</p>
          ) : (
            <>
              {byType.map((r) => (
                <div key={String(r.type)}>
                  <div className="flex items-center justify-between text-sm">
                    <span>{String(r.type)}</span>
                    <span className="text-muted-foreground">
                      {Number(r.days)} day(s) · {Number(r.count)} request(s)
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${totalDays ? Math.max(4, (Number(r.days) / totalDays) * 100) : 0}%` }} />
                  </div>
                </div>
              ))}
              <p className="pt-2 text-xs text-muted-foreground">Total approved days: {totalDays}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}