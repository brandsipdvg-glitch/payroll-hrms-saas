"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, RefreshCw } from "lucide-react";
import { DataTable, Column } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch, ApiClientError, meLoansApi } from "@/lib/client/api";
import { formatCurrency } from "@/lib/utils";

type LoanRow = Record<string, unknown>;
type EmiRow = { year: number; month: number; principal: string | number; interest: string | number; total: string | number; closingBalance: string | number; status: string };

export function MyLoansPanel() {
  const [rows, setRows] = useState<LoanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [viewTarget, setViewTarget] = useState<LoanRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await apiFetch<LoanRow[]>(meLoansApi)) ?? []);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load your loans.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refresh]);

  const statusBadge = (s: string) => {
    if (s === "ACTIVE") return <Badge variant="success">Active</Badge>;
    if (s === "CLOSED") return <Badge variant="default">Closed</Badge>;
    if (s === "CANCELLED") return <Badge variant="destructive">Cancelled</Badge>;
    return <Badge variant="warning">Approved</Badge>;
  };

  const columns: Column<LoanRow>[] = [
    { key: "loanType", title: "Type", render: (r) => String(r.loanType).split("_").join(" ") },
    { key: "principalAmount", title: "Principal", className: "text-right", render: (r) => formatCurrency(Number(r.principalAmount)) },
    { key: "interestRateAnnual", title: "Rate", render: (r) => `${Number(r.interestRateAnnual)}% p.a.` },
    { key: "tenureMonths", title: "Tenure", render: (r) => `${r.tenureMonths} mo` },
    { key: "emiAmount", title: "Monthly EMI", className: "text-right", render: (r) => formatCurrency(Number(r.emiAmount)) },
    { key: "totalRepayable", title: "Total repayable", className: "text-right", render: (r) => formatCurrency(Number(r.totalRepayable)) },
    { key: "status", title: "Status", render: (r) => statusBadge(String(r.status)) },
    {
      key: "actions",
      title: "",
      className: "text-right",
      render: (r) => (
        <Button variant="outline" size="sm" onClick={() => setViewTarget(r)}>
          <Eye className="mr-1 h-3.5 w-3.5" /> EMI plan
        </Button>
      ),
    },
  ];

  const emiColumns: Column<EmiRow>[] = [
    { key: "month", title: "Period", render: (r) => `${String(r.month).padStart(2, "0")}/${r.year}` },
    { key: "principal", title: "Principal", className: "text-right", render: (r) => formatCurrency(Number(r.principal)) },
    { key: "interest", title: "Interest", className: "text-right", render: (r) => formatCurrency(Number(r.interest)) },
    { key: "total", title: "Total", className: "text-right", render: (r) => formatCurrency(Number(r.total)) },
    { key: "closingBalance", title: "Balance", className: "text-right", render: (r) => formatCurrency(Number(r.closingBalance)) },
    { key: "status", title: "Status", render: (r) => (r.status === "PAID" ? <Badge variant="success">Paid</Badge> : <Badge variant="warning">Pending</Badge>) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">My Loans & Advances</h1>
          <p className="text-sm text-muted-foreground">Your sanctioned loans and salary advances with EMI schedules; EMIs are recovered via payroll.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRefresh((r) => r + 1)}>
          <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Loans</CardTitle>
          <CardDescription>Standard EMI formula: P·r·(1+r)ⁿ / ((1+r)ⁿ − 1).</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} rows={rows} loading={loading} total={rows.length} page={1} pageSize={Math.max(rows.length, 1)} onPageChange={() => undefined} empty={<>No loans for you yet.</>} />
        </CardContent>
      </Card>

      <Dialog
        open={!!viewTarget}
        onOpenChange={(o) => !o && setViewTarget(null)}
        title="EMI plan"
        description={viewTarget ? `${viewTarget.loanType} · ${formatCurrency(Number(viewTarget.totalRepayable))} total` : undefined}
        size="lg"
      >
        {viewTarget ? (
          <DataTable columns={emiColumns} rows={(viewTarget.emis as unknown[] ?? []) as EmiRow[]} loading={false} total={(viewTarget.emis as unknown[])?.length ?? 0} page={1} pageSize={Math.max((viewTarget.emis as unknown[])?.length ?? 0, 1)} onPageChange={() => undefined} empty={<>No EMI schedule.</>} />
        ) : null}
      </Dialog>
    </div>
  );
}