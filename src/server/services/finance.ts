import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/errors";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Loan EMI
// ---------------------------------------------------------------------------

export interface LoanInput {
  principalAmount: number;
  interestRateAnnual: number; // 0-100
  tenureMonths: number;
  startMonth: number;
  startYear: number;
}

export interface EmiLine {
  year: number;
  month: number;
  openingBalance: number;
  principal: number;
  interest: number;
  total: number;
  closingBalance: number;
}

export interface EmiResult {
  emi: number;
  totalInterest: number;
  totalRepayable: number;
  schedule: EmiLine[];
}

export function computeLoanEmiSchedule(input: LoanInput): EmiResult {
  const { principalAmount, interestRateAnnual, tenureMonths, startMonth, startYear } = input;
  const p = principalAmount;
  const n = tenureMonths;

  if (n <= 0) throw badRequest("Tenure must be greater than zero.");

  // Monthly interest rate
  const r = interestRateAnnual > 0 ? (interestRateAnnual / 100) / 12 : 0;

  let emi: number;
  if (r === 0) {
    // Flat repayment
    emi = round2(p / n);
  } else {
    const factor = Math.pow(1 + r, n);
    emi = round2((p * r * factor) / (factor - 1));
  }

  const schedule: EmiLine[] = [];
  let balance = p;
  let y = startYear;
  let m = startMonth;

  for (let i = 0; i < n; i++) {
    const interest = round2(balance * r);
    let principal = round2(emi - interest);
    // Final EMI clears rounding residual
    if (i === n - 1) principal = balance;
    const closing = round2(balance - principal);

    schedule.push({
      year: y,
      month: m,
      openingBalance: round2(balance),
      principal,
      interest,
      total: round2(principal + interest),
      closingBalance: closing,
    });

    balance = closing;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }

  const totalInterest = round2(schedule.reduce((s, l) => s + l.interest, 0));
  const totalRepayable = round2(p + totalInterest);

  return { emi, totalInterest, totalRepayable, schedule };
}

// ---------------------------------------------------------------------------
// Gratuity  —  (Basic × 15 × Years) / 26
// ---------------------------------------------------------------------------

/**
 * Compute gratuity amount per the Payment of Gratuity Act (simplified).
 * @param basic  Last drawn monthly basic + DA (or basic if no DA component).
 * @param doj    Date of joining (or latest regularization date).
 * @param exitDate  Last working date.
 * @returns Gratuity amount (0 if < 5 years of completed service per Act).
 */
export function calculateGratuity(basic: number, doj: Date, exitDate: Date): number {
  const diffMs = exitDate.getTime() - doj.getTime();
  const totalDays = diffMs / (1000 * 60 * 60 * 24);

  // Years of service — completed years, with months >= 6 counted as +1 year
  const totalMonths = totalDays / 30.44; // average days per month
  const completedYears = Math.floor(totalMonths / 12);
  const remainingMonths = Math.round(totalMonths % 12);
  const years = remainingMonths >= 6 ? completedYears + 1 : completedYears;

  // Act: minimum 5 years required (simplified)
  if (years < 5) return 0;

  return round2((basic * 15 * years) / 26);
}

// ---------------------------------------------------------------------------
// Statutory Bonus (approximation for monthly provisioning)
// ---------------------------------------------------------------------------

/**
 * Statutory bonus computation (Payment of Bonus Act, simplified).
 * - Eligibility: monthly wage ≤ ₹21,000.
 * - Amount: 8.33% of annual eligible wage, floored to ₹100 minimum per annum,
 *   returned as a monthly provisioning amount.
 */
export function computeStatutoryBonus(monthlyEligibleWage: number): number {
  if (monthlyEligibleWage > 21000) return 0;
  const annual = monthlyEligibleWage * 12 * 0.0833;
  const annualFloor = Math.max(annual, 100);
  return round2(annualFloor / 12);
}

// ---------------------------------------------------------------------------
// Full & final settlement computation
// ---------------------------------------------------------------------------

export async function computeSettlement(
  companyId: string,
  employeeId: string,
  exitDate: Date
): Promise<{ lines: Array<{ type: string; description: string; amount: number }>; totalAmount: number }> {
  const lines: Array<{ type: string; description: string; amount: number }> = [];

  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!employee) throw notFound("Employee not found.");

  const structure = await prisma.salaryStructure.findFirst({
    where: { companyId, employeeId, isCurrent: true },
    include: { components: { include: { payComponent: true } } },
  });

  const gross = structure ? Number(structure.grossSalary) : 0;
  const perDay = gross > 0 ? gross / 26 : 0;

  // ---- 1. Final salary (pro-rata for partial month) ----
  // For simplicity assume LWD is last day worked in its month.
  const finalMonthDays = exitDate.getDate();
  const finalSalary = round2(perDay * finalMonthDays);
  if (finalSalary > 0) {
    lines.push({ type: "FINAL_SALARY", description: `Pro-rata salary up to ${exitDate.toISOString().slice(0, 10)}`, amount: finalSalary });
  }

  // ---- 2. Leave encashment ----
  const currentYear = exitDate.getMonth() < 3 ? exitDate.getFullYear() - 1 : exitDate.getFullYear();
  const encashableBalances = await prisma.leaveBalance.findMany({
    where: {
      companyId, employeeId, year: currentYear,
      leaveType: { isEncashable: true },
    },
    include: { leaveType: { select: { name: true, maxEncashable: true } } },
  });
  let totalLeaveEncash = 0;
  for (const bal of encashableBalances) {
    let days = bal.closingBalance;
    if (bal.leaveType.maxEncashable && bal.leaveType.maxEncashable > 0) {
      days = Math.min(days, bal.leaveType.maxEncashable);
    }
    if (days > 0) {
      const amt = round2(days * perDay);
      lines.push({ type: "LEAVE_ENCASHMENT", description: `${bal.leaveType.name} — ${days} days encashment`, amount: amt });
      totalLeaveEncash += amt;
    }
  }

  // ---- 3. Gratuity ----
  const basic = structure ? (() => {
    const basicComp = structure.components.find(c => c.payComponent.code === "BASIC" && c.payComponent.componentType === "EARNING");
    return basicComp ? Number(basicComp.value) : 0;
  })() : 0;

  if (basic > 0 && employee.doj) {
    const gratuity = calculateGratuity(basic, employee.doj, exitDate);
    if (gratuity > 0) {
      lines.push({ type: "GRATUITY", description: "Gratuity per Payment of Gratuity Act", amount: gratuity });
    }
  }

  // ---- 4. Loan recovery (sum of pending EMIs) ----
  const activeLoans = await prisma.loan.findMany({
    where: { companyId, employeeId, status: { in: ["APPROVED", "ACTIVE"] } },
  });
  let loanRecovery = 0;
  for (const loan of activeLoans) {
    const pendingEmis = await prisma.loanEmi.findMany({
      where: { loanId: loan.id, status: "PENDING" },
    });
    const outstanding = pendingEmis.reduce((s, e) => s + Number(e.total), 0);
    if (outstanding > 0) {
      loanRecovery += outstanding;
      const label = loan.loanType === "SALARY_ADVANCE" ? "Salary advance outstanding" : `Loan outstanding (${loan.id.slice(0, 8)})`;
      lines.push({ type: "LOAN_RECOVERY", description: label, amount: -outstanding });
    }
  }

  // ---- 5. Pending bonus allocations ----
  const pendingBonuses = await prisma.bonusAllocation.findMany({
    where: { companyId, employeeId, runId: null, plan: { status: "APPROVED" } },
  });
  let bonusTotal = 0;
  for (const alloc of pendingBonuses) {
    bonusTotal += Number(alloc.amount);
  }
  if (bonusTotal > 0) {
    lines.push({ type: "BONUS", description: "Pending bonus allocations", amount: bonusTotal });
  }

  // ---- 6. Pending reimbursements ----
  const pendingReimbursements = await prisma.reimbursement.findMany({
    where: { companyId, employeeId, status: "APPROVED" },
  });
  let reimburseTotal = 0;
  for (const r of pendingReimbursements) {
    reimburseTotal += Number(r.amount);
  }
  if (reimburseTotal > 0) {
    lines.push({ type: "REIMBURSEMENT", description: "Approved reimbursement claims", amount: reimburseTotal });
  }

  const totalAmount = round2(lines.reduce((s, l) => s + l.amount, 0));
  return { lines, totalAmount };
}
