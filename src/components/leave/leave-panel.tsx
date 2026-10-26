"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch, listResource, leaveRequestApi, leaveTypeApi, employeesApi, leaveEncashmentApi } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";
import { formatDate, formatCurrency } from "@/lib/utils";

type Row = Record<string, unknown>;

function fmtDate(v?: unknown): string {
  return formatDate(v as string | Date | null | undefined);
}

function fmtCurrency(v?: unknown): string {
  return formatCurrency(v as number | string | null | undefined);
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  CANCELLED: "outline",
} as const;

export function LeavePanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [tab, setTab] = useState("requests");
  const [types, setTypes] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [encOpen, setEncOpen] = useState(false);
  const [encashments, setEncashments] = useState<Row[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, reset } = useForm();

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const res = await listResource<Row>(leaveRequestApi, { page: p, pageSize, status: status || undefined });
        setRows(res.data);
        setTotal(res.meta.total);
        setPage(res.meta.page);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [status, pageSize]
  );

  useEffect(() => {
    void load(page);
  }, [load]);

  const loadOptions = useCallback(async () => {
    try {
      const [t, e] = await Promise.all([
        listResource<Row>(leaveTypeApi, { pageSize: 100 }),
        listResource<Row>(employeesApi, { pageSize: 1000 }),
      ]);
      setTypes(t.data);
      setEmployees(e.data);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const loadEncashments = useCallback(async () => {
    try {
      const res = await listResource<Row>(leaveEncashmentApi, { pageSize: 100 });
      setEncashments(res.data);
    } catch {
      setEncashments([]);
    }
  }, []);

  useEffect(() => {
    void loadEncashments();
  }, [loadEncashments]);

  const decideEnc = async (row: Row, approve: boolean) => {
    if (!window.confirm(`${approve ? "Approve" : "Reject"} encashment of ${String(row.days)} day(s)?`)) return;
    try {
      await apiFetch(`${leaveEncashmentApi}/${String(row.id)}`, { method: "POST", body: JSON.stringify({ approve }) });
      toast.success(`Encashment ${approve ? "approved" : "rejected"}.`);
      void loadEncashments();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Action failed.");
    }
  };

  const onEncAsh = handleSubmit(async (values: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      await apiFetch(leaveEncashmentApi, {
        method: "POST",
        body: JSON.stringify({
          employeeId: String(values.employeeId),
          leaveTypeId: String(values.leaveTypeId),
          days: Number(values.days),
          ratePerDay: Number(values.ratePerDay),
        }),
      });
      toast.success("Encashment requested.");
      setEncOpen(false);
      void loadEncashments();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Request failed.");
    } finally {
      setSubmitting(false);
    }
  });

  const decide = async (row: Row, decision: "APPROVED" | "REJECTED") => {
    const emp = row.employee as Row | undefined;
    if (!window.confirm(`${decision === "APPROVED" ? "Approve" : "Reject"} leave request for "${String(emp?.firstName ?? "")} ${String(emp?.lastName ?? "")}"?`))
      return;
    try {
      await apiFetch(`${leaveRequestApi}/${String(row.id)}/${decision === "APPROVED" ? "approve" : "reject"}`, { method: "POST" });
      toast.success(`Request ${decision === "APPROVED" ? "approved" : "rejected"}.`);
      void load(page);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : `Failed to ${decision.toLowerCase()} request.`);
    }
  };

  const onSubmit = handleSubmit(async (values: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      await apiFetch(leaveRequestApi, { method: "POST", body: JSON.stringify(values) });
      toast.success("Leave request created.");
      setOpen(false);
      reset({});
      void load(page);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Could not create request.");
    } finally {
      setSubmitting(false);
    }
  });

  const columns = useMemo<Column<Row>[]>(
    () => [
      {
        key: "employee",
        title: "Employee",
        render: (r) => {
          const emp = r.employee as Row | undefined;
          return (
            <div>
              <p className="font-medium">
                {emp ? `${String(emp.firstName ?? "")} ${String(emp.lastName ?? "")}`.trim() : "—"}
              </p>
              <p className="text-xs text-muted-foreground">{emp?.employeeCode ? String(emp.employeeCode) : ""}</p>
            </div>
          );
        },
      },
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
            <p className="text-xs text-muted-foreground">
              {String(r.daysRequested ?? "—")} day(s)
              {r.isHalfDay ? ` · ${String(r.halfDayType ?? "first")} half` : ""}
            </p>
          </div>
        ),
      },
      { key: "reason", title: "Reason", render: (r) => <span className="max-w-[220px] truncate text-sm">{String(r.reason ?? "—")}</span> },
      {
        key: "status",
        title: "Status",
        render: (r) => <Badge variant={(STATUS_STYLE[String(r.status)] ?? "outline") as "outline"}>{String(r.status)}</Badge>,
      },
      {
        key: "_actions",
        title: "",
        className: "w-24",
        render: (r) =>
          String(r.status) === "PENDING" ? (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" className="text-emerald-600" onClick={() => decide(r, "APPROVED")} aria-label="Approve">
                <Check className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => decide(r, "REJECTED")} aria-label="Reject">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const encColumns: Column<Row>[] = [
    {
      key: "employee",
      title: "Employee",
      render: (r) => {
        const emp = r.employee as Row | undefined;
        return emp ? `${String(emp.firstName ?? "")} ${String(emp.lastName ?? "")}`.trim() : "—";
      },
    },
    {
      key: "leaveType",
      title: "Type",
      render: (r) => <Badge variant="outline">{String((r.leaveType as Row | undefined)?.name ?? "—")}</Badge>,
    },
    { key: "year", title: "Year", render: (r) => <Badge variant="secondary">{String(r.year)}</Badge> },
    { key: "days", title: "Days", render: (r) => <span className="font-medium">{String(r.days)}</span> },
    { key: "amount", title: "Amount", render: (r) => fmtCurrency(r.amount) },
    {
      key: "status",
      title: "Status",
      render: (r) => (
        <Badge variant={String(r.status) === "APPROVED" ? "success" : String(r.status) === "PENDING" ? "warning" : "outline"}>
          {String(r.status)}
        </Badge>
      ),
    },
    {
      key: "_actions",
      title: "",
      className: "w-24",
      render: (r) =>
        String(r.status) === "PENDING" ? (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" className="text-emerald-600" onClick={() => decideEnc(r, true)} aria-label="Approve">
              <Check className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-destructive" onClick={() => decideEnc(r, false)} aria-label="Reject">
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Leave management</h1>
          <p className="text-sm text-muted-foreground">Apply on behalf of employees, approve or reject requests.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Apply for employee
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: "requests", label: "Requests" },
          { value: "calendar", label: "Calendar" },
          { value: "encashments", label: "Encashments" },
        ]}
      />

        {tab === "encashments" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-end">
              <Button variant="outline" size="sm" onClick={() => setEncOpen(true)}>
                <Plus className="h-4 w-4" /> Request encashment
              </Button>
            </div>
            <DataTable
              columns={encColumns}
              rows={encashments}
              loading={false}
              total={encashments.length}
              page={1}
              pageSize={encashments.length || 1}
              onPageChange={() => undefined}
            />
          </div>
        ) : tab === "calendar" ? (
          <LeaveCalendar rows={rows} />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
                <option value="">All statuses</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </Select>
            </div>

            <DataTable
              columns={columns}
              rows={rows}
              loading={loading}
              total={total}
              page={page}
              pageSize={pageSize}
              onPageChange={(p) => void load(p)}
            />
          </div>
        )}

      <Dialog open={open} onOpenChange={setOpen} title="Apply leave for employee" size="lg">
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <Label className="flex cursor-pointer items-center gap-2 pt-2">
            <input type="checkbox" className="h-4 w-4 rounded border-input" {...register("isHalfDay")} />
            Half-day
          </Label>
          <div className="space-y-1.5">
            <Label>Half day</Label>
            <Select defaultValue="first" {...register("halfDayType")}>
              <option value="first">First half</option>
              <option value="second">Second half</option>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Reason</Label>
            <Textarea rows={2} {...register("reason")} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={encOpen} onOpenChange={setEncOpen} title="Request leave encashment" description="Convert unused leave days into pay.">
        <form onSubmit={onEncAsh} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <Label>Days *</Label>
            <Input type="number" min={0.5} step={0.5} required {...register("days")} />
          </div>
          <div className="space-y-1.5">
            <Label>Rate per day (INR) *</Label>
            <Input type="number" min={0} step="0.01" required {...register("ratePerDay")} />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setEncOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function LeaveCalendar({ rows }: { rows: Row[] }) {
  const events = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const r of rows) {
      if (String(r.status) !== "APPROVED") continue;
      const name = `${String((r.employee as Row | undefined)?.firstName ?? "")} ${String((r.employee as Row | undefined)?.lastName ?? "")}`.trim();
      const start = new Date(String(r.startDate));
      const end = new Date(String(r.endDate));
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = keyOf(d);
        map.set(key, [...(map.get(key) ?? []), name]);
      }
    }
    return map;
  }, [rows]);

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const offset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => keyOf(new Date(year, month, i + 1))),
  ];

  return (
    <div className="grid grid-cols-7 gap-2 rounded-lg border p-3">
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
        <div key={d} className="text-center text-xs font-medium text-muted-foreground">
          {d}
        </div>
      ))}
      {cells.map((d, i) =>
        d === null ? (
          <div key={`e-${i}`} />
        ) : (
          <div key={d} className="min-h-16 rounded-md border bg-card p-1.5 text-sm">
            <p className="text-xs text-muted-foreground">{Number(d.slice(8))}</p>
            {events.get(d)?.map((n, j) => (
              <p key={`${d}-${j}`} className="truncate text-[11px] font-medium text-primary">
                {n}
              </p>
            ))}
          </div>
        )
      )}
    </div>
  );
}