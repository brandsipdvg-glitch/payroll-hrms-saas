import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireCompanyId } from "@/lib/authz";
import { ok, created } from "@/lib/api";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import {
  computeLoanEmiSchedule,
  computeStatutoryBonus,
  calculateGratuity,
  computeSettlement,
} from "@/server/services/finance";
import { Prisma } from "@prisma/client";
import {
  ReimbursementType,
  ReimbursementStatus,
  LoanType,
  LoanStatus,
  BonusType,
  SettlementLineType,
} from "@prisma/client";

async function reqCtx(req: Request, permission: string) {
  const session = await auth();
  if (!session?.user) throw forbidden("Please sign in.");
  await requirePermission(permission);
  const companyId = requireCompanyId(session.user.companyId);
  void req;
  return { userId: session.user.id, companyId };
}

const employeeSelect = { id: true, firstName: true, lastName: true, employeeCode: true } as const;

// ---------------------------------------------------------------------------
// Reimbursements / claims (admin)
// ---------------------------------------------------------------------------

export async function listReimbursements(req: Request) {
  const { companyId } = await reqCtx(req, "reimbursements.read");
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const employeeId = sp.get("employeeId");
  const rows = await prisma.reimbursement.findMany({
    where: {
      companyId,
      ...(status ? { status: status as ReimbursementStatus } : {}),
      ...(employeeId ? { employeeId } : {}),
    },
    include: { employee: { select: employeeSelect } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return ok(rows);
}

export async function createReimbursement(req: Request) {
  const ctx = await reqCtx(req, "reimbursements.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { employeeId, type, description, expenseDate, amount, billReference, receiptUrls } = body as Record<string, unknown>;
  if (!employeeId || !type || !description || !amount || !expenseDate) throw badRequest("employeeId, type, description, amount and expenseDate are required.");
  const employee = await prisma.employee.findFirst({ where: { id: String(employeeId), companyId: ctx.companyId } });
  if (!employee) throw notFound("Employee not found.");
  const row = await prisma.reimbursement.create({
    data: {
      companyId: ctx.companyId,
      employeeId: String(employeeId),
      type: type as ReimbursementType,
      description: String(description),
      expenseDate: new Date(String(expenseDate)),
      amount: new Prisma.Decimal(Number(amount)),
      billReference: billReference ? String(billReference) : null,
      receiptUrls: receiptUrls ? (receiptUrls as string[]) : undefined,
      createdBy: ctx.userId,
      appliedBy: ctx.userId,
    },
  });
  await logAudit({ action: "CREATE", module: "reimbursements", entityType: "Reimbursement", entityId: row.id, companyId: ctx.companyId, userId: ctx.userId });
  return created(row);
}

export async function approveReimbursement(req: Request, id: string) {
  const ctx = await reqCtx(req, "reimbursements.manage");
  const claim = await prisma.reimbursement.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!claim) throw notFound("Reimbursement not found.");
  if (claim.status === "PROCESSED") throw badRequest("Already processed.");
  if (claim.status === "REJECTED") throw badRequest("Rejected claims cannot be approved.");
  const row = await prisma.reimbursement.update({ where: { id }, data: { status: "APPROVED", approvedBy: ctx.userId, approvedAt: new Date() } });
  await logAudit({ action: "APPROVE", module: "reimbursements", entityType: "Reimbursement", entityId: id, companyId: ctx.companyId, userId: ctx.userId });
  return ok(row);
}

export async function rejectReimbursement(req: Request, id: string) {
  const ctx = await reqCtx(req, "reimbursements.manage");
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const claim = await prisma.reimbursement.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!claim) throw notFound("Reimbursement not found.");
  if (claim.status === "PROCESSED") throw badRequest("Already processed.");
  if (claim.status === "REJECTED") throw badRequest("Already rejected.");
  const row = await prisma.reimbursement.update({
    where: { id },
    data: { status: "REJECTED", rejectionReason: body.reason ? String(body.reason) : null },
  });
  await logAudit({ action: "REJECT", module: "reimbursements", entityType: "Reimbursement", entityId: id, companyId: ctx.companyId, userId: ctx.userId });
  return ok(row);
}

export async function processReimbursement(req: Request, id: string) {
  const ctx = await reqCtx(req, "reimbursements.manage");
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const runId = body.runId as string | undefined;
  if (!runId) throw badRequest("runId is required.");
  const claim = await prisma.reimbursement.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!claim) throw notFound("Reimbursement not found.");
  if (claim.status === "PROCESSED") throw badRequest("Already processed.");
  if (claim.status !== "APPROVED") throw badRequest("Only approved claims can be processed.");
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, companyId: ctx.companyId } });
  if (!run) throw notFound("Payroll run not found.");
  if (run.status === "PAID" || run.status === "CANCELLED") throw badRequest("Run must be DRAFT or FINALIZED.");

  const adjustment = await prisma.payrollAdjustment.create({
    data: {
      companyId: ctx.companyId,
      runId: run.id,
      employeeId: claim.employeeId,
      type: "REIMBURSEMENT",
      amount: claim.amount,
      description: `${claim.type} reimbursement — ${claim.description}`.slice(0, 200),
      createdBy: ctx.userId,
    },
  });
  const row = await prisma.reimbursement.update({
    where: { id },
    data: { status: "PROCESSED", processedBy: ctx.userId, processedAt: new Date(), runId: run.id, adjustmentId: adjustment.id },
  });
  await logAudit({ action: "APPROVE", module: "reimbursements", entityType: "Reimbursement", entityId: id, companyId: ctx.companyId, userId: ctx.userId, metadata: { processed: true, runId: run.id } });
  return ok(row);
}

// ---------------------------------------------------------------------------
// Loans & salary advances (admin)
// ---------------------------------------------------------------------------

export async function listLoans(req: Request) {
  const { companyId } = await reqCtx(req, "loans.read");
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const employeeId = sp.get("employeeId");
  const rows = await prisma.loan.findMany({
    where: {
      companyId,
      ...(status ? { status: status as LoanStatus } : {}),
      ...(employeeId ? { employeeId } : {}),
    },
    include: {
      employee: { select: employeeSelect },
      _count: { select: { emis: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return ok(rows);
}

export async function createLoan(req: Request) {
  const ctx = await reqCtx(req, "loans.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { employeeId, loanType, principalAmount, interestRateAnnual, tenureMonths, startMonth, startYear, description } = body as Record<string, unknown>;
  if (!employeeId || !principalAmount || !tenureMonths || !startMonth || !startYear) throw badRequest("employeeId, principalAmount, tenureMonths, startMonth and startYear are required.");
  const employee = await prisma.employee.findFirst({ where: { id: String(employeeId), companyId: ctx.companyId } });
  if (!employee) throw notFound("Employee not found.");

  const principal = Number(principalAmount);
  const rate = Number(interestRateAnnual ?? 0);
  const tenure = Number(tenureMonths);
  const result = computeLoanEmiSchedule({
    principalAmount: principal,
    interestRateAnnual: rate,
    tenureMonths: tenure,
    startMonth: Number(startMonth),
    startYear: Number(startYear),
  });

  const loan = await prisma.$transaction(async (tx) => {
    const createdLoan = await tx.loan.create({
      data: {
        companyId: ctx.companyId,
        employeeId: String(employeeId),
        loanType: (loanType as LoanType) ?? "EMPLOYEE_LOAN",
        principalAmount: new Prisma.Decimal(principal),
        interestRateAnnual: new Prisma.Decimal(rate),
        tenureMonths: tenure,
        startMonth: Number(startMonth),
        startYear: Number(startYear),
        emiAmount: new Prisma.Decimal(result.emi),
        totalInterest: new Prisma.Decimal(result.totalInterest),
        totalRepayable: new Prisma.Decimal(result.totalRepayable),
        status: "APPROVED",
        description: description ? String(description) : null,
        requestedBy: ctx.userId,
        sanctionedBy: ctx.userId,
        createdBy: ctx.userId,
      },
    });
    await tx.loanEmi.createMany({
      data: result.schedule.map((line) => ({
        loanId: createdLoan.id,
        companyId: ctx.companyId,
        employeeId: String(employeeId),
        year: line.year,
        month: line.month,
        openingBalance: new Prisma.Decimal(line.openingBalance),
        principal: new Prisma.Decimal(line.principal),
        interest: new Prisma.Decimal(line.interest),
        total: new Prisma.Decimal(line.total),
        closingBalance: new Prisma.Decimal(line.closingBalance),
        status: "PENDING",
      })),
    });
    return createdLoan;
  });

  await logAudit({ action: "CREATE", module: "loans", entityType: "Loan", entityId: loan.id, companyId: ctx.companyId, userId: ctx.userId });
  return created(loan);
}

export async function getLoan(req: Request, id: string) {
  const { companyId } = await reqCtx(req, "loans.read");
  const loan = await prisma.loan.findFirst({
    where: { id, companyId },
    include: {
      employee: { select: employeeSelect },
      emis: { orderBy: [{ year: "asc" }, { month: "asc" }] },
    },
  });
  if (!loan) throw notFound("Loan not found.");
  return ok(loan);
}

export async function activateLoan(req: Request, id: string) {
  const ctx = await reqCtx(req, "loans.manage");
  const loan = await prisma.loan.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!loan) throw notFound("Loan not found.");
  if (loan.status === "ACTIVE") return ok(loan);
  if (loan.status !== "APPROVED") throw badRequest("Only approved loans can be activated.");
  const row = await prisma.loan.update({ where: { id }, data: { status: "ACTIVE", approvedBy: ctx.userId, approvedAt: new Date() } });
  await logAudit({ action: "APPROVE", module: "loans", entityType: "Loan", entityId: id, companyId: ctx.companyId, userId: ctx.userId, metadata: { activated: true } });
  return ok(row);
}

export async function processLoanEmis(req: Request, id: string) {
  const ctx = await reqCtx(req, "loans.manage");
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const { year, month, runId } = body as Record<string, unknown>;
  if (!year || !month || !runId) throw badRequest("year, month and runId are required.");
  const loan = await prisma.loan.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!loan) throw notFound("Loan not found.");
  if (loan.status !== "ACTIVE") throw badRequest("Only active loans can recover EMIs.");
  const run = await prisma.payrollRun.findFirst({ where: { id: String(runId), companyId: ctx.companyId } });
  if (!run) throw notFound("Payroll run not found.");
  if (run.status === "PAID" || run.status === "CANCELLED") throw badRequest("Run must be DRAFT or FINALIZED.");

  const emis = await prisma.loanEmi.findMany({ where: { loanId: loan.id, year: Number(year), month: Number(month), status: "PENDING" } });
  if (!emis.length) throw badRequest("No pending EMIs for the selected period.");

  let recovered = 0;
  await prisma.$transaction(async (tx) => {
    for (const emi of emis) {
      recovered += Number(emi.total);
      await tx.payrollAdjustment.create({
        data: {
          companyId: ctx.companyId,
          runId: run.id,
          employeeId: loan.employeeId,
          type: "LOAN_RECOVERY",
          amount: emi.total,
          description: `Loan EMI (${loan.id.slice(0, 8)}) — ${month}/${year}`,
          createdBy: ctx.userId,
        },
      });
      await tx.loanEmi.update({
        where: { id: emi.id },
        data: { status: "PAID", runId: run.id, paidAt: new Date() },
      });
    }
  });

  const remainingPending = await prisma.loanEmi.count({ where: { loanId: loan.id, status: "PENDING" } });
  let updatedLoan = loan;
  if (remainingPending === 0) {
    updatedLoan = await prisma.loan.update({ where: { id: loan.id }, data: { status: "CLOSED" } });
  }

  await logAudit({ action: "APPROVE", module: "loans", entityType: "Loan", entityId: id, companyId: ctx.companyId, userId: ctx.userId, metadata: { emisRecovered: emis.length, amount: recovered, runId: run.id } });
  return ok({ loan: updatedLoan, emisRecovered: emis.length, recovered });
}

export async function closeLoan(req: Request, id: string) {
  const ctx = await reqCtx(req, "loans.manage");
  const loan = await prisma.loan.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!loan) throw notFound("Loan not found.");
  const pending = await prisma.loanEmi.count({ where: { loanId: id, status: "PENDING" } });
  if (pending > 0) throw badRequest("Cannot close a loan with pending EMIs.");
  const row = await prisma.loan.update({ where: { id }, data: { status: "CLOSED" } });
  await logAudit({ action: "UPDATE", module: "loans", entityType: "Loan", entityId: id, companyId: ctx.companyId, userId: ctx.userId });
  return ok(row);
}

export async function cancelLoan(req: Request, id: string) {
  const ctx = await reqCtx(req, "loans.manage");
  const loan = await prisma.loan.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!loan) throw notFound("Loan not found.");
  if (loan.status === "ACTIVE") throw badRequest("Cannot cancel an active loan.");
  const paid = await prisma.loanEmi.count({ where: { loanId: id, status: "PAID" } });
  if (paid > 0) throw badRequest("Cannot cancel a loan that has recovered EMIs.");
  const row = await prisma.loan.update({ where: { id }, data: { status: "CANCELLED" } });
  await logAudit({ action: "REJECT", module: "loans", entityType: "Loan", entityId: id, companyId: ctx.companyId, userId: ctx.userId });
  return ok(row);
}

// ---------------------------------------------------------------------------
// Bonuses
// ---------------------------------------------------------------------------

export async function listBonusPlans(req: Request) {
  const { companyId } = await reqCtx(req, "bonusPlans.read");
  const rows = await prisma.bonusPlan.findMany({
    where: { companyId },
    include: {
      allocations: {
        include: { employee: { select: employeeSelect } },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return ok(rows);
}

export async function getBonusPlan(req: Request, id: string) {
  const { companyId } = await reqCtx(req, "bonusPlans.read");
  const plan = await prisma.bonusPlan.findFirst({
    where: { id, companyId },
    include: { allocations: { include: { employee: { select: employeeSelect } }, orderBy: { createdAt: "desc" } } },
  });
  if (!plan) throw notFound("Bonus plan not found.");
  return ok(plan);
}

async function calculatePlanTotal(tx: Prisma.TransactionClient, planId: string): Promise<number> {
  const allocations = await tx.bonusAllocation.findMany({ where: { planId } });
  return allocations.reduce((s, a) => s + Number(a.amount), 0);
}

export async function createBonusPlan(req: Request) {
  const ctx = await reqCtx(req, "bonusPlans.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { type, title, month, year, allocations } = body as Record<string, unknown>;
  if (!type || !title) throw badRequest("type and title are required.");
  if (!Array.isArray(allocations) || allocations.length === 0) throw badRequest("At least one allocation is required.");

  const plan = await prisma.$transaction(async (tx) => {
    const newPlan = await tx.bonusPlan.create({
      data: {
        companyId: ctx.companyId,
        type: type as BonusType,
        title: String(title),
        month: month ? Number(month) : null,
        year: year ? Number(year) : null,
        totalAmount: new Prisma.Decimal(0),
        status: "DRAFT",
        createdBy: ctx.userId,
      },
    });
    for (const alloc of allocations as Array<Record<string, unknown>>) {
      const employeeId = String(alloc.employeeId);
      const amount = Number(alloc.amount);
      if (!employeeId || !amount) throw badRequest("Each allocation needs employeeId and amount.");
      const employee = await tx.employee.findFirst({ where: { id: employeeId, companyId: ctx.companyId } });
      if (!employee) throw notFound(`Employee not found: ${employeeId}`);
      await tx.bonusAllocation.create({
        data: {
          planId: newPlan.id,
          companyId: ctx.companyId,
          employeeId,
          amount: new Prisma.Decimal(amount),
          reason: alloc.reason ? String(alloc.reason) : null,
        },
      });
    }
    const total = await calculatePlanTotal(tx, newPlan.id);
    return tx.bonusPlan.update({ where: { id: newPlan.id }, data: { totalAmount: new Prisma.Decimal(total) } });
  });
  await logAudit({ action: "CREATE", module: "bonusPlans", entityType: "BonusPlan", entityId: plan.id, companyId: ctx.companyId, userId: ctx.userId });
  return created(plan);
}

export async function generateStatutoryBonus(req: Request) {
  const ctx = await reqCtx(req, "bonusPlans.create");
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const title = body.title ? String(body.title) : "Statutory Bonus";
  const month = body.month ? Number(body.month) : null;
  const year = body.year ? Number(body.year) : null;

  const employees = await prisma.employee.findMany({
    where: { companyId: ctx.companyId, status: "ACTIVE", salaryStructures: { some: { isCurrent: true } } },
    include: { salaryStructures: { where: { isCurrent: true }, take: 1, include: { components: { include: { payComponent: true } } } } },
  });

  const allocations: Array<{ employeeId: string; amount: number; baseWage: number }> = [];
  for (const emp of employees) {
    const structure = emp.salaryStructures[0];
    if (!structure) continue;
    const basicComp = structure.components.find((c) => c.payComponent.code === "BASIC" && c.payComponent.componentType === "EARNING");
    const wage = basicComp ? Number(basicComp.value) : Number(structure.grossSalary);
    const amount = computeStatutoryBonus(wage);
    if (amount > 0) {
      // Don't double-count employees who already have an allocation in the period
      allocations.push({ employeeId: emp.id, amount, baseWage: wage });
    }
  }

  if (!allocations.length) throw badRequest("No eligible employees for statutory bonus.");

  const plan = await prisma.$transaction(async (tx) => {
    const newPlan = await tx.bonusPlan.create({
      data: {
        companyId: ctx.companyId,
        type: "STATUTORY",
        title,
        month: month,
        year: year,
        totalAmount: new Prisma.Decimal(0),
        status: "DRAFT",
        createdBy: ctx.userId,
      },
    });
    await tx.bonusAllocation.createMany({
      data: allocations.map((a) => ({
        planId: newPlan.id,
        companyId: ctx.companyId,
        employeeId: a.employeeId,
        baseWage: new Prisma.Decimal(a.baseWage),
        amount: new Prisma.Decimal(a.amount),
        reason: `Statutory bonus (8.33%)`,
      })),
    });
    const total = await calculatePlanTotal(tx, newPlan.id);
    return tx.bonusPlan.update({ where: { id: newPlan.id }, data: { totalAmount: new Prisma.Decimal(total) } });
  });

  await logAudit({ action: "CREATE", module: "bonusPlans", entityType: "BonusPlan", entityId: plan.id, companyId: ctx.companyId, userId: ctx.userId, metadata: { statutory: true, allocations: allocations.length } });
  return created(plan);
}

export async function approveBonusPlan(req: Request, id: string) {
  const ctx = await reqCtx(req, "bonusPlans.manage");
  const plan = await prisma.bonusPlan.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!plan) throw notFound("Bonus plan not found.");
  if (plan.status !== "DRAFT") throw badRequest("Only draft plans can be approved.");
  const row = await prisma.bonusPlan.update({ where: { id }, data: { status: "APPROVED", approvedBy: ctx.userId, approvedAt: new Date() } });
  await logAudit({ action: "APPROVE", module: "bonusPlans", entityType: "BonusPlan", entityId: id, companyId: ctx.companyId, userId: ctx.userId });
  return ok(row);
}

export async function processBonusPlan(req: Request, id: string) {
  const ctx = await reqCtx(req, "bonusPlans.manage");
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const runId = body.runId as string | undefined;
  if (!runId) throw badRequest("runId is required.");
  const plan = await prisma.bonusPlan.findFirst({
    where: { id, companyId: ctx.companyId },
    include: { allocations: true },
  });
  if (!plan) throw notFound("Bonus plan not found.");
  if (plan.status !== "APPROVED") throw badRequest("Only approved plans can be processed.");
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, companyId: ctx.companyId } });
  if (!run) throw notFound("Payroll run not found.");
  if (run.status === "PAID" || run.status === "CANCELLED") throw badRequest("Run must be DRAFT or FINALIZED.");

  await prisma.$transaction(async (tx) => {
    for (const alloc of plan.allocations) {
      await tx.payrollAdjustment.create({
        data: {
          companyId: ctx.companyId,
          runId: run.id,
          employeeId: alloc.employeeId,
          type: "BONUS",
          amount: alloc.amount,
          description: `${plan.title} (${plan.type})`.slice(0, 200),
          createdBy: ctx.userId,
        },
      });
      await tx.bonusAllocation.update({
        where: { id: alloc.id },
        data: { runId: run.id, paidAt: new Date() },
      });
    }
    await tx.bonusPlan.update({
      where: { id: plan.id },
      data: { status: "PROCESSED", processedBy: ctx.userId, processedAt: new Date() },
    });
  });

  await logAudit({ action: "APPROVE", module: "bonusPlans", entityType: "BonusPlan", entityId: id, companyId: ctx.companyId, userId: ctx.userId, metadata: { processed: true, runId: run.id } });
  const updated = await prisma.bonusPlan.findFirst({ where: { id, companyId: ctx.companyId }, include: { allocations: true } });
  return ok(updated);
}

export async function cancelBonusPlan(req: Request, id: string) {
  const ctx = await reqCtx(req, "bonusPlans.manage");
  const plan = await prisma.bonusPlan.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!plan) throw notFound("Bonus plan not found.");
  if (plan.status === "PROCESSED") throw badRequest("Processed plans cannot be cancelled.");
  const row = await prisma.bonusPlan.update({ where: { id }, data: { status: "CANCELLED" } });
  await logAudit({ action: "REJECT", module: "bonusPlans", entityType: "BonusPlan", entityId: id, companyId: ctx.companyId, userId: ctx.userId });
  return ok(row);
}

// ---------------------------------------------------------------------------
// Gratuity
// ---------------------------------------------------------------------------

export async function listGratuity(req: Request) {
  const { companyId } = await reqCtx(req, "gratuities.read");
  const sp = new URL(req.url).searchParams;
  const employeeId = sp.get("employeeId");
  const rows = await prisma.gratuityRecord.findMany({
    where: { companyId, ...(employeeId ? { employeeId } : {}) },
    include: { employee: { select: employeeSelect } },
    orderBy: { computedAt: "desc" },
    take: 500,
  });
  return ok(rows);
}

export async function computeGratuity(req: Request) {
  const ctx = await reqCtx(req, "gratuities.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { employeeId, financialYear } = body as Record<string, unknown>;
  if (!employeeId || !financialYear) throw badRequest("employeeId and financialYear are required.");

  const employee = await prisma.employee.findFirst({
    where: { id: String(employeeId), companyId: ctx.companyId },
    include: { salaryStructures: { where: { isCurrent: true }, take: 1, include: { components: { include: { payComponent: true } } } } },
  });
  if (!employee) throw notFound("Employee not found.");
  if (!employee.doj) throw badRequest("Employee has no date of joining.");

  // Resolve basic from current structure
  let basic = 0;
  const structure = employee.salaryStructures[0];
  if (structure) {
    const basicComp = structure.components.find((c) => c.payComponent.code === "BASIC" && c.payComponent.componentType === "EARNING");
    basic = basicComp ? Number(basicComp.value) : Number(structure.grossSalary);
  }

  // Provisioning horizon: end of the financial year (31 Mar of Y2)
  const match = /^\d{4}-\d{2}$/.exec(String(financialYear));
  if (!match) throw badRequest("financialYear must be in YYYY-YY format (e.g. 2026-27).");
  const fyStartYear = parseInt(match[0].slice(0, 4), 10);
  const projectionEnd = new Date(Date.UTC(fyStartYear + 1, 2, 31)); // 31 Mar Y2
  const doj = employee.doj;
  if (projectionEnd.getTime() <= doj.getTime()) throw badRequest("Employee joined after the financial year end.");

  const gratuityAmount = calculateGratuity(basic, doj, projectionEnd);
  const diffMs = projectionEnd.getTime() - doj.getTime();
  const totalDays = diffMs / (1000 * 60 * 60 * 24);
  const totalMonths = totalDays / 30.44;
  const yearsOfService = Math.max(0, Math.round((totalMonths / 12) * 100) / 100);

  const record = await prisma.gratuityRecord.upsert({
    where: { companyId_employeeId_financialYear: { companyId: ctx.companyId, employeeId: String(employeeId), financialYear: String(financialYear) } },
    update: {
      yearsOfService: new Prisma.Decimal(yearsOfService),
      basicLastDrawn: new Prisma.Decimal(basic),
      gratuityAmount: new Prisma.Decimal(gratuityAmount),
      status: "DRAFT",
      computedAt: new Date(),
    },
    create: {
      companyId: ctx.companyId,
      employeeId: String(employeeId),
      financialYear: String(financialYear),
      yearsOfService: new Prisma.Decimal(yearsOfService),
      basicLastDrawn: new Prisma.Decimal(basic),
      gratuityAmount: new Prisma.Decimal(gratuityAmount),
      status: "DRAFT",
      computedAt: new Date(),
      createdBy: ctx.userId,
    },
  });
  await logAudit({ action: "CREATE", module: "gratuities", entityType: "GratuityRecord", entityId: record.id, companyId: ctx.companyId, userId: ctx.userId });
  return created(record);
}

export async function approveGratuity(req: Request, id: string) {
  const ctx = await reqCtx(req, "gratuities.manage");
  const record = await prisma.gratuityRecord.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!record) throw notFound("Gratuity record not found.");
  const row = await prisma.gratuityRecord.update({ where: { id }, data: { status: "APPROVED" } });
  await logAudit({ action: "APPROVE", module: "gratuities", entityType: "GratuityRecord", entityId: id, companyId: ctx.companyId, userId: ctx.userId });
  return ok(row);
}

export async function deleteGratuity(req: Request, id: string) {
  const ctx = await reqCtx(req, "gratuities.delete");
  const record = await prisma.gratuityRecord.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!record) throw notFound("Gratuity record not found.");
  await prisma.gratuityRecord.delete({ where: { id } });
  await logAudit({ action: "DELETE", module: "gratuities", entityType: "GratuityRecord", entityId: id, companyId: ctx.companyId, userId: ctx.userId });
  return ok({ id, deleted: true });
}

// ---------------------------------------------------------------------------
// Full & final settlement
// ---------------------------------------------------------------------------

export async function listSettlements(req: Request) {
  const { companyId } = await reqCtx(req, "settlements.read");
  const rows = await prisma.settlement.findMany({
    where: { companyId },
    include: {
      employee: { select: employeeSelect },
      lines: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return ok(rows);
}

export async function getSettlement(req: Request, id: string) {
  const { companyId } = await reqCtx(req, "settlements.read");
  const settlement = await prisma.settlement.findFirst({
    where: { id, companyId },
    include: {
      employee: { select: { ...employeeSelect, doj: true, companyEmail: true } },
      exit: { select: { id: true, exitDate: true, exitType: true, reason: true } },
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!settlement) throw notFound("Settlement not found.");
  return ok(settlement);
}

export async function createSettlement(req: Request) {
  const ctx = await reqCtx(req, "settlements.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const employeeId = body.employeeId as string | undefined;
  if (!employeeId) throw badRequest("employeeId is required.");

  const existing = await prisma.settlement.findFirst({ where: { companyId: ctx.companyId, employeeId } });
  if (existing) throw badRequest("A settlement already exists for this employee.");

  const exit = await prisma.employeeExit.findFirst({
    where: { companyId: ctx.companyId, employeeId },
    orderBy: { exitDate: "desc" },
  });
  if (!exit) throw notFound("No exit record found for this employee.");

  const computed = await computeSettlement(ctx.companyId, employeeId, exit.exitDate);

  const settlement = await prisma.settlement.create({
    data: {
      companyId: ctx.companyId,
      employeeId,
      exitId: exit.id,
      lastWorkingDate: exit.exitDate,
      totalAmount: new Prisma.Decimal(computed.totalAmount),
      status: "DRAFT",
      createdBy: ctx.userId,
      lines: {
        create: computed.lines.map((line, i) => ({
          companyId: ctx.companyId,
          type: line.type as SettlementLineType,
          description: line.description,
          amount: new Prisma.Decimal(line.amount),
          sortOrder: (i + 1) * 100,
        })),
      },
    },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });

  await logAudit({ action: "CREATE", module: "settlements", entityType: "Settlement", entityId: settlement.id, companyId: ctx.companyId, userId: ctx.userId });
  return created(settlement);
}

export async function approveSettlement(req: Request, id: string) {
  const ctx = await reqCtx(req, "settlements.manage");
  const settlement = await prisma.settlement.findFirst({
    where: { id, companyId: ctx.companyId },
    include: { exit: { select: { id: true } } },
  });
  if (!settlement) throw notFound("Settlement not found.");
  if (settlement.status !== "DRAFT") throw badRequest("Only draft settlements can be approved.");
  const row = await prisma.settlement.update({ where: { id }, data: { status: "APPROVED", approvedBy: ctx.userId, approvedAt: new Date() } });
  if (settlement.exit) {
    await prisma.employeeExit.update({
      where: { id: settlement.exit.id },
      data: { finalSettlementDone: true, clearanceStatus: "APPROVED" },
    });
  }
  await logAudit({ action: "APPROVE", module: "settlements", entityType: "Settlement", entityId: id, companyId: ctx.companyId, userId: ctx.userId });
  return ok(row);
}

export async function disburseSettlement(req: Request, id: string) {
  const ctx = await reqCtx(req, "settlements.manage");
  const settlement = await prisma.settlement.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!settlement) throw notFound("Settlement not found.");
  if (settlement.status !== "APPROVED") throw badRequest("Only approved settlements can be disbursed.");
  const row = await prisma.settlement.update({ where: { id }, data: { status: "DISBURSED" } });
  await logAudit({ action: "APPROVE", module: "settlements", entityType: "Settlement", entityId: id, companyId: ctx.companyId, userId: ctx.userId, metadata: { disbursed: true } });
  return ok(row);
}

export async function deleteSettlement(req: Request, id: string) {
  const ctx = await reqCtx(req, "settlements.delete");
  const settlement = await prisma.settlement.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!settlement) throw notFound("Settlement not found.");
  if (settlement.status !== "DRAFT") throw badRequest("Only draft settlements can be deleted.");
  await prisma.settlement.delete({ where: { id } });
  await logAudit({ action: "DELETE", module: "settlements", entityType: "Settlement", entityId: id, companyId: ctx.companyId, userId: ctx.userId });
  return ok({ id, deleted: true });
}