import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireCompanyId } from "@/lib/authz";
import { ok, created } from "@/lib/api";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { ReimbursementType, ReimbursementStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";

async function selfContext(permission: string) {
  const session = await auth();
  if (!session?.user) throw forbidden("Please sign in.");
  if (!session.user.employeeId) throw forbidden("Your account is not linked to an employee profile.");
  await requirePermission(permission);
  const companyId = requireCompanyId(session.user.companyId);
  return { userId: session.user.id, companyId, employeeId: session.user.employeeId };
}

export async function listMyReimbursements(req: Request) {
  const ctx = await selfContext("reimbursements.read");
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const rows = await prisma.reimbursement.findMany({
    where: {
      companyId: ctx.companyId,
      employeeId: ctx.employeeId,
      ...(status ? { status: status as ReimbursementStatus } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return ok(rows);
}

export async function createMyReimbursement(req: Request) {
  const ctx = await selfContext("reimbursements.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { type, description, expenseDate, amount, billReference, receiptUrls } = body as Record<string, unknown>;
  if (!type || !description || !amount || !expenseDate) throw badRequest("type, description, amount and expenseDate are required.");
  const row = await prisma.reimbursement.create({
    data: {
      companyId: ctx.companyId,
      employeeId: ctx.employeeId,
      type: type as ReimbursementType,
      description: String(description),
      expenseDate: new Date(String(expenseDate)),
      amount: new Prisma.Decimal(Number(amount)),
      billReference: billReference ? String(billReference) : null,
      receiptUrls: receiptUrls ? (receiptUrls as string[]) : undefined,
      appliedBy: ctx.userId,
      createdBy: ctx.userId,
    },
  });
  return created(row);
}

export async function updateMyReimbursement(req: Request, id: string) {
  const ctx = await selfContext("reimbursements.update");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const claim = await prisma.reimbursement.findFirst({ where: { id, companyId: ctx.companyId, employeeId: ctx.employeeId } });
  if (!claim) throw notFound("Reimbursement not found.");
  if (claim.status !== "SUBMITTED") throw badRequest("Only submitted claims can be edited.");
  const { type, description, expenseDate, amount, billReference } = body as Record<string, unknown>;
  const row = await prisma.reimbursement.update({
    where: { id },
    data: {
      ...(type ? { type: type as ReimbursementType } : {}),
      ...(description !== undefined ? { description: String(description) } : {}),
      ...(expenseDate ? { expenseDate: new Date(String(expenseDate)) } : {}),
      ...(amount !== undefined ? { amount: new Prisma.Decimal(Number(amount)) } : {}),
      ...(billReference !== undefined ? { billReference: billReference ? String(billReference) : null } : {}),
    },
  });
  return ok(row);
}

export async function cancelMyReimbursement(req: Request, id: string) {
  const ctx = await selfContext("reimbursements.update");
  const claim = await prisma.reimbursement.findFirst({ where: { id, companyId: ctx.companyId, employeeId: ctx.employeeId } });
  if (!claim) throw notFound("Reimbursement not found.");
  if (claim.status !== "SUBMITTED") throw badRequest("Only submitted claims can be withdrawn.");
  const row = await prisma.reimbursement.update({ where: { id }, data: { status: "CANCELLED" as ReimbursementStatus } });
  return ok(row);
}

export async function listMyLoans(req: Request) {
  const ctx = await selfContext("loans.read");
  const loans = await prisma.loan.findMany({
    where: { companyId: ctx.companyId, employeeId: ctx.employeeId },
    include: {
      emis: { orderBy: [{ year: "asc" }, { month: "asc" }] },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return ok(loans);
}

export async function listMyBonuses(req: Request) {
  const ctx = await selfContext("bonusPlans.read");
  const rows = await prisma.bonusAllocation.findMany({
    where: { companyId: ctx.companyId, employeeId: ctx.employeeId },
    include: { plan: { select: { id: true, title: true, type: true, month: true, year: true, status: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return ok(rows);
}

export async function listMyGratuity(req: Request) {
  void req;
  const ctx = await selfContext("gratuities.read");
  const rows = await prisma.gratuityRecord.findMany({
    where: { companyId: ctx.companyId, employeeId: ctx.employeeId },
    orderBy: { computedAt: "desc" },
    take: 50,
  });
  return ok(rows);
}