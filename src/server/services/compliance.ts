// ---------------------------------------------------------------------------
// Statutory compliance engine: PF / ESI / Professional Tax / LWF / Income Tax.
// Every rate, ceiling and slab is read from tenant-owned configuration.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/errors";
import { round2 } from "@/server/services/formula";
import { resolveStructure, type ComponentInput } from "@/server/services/payroll";
import { Prisma } from "@prisma/client";

export interface MonthArg {
  month: number;
  year: number;
}

// ---------------------------------------------------------------------------
// Financial year helpers (Indian FY runs April -> March)
// ---------------------------------------------------------------------------

export function fiscalYearOf(month: number, year: number): string {
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function fyMonthWindow(financialYear: string, throughMonth: number): { start: Date; end: Date; months: Array<{ month: number; year: number }> } {
  const startYear = Number(financialYear.split("-")[0]);
  if (!startYear) throw badRequest("Invalid financial year.");
  const months: Array<{ month: number; year: number }> = [];
  for (let m = 4; m <= 12; m++) months.push({ month: m, year: startYear });
  for (let m = 1; m <= 3; m++) months.push({ month: m, year: startYear + 1 });
  const window = months.slice(0, Math.min(Math.max(throughMonth, 1), 12));
  const first = window[0];
  const last = window[window.length - 1];
  return {
    start: new Date(first.year, first.month - 1, 1, 0, 0, 0, 0),
    end: new Date(last.year, last.month, 0, 23, 59, 59, 999),
    months: window,
  };
}

// ---------------------------------------------------------------------------
// Configuration accessors (current / active)
// ---------------------------------------------------------------------------

export async function getCompanyStatutorySettings(companyId: string) {
  const row = await prisma.companyStatutorySetting.findUnique({ where: { companyId } });
  if (!row) throw notFound("Create the company statutory settings first.");
  return row;
}

export async function getOrCreateStatutorySettings(companyId: string) {
  const existing = await prisma.companyStatutorySetting.findUnique({ where: { companyId } });
  if (existing) return existing;
  return prisma.companyStatutorySetting.create({ data: { companyId } });
}

export async function getPfConfig(companyId: string, fallback = true) {
  const row = await prisma.pfConfig.findFirst({ where: { companyId, isCurrent: true } });
  if (row) return row;
  if (!fallback) return null;
  return prisma.pfConfig.findFirst({ where: { companyId }, orderBy: { effectiveFrom: "desc" } });
}

export async function getEsiConfig(companyId: string, fallback = true) {
  const row = await prisma.esiConfig.findFirst({ where: { companyId, isCurrent: true } });
  if (row) return row;
  if (!fallback) return null;
  return prisma.esiConfig.findFirst({ where: { companyId }, orderBy: { effectiveFrom: "desc" } });
}

export async function getPtRegion(companyId: string, state?: string | null) {
  const where: Prisma.ProfessionalTaxRegionWhereInput = { companyId, isActive: true };
  if (state) where.state = state;
  const row = await prisma.professionalTaxRegion.findFirst({ where, include: { slabs: { orderBy: { sortOrder: "asc" } } } });
  if (row) return row;
  // fall back to any active region when state is unknown
  return prisma.professionalTaxRegion.findFirst({ where: { companyId, isActive: true }, include: { slabs: { orderBy: { sortOrder: "asc" } } } });
}

export function ptAmountForGross(region: { slabs: Array<{ fromAmount: Prisma.Decimal; toAmount: Prisma.Decimal | null; monthlyAmount: Prisma.Decimal }> } | null, gross: number): number {
  if (!region) return 0;
  const slab = region.slabs.find((s) => gross >= Number(s.fromAmount) && (s.toAmount === null || gross <= Number(s.toAmount)));
  return slab ? Number(slab.monthlyAmount) : 0;
}

export async function getLwfConfig(companyId: string, state?: string | null) {
  const row = await prisma.lwfConfig.findFirst({ where: { companyId, isActive: true, ...(state ? { state } : {}) } });
  if (row) return row;
  return prisma.lwfConfig.findFirst({ where: { companyId, isActive: true } });
}

export async function getItConfig(companyId: string, financialYear?: string | null) {
  const where: Prisma.ItConfigWhereInput = { companyId };
  if (financialYear) {
    const exact = await prisma.itConfig.findFirst({ where: { ...where, financialYear }, include: { slabs: { orderBy: [{ regime: "asc" }, { sortOrder: "asc" }] } } });
    if (exact) return exact;
  }
  return prisma.itConfig.findFirst({ where: { ...where, isCurrent: true }, include: { slabs: { orderBy: [{ regime: "asc" }, { sortOrder: "asc" }] } } });
}

export async function getDeclaration(companyId: string, employeeId: string, financialYear: string) {
  return prisma.itDeclaration.findUnique({
    where: { companyId_employeeId_financialYear: { companyId, employeeId, financialYear } },
  });
}

// ---------------------------------------------------------------------------
// PF / ESI / PT / LWF computation from a pay run
// ---------------------------------------------------------------------------

type PayslipLike = {
  id: string;
  employeeId: string;
  grossSalary: Prisma.Decimal;
  netSalary: Prisma.Decimal;
  totalEarnings: Prisma.Decimal;
  totalDeductions: Prisma.Decimal;
  lopAmount: Prisma.Decimal;
  employee: {
    employeeCode: string;
    firstName: string;
    lastName: string;
    uan: string | null;
    esiNumber: string | null;
    pan: string | null;
    designation?: { title: string } | null;
    branch?: { state: string | null } | null;
  };
  components: Array<{ name: string; amount: Prisma.Decimal; componentType: string; payComponent: { code: string; componentType: string } | null }>;
};

function sumComponents(ps: PayslipLike, codes: string[], types: Array<"EARNING" | "DEDUCTION">): number {
  const set = new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean));
  return round2(
    ps.components.reduce((sum, c) => {
      const type = c.componentType === "DEDUCTION" ? "DEDUCTION" : "EARNING";
      const code = c.payComponent?.code;
      if (types.includes(type) && code && set.has(code)) return sum + Number(c.amount);
      return sum;
    }, 0)
  );
}

function wagesByCodes(ps: PayslipLike, csv: string | null): number {
  const codes = csv?.split(",") ?? [];
  return sumComponents(ps, codes, ["EARNING"]);
}

export function computePf(ps: PayslipLike, cfg: { wageCeiling: Prisma.Decimal; pensionWageCeiling: Prisma.Decimal; wageComponents: string; employeeRate: Prisma.Decimal; employerRate: Prisma.Decimal; epsRate: Prisma.Decimal }) {
  const wages = wagesByCodes(ps, cfg.wageComponents);
  const effective = Math.min(wages, Number(cfg.wageCeiling));
  const employeeShare = round2((effective * Number(cfg.employeeRate)) / 100);
  const employerShare = round2((effective * Number(cfg.employerRate)) / 100);
  const pensionBase = Math.min(wages, Number(cfg.pensionWageCeiling));
  const eps = round2((pensionBase * Number(cfg.epsRate)) / 100);
  const epf = Math.max(0, round2(employerShare - eps));
  return {
    wages,
    effectiveWages: effective,
    employeeShare,
    employerShare,
    eps,
    epf,
    total: round2(employeeShare + employerShare),
  };
}

export function computeEsi(ps: PayslipLike, cfg: { wageCeiling: Prisma.Decimal; wageComponents: string; employeeRate: Prisma.Decimal; employerRate: Prisma.Decimal }) {
  const wages = wagesByCodes(ps, cfg.wageComponents);
  const applied = wages <= Number(cfg.wageCeiling) && wages >= 0;
  const employeeShare = applied ? round2((wages * Number(cfg.employeeRate)) / 100) : 0;
  const employerShare = applied ? round2((wages * Number(cfg.employerRate)) / 100) : 0;
  return { wages, applied, employeeShare, employerShare, total: round2(employeeShare + employerShare) };
}

export function computeLwf(ps: PayslipLike, cfg: { employeeShare: Prisma.Decimal; employerShare: Prisma.Decimal }) {
  return { employeeShare: Number(cfg.employeeShare), employerShare: Number(cfg.employerShare), total: Number(cfg.employeeShare) + Number(cfg.employerShare) };
}

// ---------------------------------------------------------------------------
// Pay run loader + registers
// ---------------------------------------------------------------------------

async function loadRunPayslips(companyId: string, month: number, year: number) {
  if (!month || !year) throw badRequest("month and year are required.");
  const run = await prisma.payrollRun.findFirst({
    where: { companyId, month, year, status: { not: "CANCELLED" } },
    include: {
      payslips: {
        include: {
          employee: {
            include: { designation: { select: { title: true } }, branch: { select: { state: true } } },
          },
          components: { include: { payComponent: { select: { code: true, componentType: true } } } },
        },
      },
    },
  });
  if (!run) throw notFound(`No payroll run exists for ${month}/${year}.`);
  return { run, payslips: run.payslips as unknown as PayslipLike[], month, year };
}

export async function buildPfRegister(companyId: string, month: number, year: number) {
  const { run, payslips } = await loadRunPayslips(companyId, month, year);
  const cfg = (await getPfConfig(companyId)) as NonNullable<Awaited<ReturnType<typeof getPfConfig>>>;
  const settings = await getCompanyStatutorySettings(companyId).catch(() => null);
  const rows = payslips.map((ps) => {
    const pf = computePf(ps, cfg);
    return {
      employeeCode: ps.employee.employeeCode,
      employeeName: `${ps.employee.firstName} ${ps.employee.lastName}`.trim(),
      uan: ps.employee.uan ?? "",
      designnation: ps.employee.designation?.title ?? "",
      pfNumber: settings?.pfNumber ?? "",
      pfWages: pf.wages,
      effectiveWages: pf.effectiveWages,
      memberContribution: pf.employeeShare,
      epsContribution: pf.eps,
      epfContribution: pf.epf,
      employerContribution: pf.employerShare,
      totalContribution: pf.total,
    };
  });
  const totals = {
    pfWages: round2(rows.reduce((s, r) => s + r.pfWages, 0)),
    effectiveWages: round2(rows.reduce((s, r) => s + r.effectiveWages, 0)),
    memberContribution: round2(rows.reduce((s, r) => s + r.memberContribution, 0)),
    epsContribution: round2(rows.reduce((s, r) => s + r.epsContribution, 0)),
    epfContribution: round2(rows.reduce((s, r) => s + r.epfContribution, 0)),
    employerContribution: round2(rows.reduce((s, r) => s + r.employerContribution, 0)),
    totalContribution: round2(rows.reduce((s, r) => s + r.totalContribution, 0)),
  };
  return { run, month, year, config: cfg, rows, totals };
}

export async function buildEsiRegister(companyId: string, month: number, year: number) {
  const { run, payslips } = await loadRunPayslips(companyId, month, year);
  const cfg = (await getEsiConfig(companyId)) as NonNullable<Awaited<ReturnType<typeof getEsiConfig>>>;
  const settings = await getCompanyStatutorySettings(companyId).catch(() => null);
  const rows = payslips.map((ps) => {
    const esi = computeEsi(ps, cfg);
    return {
      employeeCode: ps.employee.employeeCode,
      employeeName: `${ps.employee.firstName} ${ps.employee.lastName}`.trim(),
      ipNumber: ps.employee.esiNumber ?? "",
      esiNumber: settings?.esiNumber ?? "",
      esiWages: esi.wages,
      applied: esi.applied,
      employeeContribution: esi.employeeShare,
      employerContribution: esi.employerShare,
      totalContribution: esi.total,
    };
  });
  const totals = {
    esiWages: round2(rows.reduce((s, r) => s + r.esiWages, 0)),
    employeeContribution: round2(rows.reduce((s, r) => s + r.employeeContribution, 0)),
    employerContribution: round2(rows.reduce((s, r) => s + r.employerContribution, 0)),
    totalContribution: round2(rows.reduce((s, r) => s + r.totalContribution, 0)),
  };
  return { run, month, year, config: cfg, rows, totals };
}

export async function buildPtRegister(companyId: string, month: number, year: number) {
  const { run, payslips } = await loadRunPayslips(companyId, month, year);
  const region = await getPtRegion(companyId, payslips[0]?.employee.branch?.state ?? null);
  const rows = payslips.map((ps) => {
    const gross = Number(ps.grossSalary);
    const amount = ptAmountForGross(region, gross);
    const label = slabLabel(region, gross);
    return {
      employeeCode: ps.employee.employeeCode,
      employeeName: `${ps.employee.firstName} ${ps.employee.lastName}`.trim(),
      state: region?.state ?? "",
      grossSalary: gross,
      slabFrom: label.from,
      slabTo: label.to,
      ptAmount: amount,
    };
  });
  const totals = { ptAmount: round2(rows.reduce((s, r) => s + Number(r.ptAmount), 0)), employees: rows.length };
  return { run, month, year, region, rows, totals };
}

function slabLabel(region: { slabs: Array<{ fromAmount: Prisma.Decimal; toAmount: Prisma.Decimal | null }> } | null, gross: number): { from: number | string; to: number | string } {
  const slab = region?.slabs.find((s) => gross >= Number(s.fromAmount) && (s.toAmount === null || gross <= Number(s.toAmount)));
  if (!slab) return { from: "—", to: "—" };
  return { from: Number(slab.fromAmount), to: slab.toAmount === null ? "∞" : Number(slab.toAmount) };
}

export async function buildLwfRegister(companyId: string, month: number, year: number) {
  const { run, payslips } = await loadRunPayslips(companyId, month, year);
  const cfg = await getLwfConfig(companyId, payslips[0]?.employee.branch?.state ?? null);
  const rows = payslips.map((ps) => {
    const lwf = cfg ? computeLwf(ps, cfg) : { employeeShare: 0, employerShare: 0, total: 0 };
    return {
      employeeCode: ps.employee.employeeCode,
      employeeName: `${ps.employee.firstName} ${ps.employee.lastName}`.trim(),
      state: cfg?.state ?? "",
      employeeShare: lwf.employeeShare,
      employerShare: lwf.employerShare,
      totalContribution: lwf.total,
    };
  });
  const totals = {
    employeeShare: round2(rows.reduce((s, r) => s + r.employeeShare, 0)),
    employerShare: round2(rows.reduce((s, r) => s + r.employerShare, 0)),
    totalContribution: round2(rows.reduce((s, r) => s + r.totalContribution, 0)),
  };
  return { run, month, year, config: cfg, rows, totals };
}

export async function buildTdsRegister(companyId: string, month: number, year: number) {
  const { run, payslips } = await loadRunPayslips(companyId, month, year);
  const fy = fiscalYearOf(month, year);
  const rows = [] as Array<Record<string, unknown>>;
  for (const ps of payslips) {
    const tdsComponent = ps.components.find((c) => c.payComponent?.code === "TDS" || c.name.toLowerCase() === "tds");
    const tax = await computeTaxForEmployee(companyId, ps.employeeId, fy, month);
    rows.push({
      employeeCode: ps.employee.employeeCode,
      employeeName: `${ps.employee.firstName} ${ps.employee.lastName}`.trim(),
      pan: ps.employee.pan ?? "",
      grossMonth: Number(ps.grossSalary),
      tdsDeducted: Number(tdsComponent?.amount ?? 0),
      computedMonthlyTds: tax.monthlyTds,
      ytdTds: tax.ytdTds,
      netPay: Number(ps.netSalary),
    });
  }
  const totals = {
    grossMonth: round2(rows.reduce((s, r) => s + Number(r.grossMonth), 0)),
    tdsDeducted: round2(rows.reduce((s, r) => s + Number(r.tdsDeducted), 0)),
    computedMonthlyTds: round2(rows.reduce((s, r) => s + Number(r.computedMonthlyTds), 0)),
    netPay: round2(rows.reduce((s, r) => s + Number(r.netPay), 0)),
  };
  return { run, month, year, financialYear: fy, rows, totals };
}

// ---------------------------------------------------------------------------
// Income tax engine
// ---------------------------------------------------------------------------

export interface TaxComputation {
  financialYear: string;
  regime: "OLD" | "NEW";
  throughMonth: number;
  monthsRemaining: number;
  grossAnnual: number;
  hraAnnual: number;
  hraExemptionClaimed: number;
  hraExemptionAllowed: number;
  professionalTaxAnnual: number;
  standardDeduction: number;
  salaryIncome: number;
  section80C: number;
  section80D: number;
  nps80CCD1B: number;
  homeLoanInterest: number;
  otherDeductions: number;
  totalDeductions: number;
  taxableIncome: number;
  taxBeforeRebate: number;
  rebate87A: number;
  educationCess: number;
  netAnnualTax: number;
  monthlyTds: number;
  suggestedRemainingMonthly: number;
  ytdGross: number;
  ytdTds: number;
  previousEmployerIncome: number;
  previousEmployerTax: number;
}

export async function computeTaxForEmployee(companyId: string, employeeId: string, financialYear: string, throughMonth?: number): Promise<TaxComputation> {
  const config = await getItConfig(companyId, financialYear);
  if (!config) throw notFound(`No income-tax configuration found for FY ${financialYear}.`);

  const tm = Math.min(Math.max(throughMonth ?? new Date().getMonth() + 1, 1), 12);
  const decl = await getDeclaration(companyId, employeeId, config.financialYear);

  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    include: { salaryStructures: { where: { isCurrent: true }, take: 1, include: { components: { include: { payComponent: true } } } } },
  });
  if (!emp) throw notFound("Employee not found.");

  const structure = emp.salaryStructures[0];
  const grossMonthly = structure ? Number(structure.grossSalary) : 0;
  const grossAnnual = round2(grossMonthly * 12);

  let basicAnnual = 0;
  let hraAnnual = 0;
  if (structure) {
    const inputs: ComponentInput[] = structure.components.map((c) => ({
      id: c.payComponent.id,
      code: c.payComponent.code,
      name: c.payComponent.name,
      componentType: c.payComponent.componentType === "DEDUCTION" ? "DEDUCTION" : "EARNING",
      calcType: (c.calcType ?? c.payComponent.calcType) as ComponentInput["calcType"],
      formula: c.formula ?? c.payComponent.formula,
      percentOf: c.percentOf ?? c.payComponent.percentOf,
      percent: Number(c.percent ?? c.payComponent.percent ?? 0),
      defaultValue: Number(c.value ?? c.payComponent.defaultValue ?? 0),
      value: c.value ? Number(c.value) : null,
      sortOrder: c.payComponent.sortOrder,
      isStatutory: c.payComponent.isStatutory,
      isVariable: c.payComponent.isVariable,
      isLoanRecovery: c.payComponent.isLoanRecovery,
    }));
    const resolved = resolveStructure(inputs, grossMonthly, 30);
    const line = (code: string) => resolved.earnings.find((l) => l.code === code)?.amount ?? 0;
    basicAnnual = round2(line("BASIC") * 12);
    hraAnnual = round2(line("HRA") * 12);
  }

  // HRA exemption = min(actual HRA received, metro% (or non-metro) of basic, declared claim)
  const hraPercent = Number(config.hraMetroPercent);
  const hraAllowedByRule = round2((basicAnnual * hraPercent) / 100);
  const hraMax = Math.min(hraAnnual, hraAllowedByRule);
  const hraExemptionClaimed = Math.min(Number(decl?.hraExemption ?? 0), Math.max(hraMax, 0));

  // YTD gross + deducted TDS up to through month
  const { start, end, months } = fyMonthWindow(config.financialYear, tm);
  const ytdPayslips = await prisma.payslip.findMany({
    where: { companyId, employeeId, run: { year: { gte: start.getFullYear(), lte: end.getFullYear() } } },
    include: { run: { select: { month: true, year: true } }, components: true },
  });
  const inWindow = ytdPayslips.filter((p) => {
    const key = p.run.year * 100 + p.run.month;
    return months.some((m) => m.year * 100 + m.month === key);
  });
  const ytdGross = round2(inWindow.reduce((s, p) => s + Number(p.grossSalary), 0));
  const ytdTds = round2(
    inWindow.reduce((s, p) => s + Number(p.components.find((c) => c.name.toLowerCase() === "tds")?.amount ?? 0), 0)
  );

  const regime = decl?.regime ?? "NEW";
  const standardDeduction = regime === "NEW" ? Number(config.standardDeductionNew) : Number(config.standardDeductionOld);
  const isNew = regime === "NEW";

  let professionalTaxAnnual = 0;
  if (!isNew) {
    const region = await getPtRegion(companyId, emp.state ?? null);
    professionalTaxAnnual = round2(ptAmountForGross(region, grossMonthly) * 12);
  }

  // Deductions are only allowable in the old regime (new regime has flat slabs).
  const capMin = (v: number, cap: number) => Math.min(Math.max(v, 0), cap);
  const section80C = isNew ? 0 : capMin(Number(decl?.section80C ?? 0), Number(config.deduction80CLimit));
  const section80D = isNew ? 0 : capMin(Number(decl?.section80D ?? 0), Number(config.deduction80DLimit));
  const nps80CCD1B = isNew ? 0 : capMin(Number(decl?.nps80CCD1B ?? 0), Number(config.nps80CCD1BLimit));
  const homeLoanInterest = isNew ? 0 : capMin(Number(decl?.homeLoanInterest ?? 0), Number(config.homeLoanInterestLimit));
  const otherDeductions = isNew ? 0 : Math.max(Number(decl?.otherDeductions ?? 0), 0);

  const salaryIncome = Math.max(0, round2(grossAnnual - hraExemptionClaimed - professionalTaxAnnual - standardDeduction));
  const totalDeductions = round2(section80C + section80D + nps80CCD1B + homeLoanInterest + otherDeductions);
  const taxableIncome = Math.max(0, round2(salaryIncome - totalDeductions));

  const slabs = config.slabs.filter((s) => s.regime === regime).sort((a, b) => Number(a.fromAmount) - Number(b.fromAmount));
  const taxBeforeRebate = computeSlabTax(taxableIncome, slabs);

  // Rebate u/s 87A
  const rebateLimit = isNew ? Number(config.rebate87ALimitNew) : Number(config.rebate87ALimitOld);
  const rebateAmount = isNew ? Number(config.rebate87AAmountNew) : Number(config.rebate87AAmountOld);
  const rebate87A = taxableIncome <= rebateLimit ? Math.min(taxBeforeRebate, rebateAmount) : 0;

  const netTaxBeforeCess = Math.max(0, taxBeforeRebate - rebate87A);
  const educationCess = round2((netTaxBeforeCess * Number(config.healthCessPercent)) / 100);
  const netAnnualTax = round2(netTaxBeforeCess + educationCess);

  const previousEmployerIncome = Number(decl?.previousEmployerIncome ?? 0);
  const previousEmployerTax = Number(decl?.previousEmployerTax ?? 0);
  const monthsRemaining = Math.max(12 - tm, 0);
  const annualTaxForTds = Math.max(0, netAnnualTax - previousEmployerTax);
  const monthlyTds = round2(monthsRemaining > 0 ? annualTaxForTds / 12 : annualTaxForTds);
  const suggestedRemainingMonthly = monthsRemaining > 0 ? round2(Math.max(0, (netAnnualTax - previousEmployerTax - ytdTds) / monthsRemaining)) : monthlyTds;

  return {
    financialYear: config.financialYear,
    regime,
    throughMonth: tm,
    monthsRemaining,
    grossAnnual,
    hraAnnual,
    hraExemptionClaimed,
    hraExemptionAllowed: hraMax,
    professionalTaxAnnual,
    standardDeduction,
    salaryIncome,
    section80C,
    section80D,
    nps80CCD1B,
    homeLoanInterest,
    otherDeductions,
    totalDeductions,
    taxableIncome,
    taxBeforeRebate,
    rebate87A,
    educationCess,
    netAnnualTax,
    monthlyTds,
    suggestedRemainingMonthly,
    ytdGross,
    ytdTds,
    previousEmployerIncome,
    previousEmployerTax,
  };
}

function computeSlabTax(income: number, slabs: Array<{ fromAmount: Prisma.Decimal; toAmount: Prisma.Decimal | null; rate: Prisma.Decimal }>): number {
  let tax = 0;
  for (const s of slabs) {
    const from = Number(s.fromAmount);
    const to = s.toAmount === null ? Infinity : Number(s.toAmount);
    if (income <= from) break;
    const taxableInSlab = Math.max(0, Math.min(income, to) - from);
    tax += round2((taxableInSlab * Number(s.rate)) / 100);
  }
  return round2(tax);
}

// ---------------------------------------------------------------------------
// Apply computed monthly TDS to a draft payroll run
// ---------------------------------------------------------------------------

export async function applyMonthlyTds(companyId: string, runId: string, userId: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, companyId } });
  if (!run) throw notFound("Payroll run not found.");
  if (run.status === "PAID" || run.status === "CANCELLED") throw badRequest(`TDS cannot be applied to a ${run.status} run.`);

  const fy = fiscalYearOf(run.month, run.year);
  const payslips = await prisma.payslip.findMany({ where: { runId }, include: { components: true } });
  const tdsComponentSource = await prisma.payComponent.findFirst({
    where: { companyId, code: "TDS", componentType: "DEDUCTION", isActive: true },
  });
  if (!tdsComponentSource) throw badRequest("Add a TDS pay component (code TDS) before applying monthly TDS.");

  let employeesUpdated = 0;
  for (const ps of payslips) {
    const tax = await computeTaxForEmployee(companyId, ps.employeeId, fy, run.month);
    const existing = ps.components.find((c) => c.payComponentId === tdsComponentSource.id || c.name.toLowerCase() === "tds");
    const line = { name: "TDS", componentType: "DEDUCTION" as const, amount: dec(tax.monthlyTds), isStatutory: true, sortOrder: 40 };
    if (existing) {
      await prisma.payslipComponent.update({ where: { id: existing.id }, data: line });
    } else {
      await prisma.payslipComponent.create({ data: { payslipId: ps.id, payComponentId: tdsComponentSource.id, ...line } });
    }
    employeesUpdated++;
  }

  // Recompute deductions + net from the (updated) component lines
  const fresh = await prisma.payslip.findMany({
    where: { runId },
    include: { components: true },
  });
  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;
  for (const ps of fresh) {
    const deductions = round2(ps.components.filter((c) => c.componentType === "DEDUCTION").reduce((s, c) => s + Number(c.amount), 0));
    const net = round2(
      Number(ps.totalEarnings) + Number(ps.reimbursements) + Number(ps.bonus) + Number(ps.incentives) + Number(ps.arrears) - deductions - Number(ps.lopAmount)
    );
    await prisma.payslip.update({ where: { id: ps.id }, data: { totalDeductions: dec(deductions), netSalary: dec(net) } });
    totalGross += Number(ps.grossSalary);
    totalDeductions += deductions;
    totalNet += net;
  }

  const updatedRun = await prisma.payrollRun.update({
    where: { id: runId },
    data: { totalGross: dec(totalGross), totalDeductions: dec(totalDeductions), totalNet: dec(totalNet) },
    include: { _count: { select: { payslips: true } } },
  });
  await prisma.auditLog.create({
    data: {
      companyId,
      module: "incomeTax",
      action: "UPDATE",
      entityType: "PayrollRun",
      entityId: runId,
      entityName: `Monthly TDS applied - ${run.month}/${run.year}`,
      userId,
      metadata: { financialYear: fy, employees: payslips.length },
    },
  });
  return { run: updatedRun, financialYear: fy, employeesUpdated };
}

// ---------------------------------------------------------------------------
// Compliance dashboard snapshot
// ---------------------------------------------------------------------------

export async function complianceDashboard(companyId: string, month: number, year: number) {
  const pf = await buildPfRegister(companyId, month, year).catch(() => null);
  const esi = await buildEsiRegister(companyId, month, year).catch(() => null);
  const pt = await buildPtRegister(companyId, month, year).catch(() => null);
  const lwf = await buildLwfRegister(companyId, month, year).catch(() => null);
  const tds = await buildTdsRegister(companyId, month, year).catch(() => null);

  const pfConfig = await getPfConfig(companyId);
  const esiConfig = await getEsiConfig(companyId);
  const lwfConfig = await getLwfConfig(companyId);
  const itConfig = await getItConfig(companyId);
  const settings = await getCompanyStatutorySettings(companyId).catch(() => null);

  return {
    month,
    year,
    run: pf?.run ? { id: pf.run.id, status: pf.run.status, payrollDays: pf.run.payrollDays } : null,
    cards: {
      pf: {
        employees: pf?.rows.length ?? 0,
        employeeShare: pf?.totals.memberContribution ?? 0,
        employerShare: pf?.totals.employerContribution ?? 0,
        total: pf?.totals.totalContribution ?? 0,
      },
      esi: {
        employees: esi?.rows.length ?? 0,
        employeeShare: esi?.totals.employeeContribution ?? 0,
        employerShare: esi?.totals.employerContribution ?? 0,
        total: esi?.totals.totalContribution ?? 0,
      },
      pt: { employees: pt?.rows.length ?? 0, total: pt?.totals.ptAmount ?? 0 },
      lwf: {
        employees: lwf?.rows.length ?? 0,
        employeeShare: lwf?.totals.employeeShare ?? 0,
        employerShare: lwf?.totals.employerShare ?? 0,
        total: lwf?.totals.totalContribution ?? 0,
      },
      tds: { employees: tds?.rows.length ?? 0, total: tds?.totals.tdsDeducted ?? 0, computed: tds?.totals.computedMonthlyTds ?? 0 },
    },
    readiness: {
      pfConfig: Boolean(pfConfig),
      esiConfig: Boolean(esiConfig),
      lwfConfig: Boolean(lwfConfig),
      itConfig: Boolean(itConfig),
      settings: Boolean(settings),
    },
  };
}

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

export function dec(n: number | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(round2(n instanceof Prisma.Decimal ? Number(n) : n));
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}