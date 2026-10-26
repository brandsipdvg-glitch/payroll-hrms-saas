"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Trash2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/client/api";
import { scheduledReportsApi } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";

type Row = Record<string, unknown>;

const REPORT_TYPES = ["PAYROLL", "COMPLIANCE", "HR"] as const;
const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
const FORMATS = ["CSV", "EXCEL", "PDF"] as const;

export function ScheduledReports() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [reportType, setReportType] = useState("PAYROLL");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [format, setFormat] = useState("EXCEL");
  const [recipients, setRecipients] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Row[]>(scheduledReportsApi);
      setRows((data ?? []).map((r) => ({ ...r, enabled: r.enabled ?? true })));
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    const emails = recipients.split(",").map((e) => e.trim()).filter(Boolean);
    if (!title) { toast.error("Title is required."); return; }
    if (!emails.length) { toast.error("At least one recipient email is required."); return; }
    setSaving(true);
    try {
      await apiFetch(scheduledReportsApi, {
        method: "POST",
        body: JSON.stringify({
          title,
          reportType,
          frequency,
          format,
          recipientEmails: emails,
          filters: { month: String(new Date().getMonth() + 1) },
        }),
      });
      toast.success("Scheduled report created.");
      setShowCreate(false);
      setTitle("");
      setRecipients("");
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Create failed.");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async (id: string) => {
    try {
      await apiFetch(`${scheduledReportsApi}/${id}`, { method: "POST" });
      toast.success("Report generated and emailed.");
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Run failed.");
    }
  };

  const toggleEnabled = async (r: Row) => {
    try {
      await apiFetch(`${scheduledReportsApi}/${String(r.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !r.enabled }),
      });
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Update failed.");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this scheduled report?")) return;
    try {
      await apiFetch(`${scheduledReportsApi}/${id}`, { method: "DELETE" });
      toast.success("Deleted.");
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Delete failed.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Scheduled Reports</h1>
          <p className="text-sm text-muted-foreground">Automate report generation and email delivery on a recurring schedule.</p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" /> New schedule
        </Button>
      </div>

      {showCreate ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Create scheduled report</CardTitle>
            <CardDescription></CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 p-5 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input placeholder="e.g. Monthly payroll summary" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Report type</Label>
              <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={reportType} onChange={(e) => setReportType(e.target.value)}>
                {REPORT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Format</Label>
              <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={format} onChange={(e) => setFormat(e.target.value)}>
                {FORMATS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Recipient emails (comma-separated)</Label>
              <Input placeholder="finance@company.com, ceo@company.com" value={recipients} onChange={(e) => setRecipients(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={create} disabled={saving} className="w-full">
                {saving ? "Creating…" : "Create"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-2">
        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {rows.length === 0 && !loading ? <p className="text-sm text-muted-foreground">No scheduled reports yet.</p> : null}
        {rows.map((r) => (
          <Card key={String(r.id)}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{String(r.title)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{String(r.reportType)}</Badge>
                  <Badge variant="outline">{String(r.frequency)}</Badge>
                  <Badge variant="outline">{String(r.format)}</Badge>
                  <Badge variant={r.enabled ? "success" : "secondary"}>{r.enabled ? "Enabled" : "Disabled"}</Badge>
                  <span className="text-xs text-muted-foreground">→ {(r.recipientEmails as string[] | undefined)?.join(", ")}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Last run: {String(r.lastRunAt ? new Date(String(r.lastRunAt)).toLocaleString() : "never")}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => void runNow(String(r.id))} title="Run now">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void toggleEnabled(r)} title={r.enabled ? "Disable" : "Enable"}>
                  {r.enabled ? "Disable" : "Enable"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void remove(String(r.id))} title="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}