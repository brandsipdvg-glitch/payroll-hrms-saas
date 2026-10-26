"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch, downloadResource } from "@/lib/client/api";
import { reportTypeApi, reportQueryApi, reportSchemaApi, savedReportsApi } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";
import { formatCurrency } from "@/lib/utils";

type Row = Record<string, unknown>;

interface SchemaColumn {
  key: string;
  label: string;
}
interface ReportObjectSchema {
  columns: SchemaColumn[];
}
type SchemaMap = Record<string, ReportObjectSchema>;

const REPORT_TYPES = ["PAYROLL", "COMPLIANCE", "HR"] as const;
const QUERY_OBJECTS = ["employees", "attendance", "leaveRequests", "reimbursements", "loans", "payslips", "bonusAllocations", "gratuityRecords", "settlements", "assets"] as const;
const FORMATS = ["CSV", "EXCEL", "PDF"] as const;

function val(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return String(v);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return String(v);
}

export function ReportRunner() {
  const [mode, setMode] = useState<"report" | "query" | "saved">("report");
  const [reportType, setReportType] = useState("PAYROLL");
  const [queryObject, setQueryObject] = useState("reimbursements");
  const [month, setMonth] = useState(String(new Date().getMonth()));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [format, setFormat] = useState("EXCEL");
  const [columns, setColumns] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Row>({});
  const [schema, setSchema] = useState<SchemaMap>({});
  const [saved, setSaved] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saveName, setSaveName] = useState("");

  const loadSchema = useCallback(async () => {
    try {
      const s = await apiFetch<SchemaMap>(reportSchemaApi);
      setSchema(s);
    } catch {}
  }, []);

  const loadSaved = useCallback(async () => {
    try {
      const list = await apiFetch<Row[]>(savedReportsApi);
      setSaved(list ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    void loadSchema();
    void loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runReport = async () => {
    setLoading(true);
    setRows([]);
    setSummary({});
    try {
      if (mode === "report") {
        const qs = new URLSearchParams({ month, year });
        if (status) qs.set("status", status);
        const data = await apiFetch<{ rows: Row[]; summary: Row }>(`${reportTypeApi(reportType.toLowerCase())}?${qs.toString()}`);
        setRows(data.rows ?? []);
        setSummary(data.summary ?? {});
      } else if (mode === "query") {
        const qs = new URLSearchParams({ object: queryObject });
        if (status) qs.set("status", status);
        if (columns) qs.set("columns", columns);
        const data = await apiFetch<{ rows: Row[]; object: string }>(`${reportQueryApi}?${qs.toString()}`);
        setRows(data.rows ?? []);
      }
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to run report.");
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = async (url: string) => {
    try {
      await downloadResource(url);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Download failed.");
    }
  };

  const exportReport = () => {
    if (mode === "report") {
      const qs = new URLSearchParams({ month, year, format });
      if (status) qs.set("status", status);
      void downloadFile(`${reportTypeApi(reportType.toLowerCase())}?${qs.toString()}`);
    } else if (mode === "query") {
      const qs = new URLSearchParams({ object: queryObject, format, name: queryObject });
      if (status) qs.set("status", status);
      if (columns) qs.set("columns", columns);
      void downloadFile(`${reportQueryApi}?${qs.toString()}`);
    }
  };

  const saveReport = async () => {
    if (!saveName) { toast.error("Report name is required."); return; }
    if (!rows.length) { toast.error("Run a report first before saving."); return; }
    setSaving(true);
    try {
      await apiFetch(savedReportsApi, {
        method: "POST",
        body: JSON.stringify({
          name: saveName,
          reportType,
          object: queryObject,
          columns: rows[0] ? Object.keys(rows[0]).slice(0, 12) : [],
          filters: { status, month, year },
        }),
      });
      toast.success("Report saved.");
      setSaveName("");
      void loadSaved();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to save report.");
    } finally {
      setSaving(false);
    }
  };

  const runSaved = async (id: string) => {
    setLoading(true);
    setRows([]);
    try {
      const data = await apiFetch<{ rows: Row[]; columns: string[] }>(`${savedReportsApi}/${id}/run?format=`);
      setRows(data.rows ?? []);
      toast.success(`Loaded ${data.rows.length} rows.`);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to run saved report.");
    } finally {
      setLoading(false);
    }
  };

  const dynamicColumns: Column<Row>[] =
    rows.length
      ? Object.keys(rows[0]).map((k) => ({
          key: k,
          title: k,
          render: (r) => {
            const v = r[k];
            if (typeof v === "number" && (k.toLowerCase().includes("amount") || k.toLowerCase().includes("gross") || k.toLowerCase().includes("net") || k.toLowerCase().includes("salary") || k.toLowerCase().includes("deductions") || k.toLowerCase().includes("pf") || k.toLowerCase().includes("esi") || k.toLowerCase().includes("bonus") || k.toLowerCase().includes("gratuity") || k.toLowerCase().includes("repayable"))) {
              return <span className="tabular-nums">{formatCurrency(Number(v))}</span>;
            }
            return <span className="tabular-nums">{val(v)}</span>;
          },
        }))
      : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">Run payroll, compliance, HR reports. Query data. Save report definitions.</p>
        </div>
      </div>

      <div className="inline-flex gap-1 rounded-lg border bg-muted/50 p-1" role="tablist">
        {(["report", "query", "saved"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {m === "report" ? "Standard Reports" : m === "query" ? "Query Builder" : "Saved Reports"}
          </button>
        ))}
      </div>

      {mode === "report" ? (
        <Card>
          <CardContent className="grid gap-3 p-5 sm:grid-cols-5">
            <div className="space-y-1.5">
              <Label>Report type</Label>
              <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={reportType} onChange={(e) => setReportType(e.target.value)}>
                {REPORT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Month</Label>
              <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map((m) => (
                  <option key={m} value={m}>{new Date(2026, Number(m) - 1).toLocaleString("en-US", { month: "long" })}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status filter</Label>
              <Input placeholder="e.g. ACTIVE, PENDING" value={status} onChange={(e) => setStatus(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={runReport} disabled={loading} className="flex-1">
                <Play className="mr-1 h-4 w-4" /> Run
              </Button>
              <Button variant="outline" onClick={exportReport}>
                <Download className="mr-1 h-4 w-4" /> Export
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : mode === "query" ? (
        <Card>
          <CardContent className="grid gap-3 p-5 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Object</Label>
              <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={queryObject} onChange={(e) => setQueryObject(e.target.value)}>
                {QUERY_OBJECTS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Columns (comma-separated)</Label>
              <Input placeholder="e.g. employeeCode, name, status" value={columns} onChange={(e) => setColumns(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status filter</Label>
              <Input value={status} onChange={(e) => setStatus(e.target.value)} />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={runReport} disabled={loading} className="flex-1">
                <Play className="mr-1 h-4 w-4" /> Run
              </Button>
              <Button variant="outline" onClick={exportReport}>
                <Download className="mr-1 h-4 w-4" /> Export
              </Button>
            </div>
            {schema[queryObject]?.columns?.length ? (
              <p className="col-span-4 mt-1 text-xs text-muted-foreground">
                Available columns: {schema[queryObject].columns.map((c) => c.label).join(", ")}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {mode === "saved" ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="grid gap-3 p-5 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Save current report</Label>
                <Input placeholder="Report name" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button onClick={saveReport} disabled={saving} className="w-full">
                  <Save className="mr-1 h-4 w-4" /> {saving ? "Saving…" : "Save report"}
                </Button>
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((r) => (
              <Card key={String(r.id)} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => void runSaved(String(r.id))}>
                <CardContent className="p-4">
                  <p className="font-medium">{String(r.name)}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="secondary">{String(r.reportType)}</Badge>
                    <Badge variant="outline">{String(r.object)}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
            {saved.length === 0 ? <p className="text-sm text-muted-foreground">No saved reports yet. Run a query and save it.</p> : null}
          </div>
        </div>
      ) : null}

      {Object.keys(summary).length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(summary)
            .filter(([, v]) => typeof v === "number")
            .slice(0, 8)
            .map(([k, v]) => (
              <Card key={k}>
                <CardContent className="p-4">
                  <p className="text-lg font-bold">{typeof v === "number" ? v.toLocaleString() : String(v)}</p>
                  <p className="text-xs text-muted-foreground">{k.replace(/([A-Z])/g, " $1").trim()}</p>
                </CardContent>
              </Card>
            ))}
        </div>
      ) : null}

      <DataTable columns={dynamicColumns} rows={rows} loading={loading} total={rows.length} page={1} pageSize={rows.length || 1} onPageChange={() => undefined} empty={<span>{loading ? "Loading…" : "Run a report to see results."}</span>} />
    </div>
  );
}