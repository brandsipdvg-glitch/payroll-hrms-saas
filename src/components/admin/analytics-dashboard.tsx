"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Users, Wallet, ShieldCheck, Landmark, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/client/api";
import { analyticsApi } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";
import { formatCurrency } from "@/lib/utils";

type Row = Record<string, unknown>;

function statIcon(v: string) {
  const key = v.toLowerCase();
  if (key.includes("headcount") || key.includes("employee") || key.includes("attrition")) return Users;
  if (key.includes("salary") || key.includes("payroll") || key.includes("gross") || key.includes("net") || key.includes("pf") || key.includes("esi")) return Wallet;
  if (key.includes("compliance") || key.includes("gratuity") || key.includes("bonus")) return ShieldCheck;
  if (key.includes("loan") || key.includes("reimburse") || key.includes("settlement") || key.includes("repayable")) return Landmark;
  return Clock;
}

function fmtValue(v: unknown) {
  if (typeof v === "number") return v.toLocaleString("en-IN");
  return String(v ?? "—");
}

export function AnalyticsDashboard() {
  const [month, setMonth] = useState("CURRENT");
  const [data, setData] = useState<Row>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ month });
      const d = await apiFetch<Row>(`${analyticsApi}?${qs.toString()}`);
      setData(d ?? {});
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load analytics.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = [
    { title: "Workforce", keys: ["totalHeadcount", "activeEmployees", "newHires", "attrition", "attritionRate", "empChurn"] },
    { title: "Payroll", keys: ["payrollGross", "totalNetPayable", "ctcMonthly", "employerPf", "employeePf", "esi", "payrollRunCount", "payrollTotalPaid", "payrollPending"] },
    { title: "Compliance", keys: ["pfCompliance", "gratuityProvision", "bonusProvision"] },
    { title: "Finance", keys: ["loanRepayable", "totalLoanOutstanding", "outstandingLoans", "reimbursementPending", "pendingSettlements", "settlementProvision"] },
    { title: "Attendance", keys: ["attendanceCoverage", "avgCheckins", "lateCheckins", "leavesPending", "leavesApproved"] },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Analytics Dashboard</h1>
          <p className="text-sm text-muted-foreground">Enterprise KPIs across workforce, payroll, compliance, finance and attendance.</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="h-9 rounded-md border bg-background px-3 text-sm" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="CURRENT">Current month</option>
            <option value="LAST">Last month</option>
            <option value="YTD">Year to date</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(data)
          .filter(([, v]) => typeof v === "number" && v > 0)
          .slice(0, 8)
          .map(([k, v]) => {
            const Icon = statIcon(k);
            const isCurrency = /salary|gross|net|ctc|pf|esi|loan|reimburse|settlement|bonus|gratuity|provision/i.test(k);
            return (
              <Card key={k}>
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-center">{isCurrency ? formatCurrency(Number(v)) : fmtValue(v)}</p>
                    <p className="text-xs text-muted-foreground">{k.replace(/([A-Z])/g, " $1").replace(/^\w/, (c) => c.toUpperCase())}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => {
          const entries = g.keys.filter((k) => data[k] !== undefined).map((k) => [k, data[k]] as const);
          if (!entries.length) return null;
          return (
            <Card key={g.title}>
              <CardHeader>
                <CardTitle className="text-sm">{g.title}</CardTitle>
                <CardDescription></CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                {entries.map(([k, v]) => (
                  <div key={k} className="rounded-lg border p-3">
                    <p className="text-base font-bold">{typeof v === "number" && /salary|gross|net|ctc|pf|esi|loan|reimburse|settlement|bonus|gratuity|provision/.test(k) ? formatCurrency(Number(v)) : fmtValue(v)}</p>
                    <p className="text-xs text-muted-foreground">{k.replace(/([A-Z])/g, " $1").replace(/^\w/, (c) => c.toUpperCase())}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}