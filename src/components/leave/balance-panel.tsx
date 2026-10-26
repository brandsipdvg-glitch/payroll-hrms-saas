"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck2, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch, listResource, leaveBalanceApi } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";

type Row = Record<string, unknown>;

export function BalancePanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [busy, setBusy] = useState("");

  const load = useCallback(
    async (p: number, y: string) => {
      setLoading(true);
      try {
        const res = await listResource<Row>(leaveBalanceApi, { page: p, pageSize, year: y });
        setRows(res.data);
        setTotal(res.meta.total);
        setPage(res.meta.page);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [pageSize]
  );

  useEffect(() => {
    void load(page, year);
  }, [load, year]);

  const runProcess = async (kind: "credit" | "year-end") => {
    if (!window.confirm(`Run ${kind} process now? This may create or modify leave balances.`)) return;
    setBusy(kind);
    try {
      const res = await apiFetch<Row>(`/api/v1/leave/balances/${kind === "credit" ? "credit" : "year-end"}`, {
        method: "POST",
        body: JSON.stringify({ year: Number(year) }),
      });
      toast.success(`${kind === "credit" ? "Annual credits" : "Year-end process"} done: ${String(res.message ?? "")}`);
      void load(page, year);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Process failed.");
    } finally {
      setBusy("");
    }
  };

  const columns = useMemo<Column<Row>[]>(
    () => [
      {
        key: "employee",
        title: "Employee",
        render: (r) => {
          const emp = r.employee as Row | undefined;
          return (
            <div>
              <p className="font-medium">{emp ? `${String(emp.firstName ?? "")} ${String(emp.lastName ?? "")}`.trim() : "—"}</p>
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
          return <Badge variant="outline">{String(t?.name ?? "—")}</Badge>;
        },
      },
      { key: "year", title: "Year", render: (r) => <Badge variant="secondary">{String(r.year)}</Badge> },
      { key: "openingBalance", title: "Opening", render: (r) => <span className="font-medium">{Number(r.openingBalance ?? 0)}</span> },
      { key: "credited", title: "Credited", render: (r) => <span className="text-emerald-600">+{Number(r.credited ?? 0)}</span> },
      { key: "availed", title: "Availed", render: (r) => <span className="text-rose-600">−{Number(r.availed ?? 0)}</span> },
      { key: "lapsed", title: "Lapsed", render: (r) => <span className="text-amber-600">−{Number(r.lapsed ?? 0)}</span> },
      { key: "encashed", title: "Encashed", render: (r) => <span className="text-amber-600">−{Number(r.encashed ?? 0)}</span> },
      {
        key: "closingBalance",
        title: "Available",
        render: (r) => <Badge variant="success">{Number(r.closingBalance ?? 0)}</Badge>,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Leave balances</h1>
          <p className="text-sm text-muted-foreground">Opening, credited, availed and available balances per employee.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-28 space-y-1">
            <Label>Year</Label>
            <Input type="number" min={2020} max={2100} value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarCheck2 className="h-4 w-4" /> Annual credit
            </CardTitle>
            <CardDescription>Credit yearly entitlement for leave types with ANNUAL/PRORATA accrual.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" disabled={busy === "credit"} onClick={() => runProcess("credit")}>
              {busy === "credit" ? "Running…" : "Run annual credit"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarRange className="h-4 w-4" /> Year-end roll-over
            </CardTitle>
            <CardDescription>Carry forward up to the maximum, lapse the rest, and close the year.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" disabled={busy === "year-end"} onClick={() => runProcess("year-end")}>
              {busy === "year-end" ? "Running…" : "Run year-end"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={(p) => void load(p, year)}
      />
    </div>
  );
}