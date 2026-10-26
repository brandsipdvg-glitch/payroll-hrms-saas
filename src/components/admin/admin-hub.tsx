"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BarChart3,
  Upload,
  Mail,
  Clock,
  Database,
  Settings2,
  Download,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/client/api";
import { analyticsApi, backupApi, bulkUploadEmployeesApi, emailPayslipsApi, scheduledReportsApi } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";

type Row = Record<string, unknown>;

const QUICK_STATS = [
  { icon: BarChart3, label: "Analytics Dashboard", href: "/admin/analytics", color: "bg-blue-100 text-blue-700" },
  { icon: Upload, label: "Bulk Upload Employees", href: "/admin/bulk-upload", color: "bg-emerald-100 text-emerald-700" },
  { icon: Mail, label: "Email Payslips", href: "/admin/email-payslips", color: "bg-violet-100 text-violet-700" },
  { icon: Clock, label: "Scheduled Reports", href: "/admin/scheduled-reports", color: "bg-amber-100 text-amber-700" },
  { icon: Database, label: "Backup & Restore", href: "/admin/backup", color: "bg-rose-100 text-rose-700" },
  { icon: Settings2, label: "System Health", href: "/admin/analytics", color: "bg-sky-100 text-sky-700" },
];

export function AdminHub() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Admin Tools</h1>
        <p className="text-sm text-muted-foreground">Analytics, bulk operations, reporting management, email and backup utilities.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_STATS.map((q) => (
          <a key={q.label} href={q.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-5">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${q.color}`}>
                  <q.icon className="h-6 w-6" />
                </div>
                <p className="font-medium">{q.label}</p>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>

      <ScheduledReportsQuick />
      <EmailDeliveriesQuick />
    </div>
  );
}

function ScheduledReportsQuick() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Row[]>(scheduledReportsApi);
      setRows((data ?? []).slice(0, 5));
    } catch {
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const runNow = async (id: string) => {
    try {
      await apiFetch(`${scheduledReportsApi}/${id}`, { method: "POST" });
      toast.success("Scheduled report ran successfully.");
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Run failed.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">Scheduled Reports</CardTitle>
            <CardDescription>Manage automatic report deliveries.</CardDescription>
          </div>
          <a href="/admin/scheduled-reports">
            <Button variant="outline" size="sm">View all</Button>
          </a>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {loading ? <p className="text-muted-foreground">Loading…</p> : null}
        {rows.length === 0 && !loading ? <p className="text-muted-foreground">No scheduled reports.</p> : null}
        {rows.map((r) => (
          <div key={String(r.id)} className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50">
            <div>
              <p className="font-medium">{String(r.title)}</p>
              <div className="flex gap-2">
                <Badge variant="secondary">{String(r.reportType)}</Badge>
                <Badge variant="outline">{String(r.frequency)}</Badge>
                {r.enabled === false ? <Badge variant="destructive">Disabled</Badge> : null}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void runNow(String(r.id))}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EmailDeliveriesQuick() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDeliveries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Row[]>("/api/v1/admin/email-deliveries");
      setRows((data ?? []).slice(0, 5));
    } catch {
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadDeliveries(); }, [loadDeliveries]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Email Deliveries</CardTitle>
        <CardDescription>Recent email delivery attempts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {loading ? <p className="text-muted-foreground">Loading…</p> : null}
        {!loading && rows.length === 0 ? <p className="text-muted-foreground">No deliveries recorded.</p> : null}
        {rows.map((r) => {
          const color = r.status === "SENT" ? "success" : r.status === "FAILED" ? "destructive" : "warning";
          return (
            <div key={String(r.id)} className="flex items-center justify-between rounded-md px-3 py-2">
              <div>
                <p className="font-medium">{String(r.subject)}</p>
                <p className="text-xs text-muted-foreground">{String(r.entityType)} · {(r.recipients as string[] | undefined)?.[0] ?? "—"}</p>
              </div>
              <Badge variant={color}>{String(r.status)}</Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}