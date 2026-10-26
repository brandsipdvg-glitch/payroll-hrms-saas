"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, FileDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiFetch, ApiClientError, myTaxApi } from "@/lib/client/api";
import { formatCurrency } from "@/lib/utils";

type Row = Record<string, unknown>;

const CURRENT_FY = "2026-27";

export function MyTaxPanel() {
  const [fy, setFy] = useState(CURRENT_FY);
  const [data, setData] = useState<{ computed: Row; declaration: Row | null }>({ computed: {}, declaration: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Row>({ regime: "NEW", section80C: "0", section80D: "0", nps80CCD1B: "0", homeLoanInterest: "0", hraExemption: "0", otherDeductions: "0", previousEmployerIncome: "0", previousEmployerTax: "0" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ computed: Row; declaration: Row | null }>(`${myTaxApi}?financialYear=${fy}`);
      setData(res);
      if (res.declaration) {
        setForm({
          regime: String(res.declaration.regime ?? "NEW"),
          section80C: String(res.declaration.section80C ?? 0),
          section80D: String(res.declaration.section80D ?? 0),
          nps80CCD1B: String(res.declaration.nps80CCD1B ?? 0),
          homeLoanInterest: String(res.declaration.homeLoanInterest ?? 0),
          hraExemption: String(res.declaration.hraExemption ?? 0),
          otherDeductions: String(res.declaration.otherDeductions ?? 0),
          previousEmployerIncome: String(res.declaration.previousEmployerIncome ?? 0),
          previousEmployerTax: String(res.declaration.previousEmployerTax ?? 0),
        });
      }
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load your tax details.");
    } finally {
      setLoading(false);
    }
  }, [fy]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiFetch<{ computed: Row; declaration: Row }>(myTaxApi, { method: "POST", body: JSON.stringify({ ...form, financialYear: fy }) });
      setData(res);
      toast.success("Declaration saved and computation updated.");
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to save declaration.");
    } finally {
      setSaving(false);
    }
  };

  const computed = data.computed;
  const rows: Array<[string, number | string]> = [
    ["Gross salary (annual projection)", Number(computed.grossAnnual ?? 0)],
    ["Standard deduction", Number(computed.standardDeduction ?? 0)],
    ["80C deductions", Number(computed.section80C ?? 0)],
    ["80D deductions", Number(computed.section80D ?? 0)],
    ["NPS 80CCD(1B)", Number(computed.nps80CCD1B ?? 0)],
    ["Home loan interest", Number(computed.homeLoanInterest ?? 0)],
    ["Taxable income", Number(computed.taxableIncome ?? 0)],
    ["Tax before rebate", Number(computed.taxBeforeRebate ?? 0)],
    ["Rebate u/s 87A", Number(computed.rebate87A ?? 0)],
    ["Cess (4%)", Number(computed.educationCess ?? 0)],
    ["Net annual tax", Number(computed.netAnnualTax ?? 0)],
    ["Monthly TDS", Number(computed.monthlyTds ?? 0)],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">My income tax</h1>
          <p className="text-sm text-muted-foreground">View your projected TDS and manage annual declarations.</p>
        </div>
        <Select value={fy} onChange={(e) => setFy(e.target.value)}>
          {[CURRENT_FY, "2025-26", "2027-28"].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">My declaration · {fy}</CardTitle>
          <CardDescription>Toggle old/new regime and enter investment proofs. The computation updates immediately on save.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Regime</Label>
            <Select value={String(form.regime)} onChange={(e) => setForm((f) => ({ ...f, regime: e.target.value }))}>
              <option value="NEW">New regime (default, no deductions)</option>
              <option value="OLD">Old regime (allow deductions)</option>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Section 80C (EPF, LIC, ELSS, max ₹1.5L)" value={form.section80C} onChange={(v) => setForm((f) => ({ ...f, section80C: v }))} />
            <Field label="Section 80D (health insurance, max ₹25k)" value={form.section80D} onChange={(v) => setForm((f) => ({ ...f, section80D: v }))} />
            <Field label="NPS 80CCD(1B) (max ₹50k)" value={form.nps80CCD1B} onChange={(v) => setForm((f) => ({ ...f, nps80CCD1B: v }))} />
            <Field label="Home loan interest 24(b) (max ₹2L)" value={form.homeLoanInterest} onChange={(v) => setForm((f) => ({ ...f, homeLoanInterest: v }))} />
            <Field label="HRA exemption claim" value={form.hraExemption} onChange={(v) => setForm((f) => ({ ...f, hraExemption: v }))} />
            <Field label="Other deductions" value={form.otherDeductions} onChange={(v) => setForm((f) => ({ ...f, otherDeductions: v }))} />
            <Field label="Income from previous employer(s)" value={form.previousEmployerIncome} onChange={(v) => setForm((f) => ({ ...f, previousEmployerIncome: v }))} />
            <Field label="Tax already deducted by previous employer" value={form.previousEmployerTax} onChange={(v) => setForm((f) => ({ ...f, previousEmployerTax: v }))} />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              <FileDown className="mr-1.5 h-4 w-4" /> {saving ? "Saving…" : "Save declaration"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tax computation summary</CardTitle>
          <CardDescription>Based on your declaration and YTD payslips processed so far.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-6 w-40 animate-pulse rounded bg-muted" />
          ) : Object.keys(computed).length === 0 ? (
            <p className="text-sm text-muted-foreground">No computation available yet. Payroll must have been run for at least one month.</p>
          ) : (
            <div className="space-y-1">
              {rows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-semibold tabular-nums">{typeof value === "number" ? formatCurrency(value) : value}</span>
                </div>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">
                Regime: <Badge variant="secondary">{String(computed.regime)}</Badge> · YTD TDS {formatCurrency(Number(computed.ytdTds ?? 0))} · Remaining months {String(computed.monthsRemaining)}
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={`${myTaxApi}/sheet?financialYear=${fy}`} target="_blank" rel="noreferrer">
                    <FileText className="mr-1.5 h-4 w-4" /> Computation sheet
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`${myTaxApi}/form16?financialYear=${fy}`} target="_blank" rel="noreferrer">
                    <FileText className="mr-1.5 h-4 w-4" /> Form 16
                  </a>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: unknown; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}