"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, FileDown, Calculator, Zap } from "lucide-react";
import { DataTable, Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch, ApiClientError, itConfigApi, itDeclarationsApi, itComputeApi, itSheetApi, itForm16Api, itForm24qApi, tdsRegisterApi, tdsRegisterCsvApi, payrollRunsApi, downloadResource, complianceApplyTdsApi } from "@/lib/client/api";
import { formatCurrency } from "@/lib/utils";
import { PeriodPicker, Period } from "@/components/compliance/period-picker";
import { RegisterTable } from "@/components/compliance/register-table";

type Row = Record<string, unknown>;

const CURRENT_FY = "2026-27";

export function ItPanel() {
  const now = new Date();
  const [period, setPeriod] = useState<Period>({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [fy, setFy] = useState(CURRENT_FY);
  const quarterOf = (p: Period) => (p.month >= 4 ? Math.ceil((p.month - 3) / 3) : 4);
  const [tab, setTab] = useState("config");
  const [configs, setConfigs] = useState<Row[]>([]);
  const [config, setConfig] = useState<Row>({});
  const [declarations, setDeclarations] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [runs, setRuns] = useState<Row[]>([]);
  const [applying, setApplying] = useState(false);
  const [computed, setComputed] = useState<Row | null>(null);
  const [calcEmp, setCalcEmp] = useState("");
  const [declOpen, setDeclOpen] = useState(false);
  const [declForm, setDeclForm] = useState<Row>({ regime: "NEW", section80C: "0", section80D: "0", nps80CCD1B: "0", homeLoanInterest: "0", hraExemption: "0", otherDeductions: "0", previousEmployerIncome: "0", previousEmployerTax: "0" });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgs, decs, rs] = await Promise.all([
        apiFetch<Row[]>(itConfigApi),
        apiFetch<Row[]>(`${itDeclarationsApi}?financialYear=${fy}`),
        apiFetch<Row[]>(payrollRunsApi),
      ]);
      setConfigs(cfgs);
      const activeCfg = cfgs.find((c) => String(c.financialYear) === fy) ?? cfgs.find((c) => c.isCurrent);
      setConfig(activeCfg ?? {});
      setDeclarations(decs);
      setRuns(rs);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load income-tax data.");
    } finally {
      setLoading(false);
    }
  }, [fy]);

  useEffect(() => {
    void loadAll();
  }, [loadAll, refresh]);

  const compute = async (employeeId?: string) => {
    const empId = employeeId ?? calcEmp;
    if (!empId) {
      toast.error("Select an employee to compute.");
      return;
    }
    setComputed(null);
    try {
      const res = await apiFetch<{ computed: Row; declaration: Row | null }>(
        `${itComputeApi}?employeeId=${empId}&financialYear=${fy}&month=${period.month}`
      );
      setComputed(res.computed);
      if (res.declaration) setDeclForm(res.declaration);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Computation failed.");
    }
  };

  const saveDecl = async (employeeId: string) => {
    try {
      await apiFetch(itDeclarationsApi, { method: "POST", body: JSON.stringify({ ...declForm, employeeId, financialYear: fy }) });
      toast.success("Declaration saved.");
      setDeclOpen(false);
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Could not save declaration.");
    }
  };

  const applyTds = async () => {
    const target = runs.find((r) => r.status === "DRAFT");
    if (!target) {
      toast.error("Create a DRAFT payroll run first.");
      return;
    }
    setApplying(true);
    try {
      await apiFetch(complianceApplyTdsApi(String(target.id)), { method: "POST", body: "{}" });
      toast.success("Monthly TDS applied to the draft run.");
      setRefresh((r) => r + 1);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "TDS application failed.");
    } finally {
      setApplying(false);
    }
  };

  const slabs = (config.slabs as Row[] | undefined) ?? [];
  const newSlabs = slabs.filter((s) => s.regime === "NEW");
  const oldSlabs = slabs.filter((s) => s.regime === "OLD");

  const slabColumns: Column<Row>[] = [
    { key: "sortOrder", title: "#", render: (r) => String(r.sortOrder) },
    { key: "fromAmount", title: "From", render: (r) => formatCurrency(Number(r.fromAmount ?? 0)) },
    { key: "toAmount", title: "To", render: (r) => (r.toAmount === null ? "Above" : formatCurrency(Number(r.toAmount))) },
    { key: "rate", title: "Rate", render: (r) => `${Number(r.rate)}%` },
  ];

  const declRows: Row[] = declarations.map((d) => {
    const emp = (d.employee as Row) ?? {};
    return {
      id: String(d.id),
      employeeId: String(d.employeeId ?? emp.id ?? ""),
      employeeCode: String(emp.employeeCode ?? d.employeeCode ?? "—"),
      employeeName: `${String(emp.firstName ?? "")} ${String(emp.lastName ?? "")}`.trim() || "—",
      regime: String(d.regime ?? ""),
      section80C: d.section80C,
      section80D: d.section80D,
      nps80CCD1B: d.nps80CCD1B,
      homeLoanInterest: d.homeLoanInterest,
    };
  });

  const declColumns: Column<Row>[] = [
    { key: "employeeCode", title: "Code" },
    { key: "employeeName", title: "Employee" },
    { key: "regime", title: "Regime", render: (r) => <Badge variant={String(r.regime) === "NEW" ? "success" : "secondary"}>{String(r.regime)}</Badge> },
    { key: "section80C", title: "80C", render: (r) => formatCurrency(Number(r.section80C ?? 0)) },
    { key: "section80D", title: "80D", render: (r) => formatCurrency(Number(r.section80D ?? 0)) },
    { key: "nps80CCD1B", title: "NPS", render: (r) => formatCurrency(Number(r.nps80CCD1B ?? 0)) },
    { key: "homeLoanInterest", title: "Home loan", render: (r) => formatCurrency(Number(r.homeLoanInterest ?? 0)) },
    {
      key: "id",
      title: "",
      className: "text-right",
      render: (r) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDeclForm({
              employeeId: String(r.employeeId ?? ""),
              regime: String(r.regime ?? "NEW"),
              section80C: String(r.section80C ?? 0),
              section80D: String(r.section80D ?? 0),
              nps80CCD1B: String(r.nps80CCD1B ?? 0),
              homeLoanInterest: String(r.homeLoanInterest ?? 0),
              hraExemption: String(r.hraExemption ?? 0),
              otherDeductions: String(r.otherDeductions ?? 0),
              previousEmployerIncome: String(r.previousEmployerIncome ?? 0),
              previousEmployerTax: String(r.previousEmployerTax ?? 0),
            });
            setDeclOpen(true);
          }}
        >
          Edit
        </Button>
      ),
    },
  ];

  const numField = (key: string, label: string) => (
    <div key={key} className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={String(declForm[key] ?? "")} onChange={(e) => setDeclForm((f) => ({ ...f, [key]: e.target.value }))} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Income tax / TDS</h1>
          <p className="text-sm text-muted-foreground">Old vs new regime, declarations, monthly TDS, Form 16 / 24Q.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={fy} onChange={(e) => setFy(e.target.value)}>
            {[CURRENT_FY, "2025-26", "2027-28"].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void applyTds()} disabled={applying}>
          <Zap className="mr-1.5 h-4 w-4" /> {applying ? "Applying…" : "Apply monthly TDS to draft run"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void downloadResource(`${itForm24qApi}?financialYear=${fy}&quarter=${quarterOf(period)}`).then(() => toast.success(`Form 24Q Q${quarterOf(period)} downloaded.`)).catch(() => toast.error("Download failed."))}>
          <FileDown className="mr-1.5 h-4 w-4" /> Form 24Q (CSV) · Q{quarterOf(period)}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} tabs={[
        { value: "config", label: "Fiscal settings" },
        { value: "declarations", label: "Declarations" },
        { value: "computation", label: "Computation" },
        { value: "register", label: "TDS register" },
      ]} />

      {tab === "config" ? (
        <div className="space-y-4">
          {loading ? (
            <Card><CardContent className="p-5"><div className="h-4 w-40 animate-pulse rounded bg-muted" /></CardContent></Card>
          ) : Object.keys(config).length === 0 ? (
            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground">
                No income-tax configuration for {fy}. Create the FY slabs in the admin seed or API, or select another financial year.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Slab rates — new regime</CardTitle>
                  <CardDescription>FY {fy}, default for employees without a declaration.</CardDescription>
                </CardHeader>
                <CardContent>
                  <DataTable columns={slabColumns} rows={newSlabs} loading={false} total={newSlabs.length} page={1} pageSize={Math.max(newSlabs.length, 1)} onPageChange={() => undefined} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Slab rates — old regime</CardTitle>
                  <CardDescription>Allowable when 80C / 80D / NPS / home-loan deductions are declared.</CardDescription>
                </CardHeader>
                <CardContent>
                  <DataTable columns={slabColumns} rows={oldSlabs} loading={false} total={oldSlabs.length} page={1} pageSize={Math.max(oldSlabs.length, 1)} onPageChange={() => undefined} />
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      ) : null}

      {tab === "declarations" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Employee declarations · {fy}</CardTitle>
              <CardDescription>Section 80C/80D, NPS 80CCD(1B), home-loan interest and previous-employer details.</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable columns={declColumns} rows={declRows} loading={loading} total={declRows.length} page={1} pageSize={Math.max(declRows.length, 1)} onPageChange={() => undefined} empty={<>No declarations filed for {fy}. File one per employee from the list above.</>} />
            </CardContent>
          </Card>
          <Dialog
            open={declOpen}
            onOpenChange={setDeclOpen}
            title="Declaration"
            size="lg"
            footer={
              <Button size="sm" onClick={() => void saveDecl(declForm.employeeId ? String(declForm.employeeId) : "")}>
                <Calculator className="mr-1.5 h-4 w-4" /> Save declaration
              </Button>
            }
          >
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Regime</Label>
                <Select value={String(declForm.regime)} onChange={(e) => setDeclForm((f) => ({ ...f, regime: e.target.value }))}>
                  <option value="NEW">New regime (default)</option>
                  <option value="OLD">Old regime</option>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {numField("section80C", "80C investments (max 1.5L)")}
                {numField("section80D", "80D health insurance")}
                {numField("nps80CCD1B", "NPS 80CCD(1B) (max 50k)")}
                {numField("homeLoanInterest", "Home loan interest 24(b)")}
                {numField("hraExemption", "HRA exemption claim")}
                {numField("otherDeductions", "Other deductions")}
                {numField("previousEmployerIncome", "Prev employer income")}
                {numField("previousEmployerTax", "Prev employer TDS")}
              </div>
            </div>
          </Dialog>
        </div>
      ) : null}

      {tab === "computation" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Per-employee tax computation</CardTitle>
            <CardDescription>Compute annual liability and monthly TDS for any employee under the selected FY and pay month.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">Employee</span>
              <Select value={calcEmp} onChange={(e) => setCalcEmp(e.target.value)}>
                <option value="">Pick an employee…</option>
                {declRows.map((d) => (
                  <option key={String(d.id)} value={String(d.employeeId)}>{String(d.employeeCode)} · {String(d.employeeName)}</option>
                ))}
              </Select>
              <Button size="sm" onClick={() => void compute()}>
                <Calculator className="mr-1.5 h-4 w-4" /> Compute
              </Button>
            </div>
            {computed ? (
              <div className="space-y-3">
                <ComputeSummary computed={computed} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={`${itSheetApi}/${calcEmp}?financialYear=${fy}&month=${period.month}`} target="_blank" rel="noreferrer">
                      <FileText className="mr-1.5 h-4 w-4" /> Computation sheet
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`${itForm16Api}/${calcEmp}?financialYear=${fy}`} target="_blank" rel="noreferrer">
                      <FileText className="mr-1.5 h-4 w-4" /> Form 16
                    </a>
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No computation yet. Pick an employee and press Compute.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "register" ? (
        <RegisterTable url={tdsRegisterApi} csvBaseUrl={tdsRegisterCsvApi} title={`TDS register · ${periodLabel(period)}`} description="Monthly TDS per employee for the selected pay period" period={period} moneyKeys={["grossSalary", "monthlyTds", "ytdTds", "diff"]} refreshKey={period.month * 100 + period.year} />
      ) : null}
    </div>
  );
}

function ComputeSummary({ computed }: { computed: Row }) {
  const rows: Array<[string, number]> = [
    ["Gross salary (annual projection)", Number(computed.grossAnnual ?? 0)],
    ["Standard deduction", Number(computed.standardDeduction ?? 0)],
    ["Taxable income", Number(computed.taxableIncome ?? 0)],
    ["Tax before rebate", Number(computed.taxBeforeRebate ?? 0)],
    ["Rebate u/s 87A", Number(computed.rebate87A ?? 0)],
    ["Cess (4%)", Number(computed.educationCess ?? 0)],
    ["Net annual tax", Number(computed.netAnnualTax ?? 0)],
    ["Monthly TDS", Number(computed.monthlyTds ?? 0)],
  ];
  return (
    <div className="space-y-1 rounded-md border p-4">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-semibold tabular-nums">{formatCurrency(value)}</span>
        </div>
      ))}
      <p className="pt-1 text-xs text-muted-foreground">
        Regime: <Badge variant="secondary">{String(computed.regime)}</Badge> · YTD TDS {formatCurrency(Number(computed.ytdTds ?? 0))}
      </p>
    </div>
  );
}

function periodLabel(period: Period): string {
  return new Date(`${period.year}-${period.month}-01`).toLocaleString("en-US", { month: "short", year: "numeric" });
}