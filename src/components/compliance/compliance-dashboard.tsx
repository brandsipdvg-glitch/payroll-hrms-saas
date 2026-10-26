"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PiggyBank, FileSpreadsheet, Stamp, Landmark, FileText, ArrowRight, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiClientError, complianceDashboardApi } from "@/lib/client/api";
import { formatCurrency } from "@/lib/utils";
import { PeriodPicker, Period } from "@/components/compliance/period-picker";

type Row = Record<string, unknown>;

export function ComplianceDashboard() {
  const now = new Date();
  const [period, setPeriod] = useState<Period>({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [data, setData] = useState<Row>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch<Row>(`${complianceDashboardApi}?month=${period.month}&year=${period.year}`);
      setData(d);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load compliance dashboard.");
    } finally {
      setLoading(false);
    }
  }, [period.month, period.year]);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = (data.cards as Row) ?? {};
  const run = (data.run as Row) ?? null;
  const readiness = (data.readiness as Row) ?? {};
  const periodLabel = new Date(`${period.year}-${period.month}-01`).toLocaleString("en-US", { month: "long", year: "numeric" });

  const groups: Array<{
    key: string;
    href: string;
    icon: React.ReactNode;
    title: string;
    color: string;
    stats: Array<[string, number]>;
  }> = [
    {
      key: "pf",
      href: "/compliance/pf",
      icon: <PiggyBank className="h-4 w-4" />,
      title: "PF / EPS",
      color: "bg-amber-100 text-amber-700",
      stats: [
        ["Employee", Number((cards.pf as Row | undefined)?.employeeShare ?? 0)],
        ["Employer", Number((cards.pf as Row | undefined)?.employerShare ?? 0)],
        ["Total contribution", Number((cards.pf as Row | undefined)?.total ?? 0)],
      ],
    },
    {
      key: "esi",
      href: "/compliance/esi",
      icon: <FileSpreadsheet className="h-4 w-4" />,
      title: "ESI",
      color: "bg-green-100 text-green-700",
      stats: [
        ["Employee", Number((cards.esi as Row | undefined)?.employeeShare ?? 0)],
        ["Employer", Number((cards.esi as Row | undefined)?.employerShare ?? 0)],
        ["Total contribution", Number((cards.esi as Row | undefined)?.total ?? 0)],
      ],
    },
    {
      key: "pt",
      href: "/compliance/pt",
      icon: <Stamp className="h-4 w-4" />,
      title: "Professional tax",
      color: "bg-sky-100 text-sky-700",
      stats: [
        ["Employees covered", Number((cards.pt as Row | undefined)?.employees ?? 0)],
        ["Tax recoverable", Number((cards.pt as Row | undefined)?.total ?? 0)],
      ],
    },
    {
      key: "lwf",
      href: "/compliance/lwf",
      icon: <Landmark className="h-4 w-4" />,
      title: "LWF",
      color: "bg-violet-100 text-violet-700",
      stats: [
        ["Employee", Number((cards.lwf as Row | undefined)?.employeeShare ?? 0)],
        ["Employer", Number((cards.lwf as Row | undefined)?.employerShare ?? 0)],
        ["Total", Number((cards.lwf as Row | undefined)?.total ?? 0)],
      ],
    },
    {
      key: "tds",
      href: "/compliance/tax",
      icon: <FileText className="h-4 w-4" />,
      title: "TDS (income tax)",
      color: "bg-rose-100 text-rose-700",
      stats: [
        ["Deducted this month", Number((cards.tds as Row | undefined)?.total ?? 0)],
        ["Computed due", Number((cards.tds as Row | undefined)?.computed ?? 0)],
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Compliance dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Statutory liabilities for{" "}
            <span className="font-medium text-foreground">{periodLabel}</span>
            {run ? (
              <>
                {" "}
                · run <Badge variant={String(run.status) === "PAID" ? "success" : "secondary"}>{String(run.status)}</Badge>
              </>
            ) : (
              <Badge variant="secondary" className="ml-1">
                no run
              </Badge>
            )}
          </p>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="h-6 w-24 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-3 w-32 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {groups.map((g) => (
            <Link key={g.key} href={g.href}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader className="pb-2">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${g.color}`}>{g.icon}</span>
                  <CardTitle className="mt-2 flex items-center justify-between text-sm">
                    {g.title} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {g.stats.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-semibold tabular-nums">{formatCurrency(value)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4" /> Setup readiness
          </CardTitle>
          <CardDescription>Items that must be configured before statutory reports are meaningful.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries({
            "Company statutory identifiers (PF/ESI no., TAN)": readiness.settings,
            "Active PF configuration": readiness.pfConfig,
            "Active ESI configuration": readiness.esiConfig,
            "Active LWF configuration": readiness.lwfConfig,
            "Income-tax config (FY slabs)": readiness.itConfig,
          }).map(([label, ok]) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <Badge variant={ok ? "success" : "warning"}>{ok ? "Configured" : "Missing"}</Badge>
            </div>
          ))}
          <div className="pt-2">
            <Button variant="link" size="sm" asChild>
              <Link href="/compliance/settings">Edit statutory identifiers →</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}