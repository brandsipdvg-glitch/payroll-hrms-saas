"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FileUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch, listResource, attendanceApi, attendanceImportApi, employeesApi } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";
import { formatDate, formatDateTime, titleCase } from "@/lib/utils";

type Row = Record<string, unknown>;
type Emp = Record<string, unknown>;

function fmtDate(v?: unknown): string {
  return formatDate(v as string | Date | null | undefined);
}

function fmtDateTime(v?: unknown): string {
  return formatDateTime(v as string | Date | null | undefined);
}

const STATUS_STYLE: Record<string, string> = {
  PRESENT: "success",
  ABSENT: "destructive",
  HALF_DAY: "warning",
  ON_LEAVE: "outline",
  WEEK_OFF: "secondary",
  HOLIDAY: "secondary",
  PENDING: "warning",
} as const;

function fmtTime(v?: unknown): string {
  if (!v) return "—";
  return new Date(String(v)).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function minsToHm(v?: unknown): string {
  const n = Number(v ?? 0);
  if (n <= 0) return "—";
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("File must have a header row and at least one data row.");
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const canonicalHeader = (header: string) => {
    const normalized = header.replace(/^\uFEFF/, "").trim().replace(/^"|"$/g, "").toLowerCase().replace(/[ _-]/g, "");
    return ({
      employeecode: "employeeCode",
      employeeid: "employeeId",
      date: "date",
      intime: "inTime",
      outtime: "outTime",
      breakminutes: "breakMinutes",
      shiftcode: "shiftCode",
    }[normalized] ?? normalized);
  };
  const headers = lines[0].split(delimiter).map(canonicalHeader);
  return lines.slice(1).map((line) => {
    const cells: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === delimiter && !inQ) {
        cells.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    cells.push(cur.trim());
    const row: Row = {};
    headers.forEach((h, i) => {
      if (h) row[h] = cells[i] ?? null;
    });
    return row;
  });
}

export function AttendancePanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [imports, setImports] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [summary, setSummary] = useState<Row>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, reset } = useForm();

  const loadOptions = useCallback(async () => {
    try {
      const res = await listResource<Emp>(employeesApi, { pageSize: 1000 });
      setEmployees(res.data);
    } catch {
      setEmployees([]);
    }
  }, []);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const res = await listResource<Row>(attendanceApi, {
          page: p,
          pageSize,
          from: from || undefined,
          to: to || undefined,
          status: status || undefined,
          employeeId: employeeId || undefined,
        });
        setRows(res.data);
        setTotal(res.meta.total);
        setPage(res.meta.page);
        const counts: Row = { present: 0, absent: 0, halfDay: 0, onLeave: 0 };
        for (const r of res.data) {
          const s = String(r.status);
          if (s === "PRESENT") counts.present = Number(counts.present) + 1;
          else if (s === "ABSENT") counts.absent = Number(counts.absent) + 1;
          else if (s === "HALF_DAY") counts.halfDay = Number(counts.halfDay) + 1;
          else if (s === "ON_LEAVE") counts.onLeave = Number(counts.onLeave) + 1;
        }
        setSummary(counts);
      } catch (e) {
        toast.error(e instanceof ApiClientError ? e.message : "Failed to load attendance.");
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [from, to, status, employeeId, pageSize]
  );

  useEffect(() => {
    void load(page);
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    reset({ breakMinutes: 0 });
    setOpen(true);
  };

  const openEdit = (row: Row) => {
    setEditing(row);
    reset({
      date: String(row.date ?? "").slice(0, 10),
      inTime: String(row.inTime ?? "").slice(0, 16),
      outTime: String(row.outTime ?? "").slice(0, 16),
      breakMinutes: Number(row.breakMinutes ?? 0),
      remarks: String(row.remarks ?? ""),
    });
    setOpen(true);
  };

  const onSubmit = handleSubmit(async (values: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        employeeId: editing ? String(editing.employeeId) : values.employeeId,
        date: String(values.date),
        breakMinutes: Number(values.breakMinutes ?? 0),
        remarks: values.remarks ? String(values.remarks) : undefined,
      };
      for (const k of ["inTime", "outTime"] as const) {
        if (values[k]) payload[k] = new Date(String(values[k])).toISOString();
      }
      if (editing) {
        await apiFetch(`${attendanceApi}/${String(editing.id)}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast.success("Attendance updated.");
      } else {
        await apiFetch(attendanceApi, { method: "POST", body: JSON.stringify(payload) });
        toast.success("Attendance recorded.");
      }
      setOpen(false);
      void load(page);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Save failed.");
    } finally {
      setSubmitting(false);
    }
  });

  const onDelete = async (row: Row) => {
    if (!window.confirm(`Delete attendance for ${fmtDate(row.date)}?`)) return;
    try {
      await apiFetch(`${attendanceApi}/${String(row.id)}`, { method: "DELETE" });
      toast.success("Attendance deleted.");
      void load(page);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Delete failed.");
    }
  };

  const onImport = handleSubmit(async (values: Record<string, unknown>) => {
    const file = (values.file as FileList | undefined)?.[0];
    if (!file) return;
    setSubmitting(true);
    try {
      let text: string;
      if (file.name.toLowerCase().endsWith(".csv")) {
        text = await file.text();
      } else {
        text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error("Could not read file."));
          reader.readAsText(file);
        });
      }
      const parsed = parseCsv(text);
      const result = await apiFetch<Row>(attendanceImportApi, {
        method: "POST",
        body: JSON.stringify({ source: file.name.toLowerCase().endsWith(".csv") ? "CSV_IMPORT" : "EXCEL_IMPORT", fileName: file.name, rows: parsed }),
      });
      setImportOpen(false);
      reset({});
      toast.success(`Imported ${result.success ?? 0} record(s), ${result.failed ?? 0} failed.`);
      void load(page);
      void loadImports();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Import failed.");
    } finally {
      setSubmitting(false);
    }
  });

  const loadImports = useCallback(async () => {
    try {
      const res = await listResource<Row>(attendanceImportApi, { pageSize: 50 });
      setImports(res.data);
    } catch {
      setImports([]);
    }
  }, []);

  useEffect(() => {
    void loadImports();
  }, [loadImports]);

  const columns = useMemo<Column<Row>[]>(
    () => [
      {
        key: "employee",
        title: "Employee",
        render: (r) => {
          const emp = r.employee as Emp | undefined;
          return (
            <div>
              <p className="font-medium">
                {emp ? `${String(emp.firstName ?? "")} ${String(emp.lastName ?? "")}`.trim() : r.employeeCode ? String(r.employeeCode) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">{emp?.employeeCode ? String(emp.employeeCode) : "—"}</p>
            </div>
          );
        },
      },
      { key: "date", title: "Date", render: (r) => fmtDate(r.date) },
      { key: "shift", title: "Shift", render: (r) => ((r.shift as Emp | null)?.name ? String((r.shift as Emp).name) : "Default") },
      { key: "inTime", title: "In", render: (r) => fmtTime(r.inTime) },
      { key: "outTime", title: "Out", render: (r) => fmtTime(r.outTime) },
      { key: "workingMinutes", title: "Hours", render: (r) => minsToHm(r.workingMinutes) },
      { key: "lateMinutes", title: "Late", render: (r) => minsToHm(r.lateMinutes) },
      { key: "earlyGoingMinutes", title: "Early", render: (r) => minsToHm(r.earlyGoingMinutes) },
      { key: "overtimeMinutes", title: "OT", render: (r) => minsToHm(r.overtimeMinutes) },
      {
        key: "status",
        title: "Status",
        render: (r) => <Badge variant={(STATUS_STYLE[String(r.status)] ?? "outline") as "outline"}>{String(r.status ?? "—")}</Badge>,
      },
      {
        key: "source",
        title: "Source",
        render: (r) => <span className="text-xs text-muted-foreground">{String(r.source ?? "—")}</span>,
      },
      {
        key: "_actions",
        title: "",
        className: "w-20",
        render: (r) => (
          <div className="flex justify-end gap-1">
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
          <h1 className="text-xl font-semibold">Attendance</h1>
          <p className="text-sm text-muted-foreground">Capture, manage and review employee attendance records.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileUp className="h-4 w-4" /> Import
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add record
          </Button>
        </div>
      </div>

      {Object.keys(summary).length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(["present", "absent", "halfDay", "onLeave"] as const).map((k) => (
            <Card key={k}>
              <CardContent className="p-5">
                <p className="text-2xl font-bold leading-none">{Number(summary[k] ?? 0)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{titleCase(k)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {["PRESENT", "ABSENT", "HALF_DAY", "ON_LEAVE", "WEEK_OFF", "HOLIDAY", "PENDING"].map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">All employees</option>
                {employees.map((e) => (
                  <option key={String(e.id)} value={String(e.id)}>
                    {`${String(e.firstName ?? "")} ${String(e.lastName ?? "")}`.trim()} · {String(e.employeeCode ?? "")}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setFrom("");
                  setTo("");
                  setStatus("");
                  setEmployeeId("");
                  void load(1);
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={(p) => void load(p)}
        searchPlaceholder="Search attendance…"
      />

      <Dialog open={open} onOpenChange={setOpen} title={editing ? "Edit attendance" : "Record attendance"} size="lg">
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!editing ? (
            <div className="space-y-1.5">
              <Label>Employee *</Label>
              <Select required {...register("employeeId")}>
                <option value="">Select…</option>
                {employees.map((e) => (
                  <option key={String(e.id)} value={String(e.id)}>
                    {`${String(e.firstName ?? "")} ${String(e.lastName ?? "")}`.trim()} · {String(e.employeeCode ?? "")}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Date *</Label>
            <Input type="date" required {...register("date")} />
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
            <Label>Break (minutes)</Label>
            <Input type="number" min={0} step={1} {...register("breakMinutes")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Remarks</Label>
            <Textarea rows={2} {...register("remarks")} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : editing ? "Save changes" : "Record"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen} title="Import attendance" description="Upload a CSV or TSV file.">
        <form onSubmit={onImport} className="space-y-4">
          <div className="space-y-1.5">
            <Label>File</Label>
            <Input type="file" accept=".csv,.tsv,.txt" required {...register("file")} />
          </div>
          <p className="text-xs text-muted-foreground">
            Expected headers: <code>employeeCode</code>, <code>date</code> (YYYY-MM-DD), <code>inTime</code>, <code>outTime</code>{" "}
            (HH:mm or HH:mm:ss), optional <code>breakMinutes</code>. One row per employee per day.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Importing…" : "Import"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent imports</CardTitle>
          <CardDescription>Last uploads and their outcome.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {imports.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            imports.map((r) => (
              <div key={String(r.id)} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium">{String(r.fileName ?? "Import")}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDateTime(r.createdAt)} · {String(r.source ?? "")} · {r.totalRows ? `${Number(r.totalRows)} rows` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">
                    {r.inserted ? `${Number(r.inserted)} new` : ""} {r.updated ? `· ${Number(r.updated)} updated` : ""}{" "}
                    {r.failed ? `· ${Number(r.failed)} failed` : ""}
                  </span>
                  <Badge variant={Number(r.failed ?? 0) > 0 ? "warning" : "success"}>
                    {Number(r.failed ?? 0) > 0 ? "Partial" : "Done"}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
