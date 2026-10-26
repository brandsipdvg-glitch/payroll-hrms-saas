"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Printer, CloudDownload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { apiFetch, myPayslipsApi, ApiClientError } from "@/lib/client/api";
import { formatCurrency, formatDate } from "@/lib/utils";

type Row = Record<string, unknown>;

export function MyPayslips() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<Row[]>(myPayslipsApi);
      setRows(res);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load your payslips.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<Row>[] = [
    {
      key: "period",
      title: "Period",
      render: (r) => {
        const run = r.run as Row | undefined;
        if (!run) return "—";
        const y = Number(run.year ?? new Date().getFullYear());
        const m = Number(run.month ?? 1);
        return <span className="font-medium">{new Date(`${y}-${m}-01`).toLocaleString("en-US", { month: "long", year: "numeric" })}</span>;
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
    { key: "payrollDays", title: "Pay days", render: (r) => <span>{Number(r.payrollDays)}</span> },
    { key: "totalEarnings", title: "Earnings", render: (r) => <span>{formatCurrency(Number(r.totalEarnings))}</span> },
    { key: "totalDeductions", title: "Deductions", render: (r) => <span>{formatCurrency(Number(r.totalDeductions))}</span> },
    { key: "netSalary", title: "Net pay", render: (r) => <span className="font-semibold">{formatCurrency(Number(r.netSalary))}</span> },
    { key: "createdAt", title: "Generated", render: (r) => <span>{formatDate(r.createdAt as string)}</span> },
    {
      key: "actions",
      title: "",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => window.open(`/api/v1/me/payslips/${String(r.id)}/print`, "_blank")}>
            <CloudDownload className="mr-1.5 h-4 w-4" /> PDF
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Print" onClick={() => window.open(`/api/v1/me/payslips/${String(r.id)}/print`, "_blank")}>
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">My payslips</h1>
        <p className="text-sm text-muted-foreground">
          Download or print your payslips as PDF. The print view is saveable as a PDF from the browser.
        </p>
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} total={rows.length} page={1} pageSize={rows.length || 1} onPageChange={() => undefined} empty="No payslips have been issued to you yet." />
    </div>
  );
}