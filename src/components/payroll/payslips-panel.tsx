"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch, payrollPayslipsApi, payrollRunsApi, ApiClientError } from "@/lib/client/api";
import { formatCurrency, formatDate } from "@/lib/utils";

type Row = Record<string, unknown>;

export function PayslipsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [runs, setRuns] = useState<Row[]>([]);
  const [runId, setRunId] = useState("all");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const where = runId === "all" ? "" : `?runId=${runId}`;
      const [payslips, rs] = await Promise.all([
        apiFetch<Row[]>(`${payrollPayslipsApi}${where}`),
        apiFetch<Row[]>(payrollRunsApi),
      ]);
      setRows(payslips);
      setRuns(rs);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load payslips.");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<Row>[] = [
    {
      key: "employee",
      title: "Employee",
      render: (r) => {
        const emp = r.employee as Row | undefined;
        const desig = emp?.designation as Row | undefined;
        return (
          <div>
            <p className="font-medium">
              {String(emp?.firstName ?? "")} {String(emp?.lastName ?? "")}
            </p>
            <p className="text-xs text-muted-foreground">
              {String(emp?.employeeCode ?? "")} · {String(desig?.title ?? "")}
            </p>
          </div>
        );
      },
    },
    {
      key: "period",
      title: "Period",
      render: (r) => {
        const run = r.run as Row | undefined;
        return <span>{run ? `${String(run.month)}/${String(run.year)}` : "—"}</span>;
      },
    },
    {
      key: "status",
      title: "Status",
      render: (r) => (
        <Badge variant={String(r.status) === "PAID" ? "success" : String(r.status) === "FINAL" ? "default" : "warning"}>
          {String(r.status)}
        </Badge>
      ),
    },
    { key: "netSalary", title: "Net", render: (r) => <span className="font-semibold">{formatCurrency(Number(r.netSalary))}</span> },
    { key: "overtimePay", title: "OT", render: (r) => <span>{Number(r.overtimePay) ? formatCurrency(Number(r.overtimePay)) : "—"}</span> },
    { key: "bonus", title: "Bonus/Reim.", render: (r) => <span>{formatCurrency(Number(r.bonus) + Number(r.reimbursements) + Number(r.incentives) + Number(r.arrears))}</span> },
    { key: "createdAt", title: "Generated", render: (r) => <span>{formatDate(r.createdAt as string)}</span> },
    {
      key: "actions",
      title: "",
      render: (r) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => window.open(`/api/v1/payroll/payslips/${String(r.id)}/print`, "_blank")}>
            <Printer className="mr-1.5 h-4 w-4" /> Print
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">All payslips</h1>
          <p className="text-sm text-muted-foreground">Every generated payslip across payroll runs.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={runId} onChange={(e) => setRunId(e.target.value)} className="w-52">
            <option value="all">All runs</option>
            {runs.map((r) => (
              <option key={String(r.id)} value={String(r.id)}>
                {String(r.month)}/{String(r.year)} · {String(r.status)}
              </option>
            ))}
          </Select>
          <Link href="/payroll/runs">
            <Button variant="outline" size="sm">Runs</Button>
          </Link>
        </div>
      </div>

      <DataTable columns={columns} rows={rows} loading={loading} total={rows.length} page={1} pageSize={rows.length || 1} onPageChange={() => undefined} empty="No payslips generated for this filter." />
    </div>
  );
}