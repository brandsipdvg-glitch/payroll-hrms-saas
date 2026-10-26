// ---------------------------------------------------------------------------
// Payroll engine: salary structure resolution, attendance-linked LOP/OT and
// pay-run processing (draft -> finalized -> paid).
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/errors";
import { evaluateFormula, round2 } from "@/server/services/formula";
import { Prisma } from "@prisma/client";

const IS_ACTIVE_EMPLOYMENT = ["ACTIVE", "PROBATION"] as const;
const OT_HOURS_PER_DAY = 8;

export interface ComponentInput {
  id: string;
  code: string;
  name: string;
  componentType: "EARNING" | "DEDUCTION";
  calcType: "FIXED" | "PERCENT_OF" | "FORMULA" | "ATTENDANCE";
  formula: string | null;
  percentOf: string | null;
  percent: number | null;
  defaultValue: number | null;
  value: number | null; // structure override
  sortOrder: number;
  isStatutory: boolean;
  isVariable: boolean;
  isLoanRecovery: boolean;
}

export interface ComputedLine {
  payComponentId: string;
  code: string;
  name: string;
  componentType: "EARNING" | "DEDUCTION";
  amount: number;
  isStatutory: boolean;
  isVariable: boolean;
  sortOrder: number;
}

export interface StructureResult {
  gross: number;
  perDay: number;
  earnings: ComputedLine[];
  deductions: ComputedLine[];
  warnings: string[];
}

export interface AttendanceStats {
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  halfDays: number;
  overtimeHours: number;
}

export interface PayrollRunInput {
  month: number;
  year: number;
  payrollDays?: number;
  notes?: string;
}

export interface AdjustmentInput {
  employeeId?: string | null;
  type: "REIMBURSEMENT" | "BONUS" | "INCENTIVE" | "ARREARS";
  amount: number;
  description?: string;
}

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

export function monthRange(month: number, year: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end };
}

// ---------------------------------------------------------------------------
// Salary structure resolution
// ---------------------------------------------------------------------------

function toComponentInputs(rows: Array<{
  payComponentId: string;
  calcType: string;
  formula: string | null;
  percentOf: string | null;
  percent: Prisma.Decimal | null;
  value: Prisma.Decimal | null;
  sortOrder: number;
  payComponent: {
    id: string;
    code: string;
    name: string;
    componentType: string;
    calcType: string;
    formula: string | null;
    percentOf: string | null;
    percent: Prisma.Decimal | null;
    defaultValue: Prisma.Decimal | null;
    sortOrder: number;
    isStatutory: boolean;
    isVariable: boolean;
    isLoanRecovery: boolean;
  };
}>): ComponentInput[] {
  return rows.map((r) => {
    const fixedDefault = r.value ?? r.payComponent.defaultValue;
    return {
      id: r.payComponent.id,
      code: r.payComponent.code,
      name: r.payComponent.name,
      componentType: r.payComponent.componentType === "DEDUCTION" ? "DEDUCTION" : "EARNING",
      calcType: (r.calcType ?? r.payComponent.calcType) as ComponentInput["calcType"],
      formula: r.formula ?? r.payComponent.formula,
      percentOf: r.percentOf ?? r.payComponent.percentOf,
      percent: Number(r.percent ?? r.payComponent.percent ?? 0),
      defaultValue: fixedDefault ? Number(fixedDefault) : 0,
      value: r.value ? Number(r.value) : null,
      sortOrder: r.payComponent.sortOrder,
      isStatutory: r.payComponent.isStatutory,
      isVariable: r.payComponent.isVariable,
      isLoanRecovery: r.payComponent.isLoanRecovery,
    };
  });
}

export function resolveStructure(
  inputs: ComponentInput[],
  gross: number,
  payrollDays: number
): StructureResult {
  const context: Record<string, number> = {
    GROSS: gross,
    PERDAY: payrollDays > 0 ? gross / payrollDays : gross,
    PAYROLLDAYS: payrollDays,
  };
  const earnings: ComputedLine[] = [];
  const deductions: ComputedLine[] = [];
  const amounts: Record<string, number> = {};
  const warnings: string[] = [];
  const sorted = [...inputs].sort((a, b) => a.sortOrder - b.sortOrder);

  let last: Record<string, number> = {};
  const maxPasses = sorted.some((c) => c.calcType === "FORMULA" || c.calcType === "PERCENT_OF") ? 12 : 1;

  for (let pass = 0; pass < maxPasses; pass++) {
    for (const c of sorted) {
      if (c.calcType === "ATTENDANCE") continue; // handled by the payroll run/LOP/OT engine
      let amount = 0;
      let ok = true;
      let message = "";
      if (c.calcType === "FIXED") {
        amount = c.value ?? c.defaultValue ?? 0;
      } else if (c.calcType === "PERCENT_OF") {
        const baseKey = (c.percentOf ?? "gross").toUpperCase();
        const base = amounts[baseKey] ?? context[baseKey] ?? 0;
        amount = (base * (c.percent ?? 0)) / 100;
      } else if (c.calcType === "FORMULA" && c.formula) {
        const full: Record<string, number> = { ...context, ...amounts, GROSS: gross };
        const res = evaluateFormula(c.formula, full);
        if (res.ok && res.value !== undefined) {
          amount = res.value;
        } else {
          ok = false;
          message = res.message ?? "formula failed";
          amount = 0;
        }
      }
      amount = round2(Math.abs(amount) < 0.005 ? 0 : amount);
      amounts[c.code] = amount;
      const line: ComputedLine = {
        payComponentId: c.id,
        code: c.code,
        name: c.name,
        componentType: c.componentType,
        amount,
        isStatutory: c.isStatutory,
        isVariable: c.isVariable,
        sortOrder: c.sortOrder,
      };
      if (ok) {
        if (c.componentType === "DEDUCTION") {
          upsertLine(deductions, line);
        } else {
          upsertLine(earnings, line);
        }
      } else {
        warnings.push(`${c.name} (${c.code}): ${message}`);
      }
    }
    // convergence check on the two most important derived numbers
    const delta =
      Math.abs((amounts.BASIC ?? 0) - (last.BASIC ?? -Infinity)) +
      Math.abs((amounts.HRA ?? 0) - (last.HRA ?? -Infinity));
    if (delta < 0.01) break;
    last = { ...amounts };
  }

  const perDay = payrollDays > 0 ? gross / payrollDays : gross;
  return { gross, perDay, earnings, deductions, warnings };
}

function upsertLine(arr: ComputedLine[], line: ComputedLine) {
  const idx = arr.findIndex((l) => l.payComponentId === line.payComponentId);
  if (idx >= 0) arr[idx] = line;
  else arr.push(line);
}

// ---------------------------------------------------------------------------
// Attendance rollup for a payroll period
// ---------------------------------------------------------------------------

export async function getAttendanceStats(
  companyId: string,
  employeeId: string,
  start: Date,
  end: Date
): Promise<AttendanceStats> {
  const rows = await prisma.attendance.findMany({
    where: { companyId, employeeId, date: { gte: start, lte: end } },
    select: { status: true, overtimeMinutes: true },
  });
  let present = 0;
  let half = 0;
  let absent = 0;
  let leave = 0;
  let otMinutes = 0;
  for (const r of rows) {
    switch (r.status) {
      case "PRESENT":
        present += 1;
        break;
      case "HALF_DAY":
        half += 1;
        break;
      case "ABSENT":
        absent += 1;
        break;
      case "ON_LEAVE":
        leave += 1;
        break;
      default:
        break; // WEEK_OFF / HOLIDAY / PENDING ignored
    }
    otMinutes += r.overtimeMinutes ?? 0;
  }
  return {
    presentDays: present + half * 0.5,
    absentDays: absent,
    leaveDays: leave,
    halfDays: half,
    overtimeHours: round2(otMinutes / 60),
  };
}

// ---------------------------------------------------------------------------
// Run lifecycle
// ---------------------------------------------------------------------------

export async function processPayrollRun(companyId: string, userId: string, input: PayrollRunInput) {
  if (!input.month || !input.year) throw badRequest("month and year are required.");
  const existing = await prisma.payrollRun.findUnique({
    where: { companyId_month_year: { companyId, month: input.month, year: input.year } },
  });
  if (existing) throw badRequest(`Payroll for ${input.month}/${input.year} already exists (status ${existing.status}).`);

  const { start, end } = monthRange(input.month, input.year);
  const payrollDays = input.payrollDays ?? daysInMonth(input.month, input.year);

  const employees = await prisma.employee.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      employmentStatus: { in: [...IS_ACTIVE_EMPLOYMENT] },
      salaryStructures: { some: { isCurrent: true } },
    },
    include: {
      salaryStructures: { where: { isCurrent: true }, take: 1, include: { components: { include: { payComponent: true } } } },
      bankDetails: { where: { isPrimary: true, isActive: true }, take: 1 },
    },
    orderBy: { employeeCode: "asc" },
  });

  const run = await prisma.payrollRun.create({
    data: {
      companyId,
      month: input.month,
      year: input.year,
      periodStart: start,
      periodEnd: end,
      payrollDays,
      status: "DRAFT",
      processedBy: userId,
      processedAt: new Date(),
      notes: input.notes ?? null,
    },
  });

  const warnings: string[] = [];
  let totalGross = 0;
  let totalDeductions = 0;
  let totalReimbursements = 0;
  let totalArrears = 0;
  let totalBonus = 0;
  let totalNet = 0;

  for (const emp of employees) {
    const structure = emp.salaryStructures[0];
    if (!structure) continue;
    const result = await computePayslipForEmployee(companyId, run.id, emp, structure, emp.bankDetails[0], input.month, input.year, payrollDays);
    warnings.push(...result.warnings);
    if (!result.payslip) continue;
    totalGross += Number(result.payslip.grossSalary);
    totalDeductions += Number(result.payslip.totalDeductions) + Number(result.payslip.lopAmount);
    totalReimbursements += Number(result.payslip.reimbursements);
    totalArrears += Number(result.payslip.arrears);
    totalBonus += Number(result.payslip.bonus) + Number(result.payslip.incentives);
    totalNet += Number(result.payslip.netSalary);
  }

  const updatedRun = await prisma.payrollRun.update({
    where: { id: run.id },
    data: {
      totalGross: dec(totalGross),
      totalDeductions: dec(totalDeductions),
      totalReimbursements: dec(totalReimbursements),
      totalArrears: dec(totalArrears),
      totalBonus: dec(totalBonus),
      totalNet: dec(totalNet),
    },
  });

  const payslips = await prisma.payslip.findMany({
    where: { runId: run.id },
    include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
    orderBy: { employee: { employeeCode: "asc" } },
  });

  return { run: updatedRun, payslips, employeesProcessed: payslips.length, skipped: employees.length - payslips.length, warnings };
}

async function computePayslipForEmployee(
  companyId: string,
  runId: string,
  emp: { id: string; user?: { email?: string } | null },
  structure: {
    id: string;
    grossSalary: Prisma.Decimal;
    paymentMode: string;
    components: Array<{
      payComponentId: string;
      calcType: string;
      formula: string | null;
      percentOf: string | null;
      percent: Prisma.Decimal | null;
      value: Prisma.Decimal | null;
      sortOrder: number;
      payComponent: {
        id: string;
        code: string;
        name: string;
        componentType: string;
        calcType: string;
        formula: string | null;
        percentOf: string | null;
        percent: Prisma.Decimal | null;
        defaultValue: Prisma.Decimal | null;
        sortOrder: number;
        isStatutory: boolean;
        isVariable: boolean;
        isLoanRecovery: boolean;
      };
    }>;
  },
  bank: { accountNumber: string; ifscCode: string; bankName: string } | null | undefined,
  month: number,
  year: number,
  payrollDays: number
) {
  const gross = Number(structure.grossSalary);
  const inputs = toComponentInputs(structure.components);
  const { start, end } = monthRange(month, year);
  const stats = await getAttendanceStats(companyId, emp.id, start, end);

  const resolved = resolveStructure(inputs, gross, payrollDays);
  const perDay = round2(resolved.perDay);
  const lopAmount = round2(stats.absentDays * perDay);
  const lopDays = stats.absentDays;

  // Overtime: rate per hour = per-day salary / standard working hours
  const otComponent = inputs.find((c) => c.calcType === "ATTENDANCE" && c.code === "OT");
  const overtimePay = otComponent && stats.overtimeHours > 0 ? round2(stats.overtimeHours * (perDay / OT_HOURS_PER_DAY)) : 0;

  // Adjustments attached to this run (used on re-run/finalize)
  const adjustments = await prisma.payrollAdjustment.findMany({ where: { runId, employeeId: emp.id } });
  let reimbursements = 0;
  let bonus = 0;
  let incentives = 0;
  let arrears = 0;
  let loanRecovery = 0;
  let loanRecoveryDescription: string | null = null;
  for (const a of adjustments) {
    const amt = Number(a.amount);
    if (a.type === "REIMBURSEMENT") reimbursements += amt;
    else if (a.type === "BONUS") bonus += amt;
    else if (a.type === "INCENTIVE") incentives += amt;
    else if (a.type === "ARREARS") arrears += amt;
    else if (a.type === "LOAN_RECOVERY") {
      loanRecovery += amt;
      loanRecoveryDescription = a.description ?? null;
    }
  }

  const totalEarnings = round2(resolved.earnings.reduce((s, l) => s + l.amount, 0) + overtimePay);
  const totalDeductions = round2(resolved.deductions.reduce((s, l) => s + l.amount, 0) + loanRecovery);
  const netSalary = round2(totalEarnings + reimbursements + bonus + incentives + arrears - totalDeductions - lopAmount);

  const payslip = await prisma.payslip.create({
    data: {
      runId,
      companyId,
      employeeId: emp.id,
      structureId: structure.id,
      status: "DRAFT",
      payrollDays,
      presentDays: stats.presentDays,
      absentDays: stats.absentDays,
      leaveDays: stats.leaveDays,
      perDaySalary: dec(perDay),
      lopDays,
      lopAmount: dec(lopAmount),
      grossSalary: dec(gross),
      totalEarnings: dec(totalEarnings),
      overtimeHours: dec(stats.overtimeHours),
      overtimePay: dec(overtimePay),
      totalDeductions: dec(totalDeductions),
      reimbursements: dec(reimbursements),
      bonus: dec(bonus),
      arrears: dec(arrears),
      incentives: dec(incentives),
      netSalary: dec(netSalary),
      bankAccount: bank?.accountNumber ?? null,
      bankIfsc: bank?.ifscCode ?? null,
      bankName: bank?.bankName ?? null,
      paymentMode: structure.paymentMode ?? "BANK",
      createdBy: "system",
      components: {
        create: [
          ...resolved.earnings.map((l) => ({
            payComponentId: l.payComponentId,
            name: l.name,
            componentType: "EARNING" as const,
            amount: dec(l.amount),
            isStatutory: l.isStatutory,
            sortOrder: l.sortOrder,
          })),
          ...(overtimePay > 0
            ? [
                {
                  payComponentId: otComponent?.id ?? null,
                  name: "Overtime",
                  componentType: "EARNING" as const,
                  amount: dec(overtimePay),
                  isStatutory: false,
                  sortOrder: otComponent?.sortOrder ?? 55,
                },
              ]
            : []),
          ...resolved.deductions.map((l) => ({
            payComponentId: l.payComponentId,
            name: l.name,
            componentType: "DEDUCTION" as const,
            amount: dec(l.amount),
            isStatutory: l.isStatutory,
            sortOrder: l.sortOrder,
          })),
          ...(loanRecovery > 0
            ? [
                {
                  payComponentId: null,
                  name: loanRecoveryDescription ?? "Loan EMI recovery",
                  componentType: "DEDUCTION" as const,
                  amount: dec(loanRecovery),
                  isStatutory: false,
                  sortOrder: 99,
                },
              ]
            : []),
        ],
      },
    },
  });

  return { payslip, warnings: resolved.warnings };
}

// ---------------------------------------------------------------------------
// Post-run operations
// ---------------------------------------------------------------------------

export async function getRunOrThrow(companyId: string, runId: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, companyId } });
  if (!run) throw notFound("Payroll run not found.");
  return run;
}

export async function recalculateRun(companyId: string, runId: string) {
  const run = await getRunOrThrow(companyId, runId);
  if (run.status === "PAID") throw badRequest("Paid runs cannot be recalculated.");
  if (run.status === "CANCELLED") throw badRequest("Cancelled runs cannot be recalculated.");

  const employees = await prisma.employee.findMany({
    where: { companyId, status: "ACTIVE", salaryStructures: { some: { isCurrent: true } } },
    include: {
      salaryStructures: { where: { isCurrent: true }, take: 1, include: { components: { include: { payComponent: true } } } },
      bankDetails: { where: { isPrimary: true, isActive: true }, take: 1 },
    },
  });

  await prisma.payslipComponent.deleteMany({ where: { payslip: { runId } } });
  await prisma.payslip.deleteMany({ where: { runId } });

  const warnings: string[] = [];
  let totalGross = 0;
  let totalDeductions = 0;
  let totalReimbursements = 0;
  let totalArrears = 0;
  let totalBonus = 0;
  let totalNet = 0;
  for (const emp of employees) {
    const structure = emp.salaryStructures[0];
    if (!structure) continue;
    const result = await computePayslipForEmployee(
      companyId,
      runId,
      emp,
      structure,
      emp.bankDetails[0] ?? null,
      run.month,
      run.year,
      run.payrollDays
    );
    warnings.push(...result.warnings);
    if (!result.payslip) continue;
    totalGross += Number(result.payslip.grossSalary);
    totalDeductions += Number(result.payslip.totalDeductions) + Number(result.payslip.lopAmount);
    totalReimbursements += Number(result.payslip.reimbursements);
    totalArrears += Number(result.payslip.arrears);
    totalBonus += Number(result.payslip.bonus) + Number(result.payslip.incentives);
    totalNet += Number(result.payslip.netSalary);
  }

  const updated = await prisma.payrollRun.update({
    where: { id: runId },
    data: {
      status: "DRAFT",
      processedAt: new Date(),
      totalGross: dec(totalGross),
      totalDeductions: dec(totalDeductions),
      totalReimbursements: dec(totalReimbursements),
      totalArrears: dec(totalArrears),
      totalBonus: dec(totalBonus),
      totalNet: dec(totalNet),
    },
  });
  const payslips = await listPayslipsForRun(runId);
  return { run: updated, payslips, warnings };
}

export async function listPayslipsForRun(runId: string) {
  return prisma.payslip.findMany({
    where: { runId },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: { select: { title: true } } } },
    },
    orderBy: { employee: { employeeCode: "asc" } },
  });
}

export async function finalizeRun(companyId: string, runId: string, userId: string) {
  const run = await getRunOrThrow(companyId, runId);
  if (run.status !== "DRAFT") throw badRequest(`Run cannot be finalized from status "${run.status}".`);
  const updated = await prisma.$transaction([
    prisma.payrollRun.update({ where: { id: runId }, data: { status: "FINALIZED", finalizedBy: userId, finalizedAt: new Date() } }),
    prisma.payslip.updateMany({ where: { runId }, data: { status: "FINAL" } }),
  ]);
  return updated[0];
}

export async function markRunPaid(companyId: string, runId: string, userId: string) {
  const run = await getRunOrThrow(companyId, runId);
  if (run.status !== "FINALIZED") throw badRequest(`Run must be finalized before payment (current status "${run.status}").`);
  const updated = await prisma.$transaction([
    prisma.payrollRun.update({ where: { id: runId }, data: { status: "PAID", paidBy: userId, paidAt: new Date() } }),
    prisma.payslip.updateMany({ where: { runId }, data: { status: "PAID" } }),
  ]);
  return updated[0];
}

export async function cancelRun(companyId: string, runId: string, userId: string) {
  const run = await getRunOrThrow(companyId, runId);
  if (run.status === "PAID") throw badRequest("Paid runs cannot be cancelled.");
  const updated = await prisma.payrollRun.update({ where: { id: runId }, data: { status: "CANCELLED", paidBy: null, paidAt: null, finalizedBy: null, finalizedAt: null } });
  return updated;
}

// ---------------------------------------------------------------------------
// Salary register / reports / bank file
// ---------------------------------------------------------------------------

export async function buildRunRegister(companyId: string, runId: string) {
  const run = await getRunOrThrow(companyId, runId);
  const payslips = await listPayslipsForRun(runId);
  const rows = payslips.map((p) => ({
    employeeId: p.employeeId,
    employeeCode: p.employee.employeeCode,
    employeeName: `${p.employee.firstName} ${p.employee.lastName}`.trim(),
    designation: p.employee.designation?.title ?? null,
    payrollDays: p.payrollDays,
    presentDays: p.presentDays,
    absentDays: p.absentDays,
    leaveDays: p.leaveDays,
    lopAmount: Number(p.lopAmount),
    grossSalary: Number(p.grossSalary),
    overtimePay: Number(p.overtimePay),
    totalEarnings: Number(p.totalEarnings),
    reimbursements: Number(p.reimbursements),
    bonus: Number(p.bonus),
    incentives: Number(p.incentives),
    arrears: Number(p.arrears),
    totalDeductions: Number(p.totalDeductions),
    netSalary: Number(p.netSalary),
  }));
  return { run, rows };
}

export async function buildRunSummary(companyId: string, runId: string) {
  const run = await getRunOrThrow(companyId, runId);
  const lines = await prisma.payslipComponent.groupBy({
    by: ["componentType", "name"],
    where: { payslip: { runId } },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
  });
  const earnings = lines.filter((l) => l.componentType === "EARNING").map((l) => ({ name: l.name, amount: Number(l._sum.amount ?? 0) }));
  const deductions = lines.filter((l) => l.componentType === "DEDUCTION").map((l) => ({ name: l.name, amount: Number(l._sum.amount ?? 0) }));
  return { run, earnings, deductions };
}

export async function buildBankFile(companyId: string, runId: string) {
  const run = await getRunOrThrow(companyId, runId);
  if (run.status === "DRAFT") throw badRequest("Finalize the run before generating the bank file.");
  const payslips = await listPayslipsForRun(runId);
  return payslips
    .filter((p) => p.paymentMode === "BANK" && p.bankAccount)
    .map((p) => ({
      employeeCode: p.employee.employeeCode,
      employeeName: `${p.employee.firstName} ${p.employee.lastName}`.trim(),
      bankName: p.bankName ?? "",
      bankAccount: p.bankAccount ?? "",
      bankIfsc: p.bankIfsc ?? "",
      netPay: Number(p.netSalary),
    }));
}

function dec(n: number | Prisma.Decimal): Prisma.Decimal {
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