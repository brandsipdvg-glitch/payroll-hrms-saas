"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Wallet, PiggyBank, Users, Timer, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, payrollRunsApi, payrollSummaryApi } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";
import { formatCurrency, formatDate } from "@/lib/utils";

type Row = Record<string, unknown>;

export function PayrollDashboard() {
  const [summary, setSummary] = useState<Row>({});
  const [runs, setRuns] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, runsData] = await Promise.all([
        apiFetch<Row>(`${payrollSummaryApi}?month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`),
        apiFetch<Row[]>(`${payrollRunsApi}`),
      ]);
      setSummary(s);
      setRuns(runsData);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load payroll summary.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthName = new Date(`${Number(summary.year ?? new Date().getFullYear())}-${Number(summary.month ?? new Date().getMonth() + 1)}-01`).toLocaleString(
    "en-US",
    { month: "long", year: "numeric" }
  );

  const cards: Array<{ label: string; value: string; note: string }> = [
    { label: "Net pay", value: formatCurrency(Number(summary.totalNet ?? 0)), note: `for ${monthName}` },
    { label: "Gross pay", value: formatCurrency(Number(summary.totalGross ?? 0)), note: "across all earnings" },
    { label: "Deductions", value: formatCurrency(Number(summary.totalDeductions ?? 0)), note: "statutory + recoveries" },
    { label: "Payslips", value: String(Number(summary.payslips ?? 0)), note: `${Number(summary.employeesWithStructures ?? 0)} employees on structures` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Payroll dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Current month ({monthName}) run status: <Badge variant={statusVariant(String(summary.status ?? "NOT_RUN"))}>{String(summary.status ?? "NOT_RUN")}</Badge>
          </p>
        </div>
        <Link href="/payroll/runs">
          <Button size="sm">
            <PiggyBank className="mr-1.5 h-4 w-4" /> New / manage pay runs
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="h-6 w-20 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-3 w-32 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((c) => (
            <Card key={c.label}>
              <CardContent className="p-5">
                <p className="text-2xl font-bold leading-none">{c.value}</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">{c.label}</p>
                <p className="text-xs text-muted-foreground/80">{c.note}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Wallet className="h-4 w-4" /> Payroll runs
            </CardTitle>
            <CardDescription>Recent processing cycles</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {runs.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No payroll has been run yet. Start with <Link href="/payroll/runs" className="underline">Payroll Runs</Link>.
              </p>
            ) : (
              runs.slice(0, 6).map((r) => (
                <Link key={String(r.id)} href={`/payroll/runs/${String(r.id)}`} className="flex items-center justify-between py-2.5 hover:bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">
                      {runLabel(r)} · {Number(r.payrollDays)} days
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Number((r._count as Row | undefined)?.payslips ?? 0)} payslips · created {formatDate(r.createdAt as string)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{formatCurrency(Number(r.totalNet ?? 0))}</span>
                    <Badge variant={statusVariant(String(r.status))}>{String(r.status)}</Badge>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="h-4 w-4" /> Payroll readiness
            </CardTitle>
            <CardDescription>Inputs that feed the payroll engine</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            <ReadinessRow icon={<Users className="h-4 w-4" />} label="Employees on active salary structures" value={`${Number(summary.employeesWithStructures ?? 0)}`} href="/payroll/structures" />
            <ReadinessRow icon={<Timer className="h-4 w-4" />} label="Attendance days recorded this month" value={`${Number(summary.attendanceDays ?? 0)}`} href="/attendance" />
            <ReadinessRow icon={<Timer className="h-4 w-4" />} label="Overtime hours logged in month" value={`${Number(summary.overtimeHours ?? 0)}h`} href="/reports/attendance" />
            <ReadinessRow icon={<Wallet className="h-4 w-4" />} label="Bonus / incentive / arrears processing" value="Payroll Runs" href="/payroll/runs" />
            {Number(summary.runExists ?? 0) === 0 ? (
              <p className="pt-2 text-xs text-muted-foreground">
                No run created for {monthName}. Create one from the Runs page to generate payslips.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function runLabel(r: Row): string {
  const y = Number(r.year ?? new Date().getFullYear());
  const m = Number(r.month ?? 1);
  return new Date(`${y}-${m}-01`).toLocaleString("en-US", { month: "short", year: "numeric" });
}

function statusVariant(status: string): "default" | "secondary" | "success" | "warning" | "destructive" {
  if (status === "PAID") return "success";
  if (status === "FINALIZED") return "default";
  if (status === "DRAFT") return "warning";
  if (status === "CANCELLED") return "secondary";
  return "secondary";
}

function ReadinessRow({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-muted/50">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon} {label}
      </span>
      <span className="flex items-center gap-1 font-semibold">
        {value} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
    </Link>
  );
}