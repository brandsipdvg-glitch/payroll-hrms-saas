import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireCompanyId } from "@/lib/authz";
import { ok, created } from "@/lib/api";
import { badRequest, notFound } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import {
  applyLeave,
  updateRequestStatus,
  creditAnnualLeaves,
  processYearEnd,
  requestEncashment,
  approveEncashment,
  leaveReport,
} from "@/server/services/leave";
import type { LeaveRequestStatus, Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Leave types
// ---------------------------------------------------------------------------

const TYPE_FIELDS = [
  "name",
  "code",
  "description",
  "color",
  "isPaid",
  "isEncashable",
  "maxEncashable",
  "carryForwardAllowed",
  "maxCarryForward",
  "accrualBasis",
  "accrualValue",
  "isActive",
];

export async function listLeaveTypes(req: Request) {
  const ctx = await requirePermission("leaveTypes.read");
  const companyId = requireCompanyId(ctx.companyId);
  const rows = await prisma.leaveType.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
  return ok(rows);
}

export async function createLeaveType(req: Request) {
  const ctx = await requirePermission("leaveTypes.create");
  const companyId = requireCompanyId(ctx.companyId);
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const data: Record<string, unknown> = { companyId };
  for (const f of TYPE_FIELDS) if (body[f] !== undefined) data[f] = body[f];
  if (!data.name || !data.code) throw badRequest("name and code are required.");
  const row = await prisma.leaveType.create({ data: data as Prisma.LeaveTypeUncheckedCreateInput });
  await logAudit({ action: "CREATE", module: "leaveTypes", entityType: "Leave Type", entityId: row.id, entityName: row.name, companyId, userId: ctx.userId, afterState: row as unknown as Prisma.InputJsonValue });
  return created(row);
}

export async function updateLeaveType(req: Request, id: string) {
  const ctx = await requirePermission("leaveTypes.update");
  const companyId = requireCompanyId(ctx.companyId);
  const existing = await prisma.leaveType.findUnique({ where: { id } });
  if (!existing || existing.companyId !== companyId) throw notFound("Leave type not found.");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const data: Record<string, unknown> = {};
  for (const f of TYPE_FIELDS) if (body[f] !== undefined) data[f] = body[f];
  const row = await prisma.leaveType.update({ where: { id }, data });
  await logAudit({ action: "UPDATE", module: "leaveTypes", entityType: "Leave Type", entityId: row.id, entityName: row.name, companyId, userId: ctx.userId, beforeState: existing as unknown as Prisma.InputJsonValue, afterState: row as unknown as Prisma.InputJsonValue });
  return ok(row);
}

export async function deleteLeaveType(req: Request, id: string) {
  const ctx = await requirePermission("leaveTypes.delete");
  const companyId = requireCompanyId(ctx.companyId);
  const existing = await prisma.leaveType.findUnique({ where: { id } });
  if (!existing || existing.companyId !== companyId) throw notFound("Leave type not found.");
  await prisma.leaveType.delete({ where: { id } });
  await logAudit({ action: "DELETE", module: "leaveTypes", entityType: "Leave Type", entityId: id, entityName: existing.name, companyId, userId: ctx.userId });
  return ok({ id, deleted: true });
}

// ---------------------------------------------------------------------------
// Leave policies (per leave type)
// ---------------------------------------------------------------------------

const POLICY_FIELDS = ["leaveTypeId", "minNoticeDays", "maxConsecutiveDays", "allowHalfDay", "allowPastDates", "requiresAttachment", "restrictions"];

export async function listLeavePolicies(req: Request) {
  const ctx = await requirePermission("leavePolicies.read");
  const companyId = requireCompanyId(ctx.companyId);
  const rows = await prisma.leavePolicy.findMany({ where: { companyId }, include: { leaveType: { select: { name: true, code: true, color: true } } } });
  return ok(rows);
}

export async function upsertLeavePolicy(req: Request) {
  const ctx = await requirePermission("leavePolicies.create");
  const companyId = requireCompanyId(ctx.companyId);
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const leaveTypeId = String(body.leaveTypeId ?? "");
  const lt = await prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
  if (!lt || lt.companyId !== companyId) throw badRequest("Valid leaveTypeId is required.");

  const data: Record<string, unknown> = { companyId };
  for (const f of POLICY_FIELDS) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  delete data.leaveTypeId;
  const row = await prisma.leavePolicy.upsert({
    where: { companyId_leaveTypeId: { companyId, leaveTypeId } },
    update: data as Omit<typeof data, "companyId">,
    create: { companyId, leaveTypeId, ...(data as Omit<typeof data, "companyId">) } as Prisma.LeavePolicyUncheckedCreateInput,
  });
  await logAudit({ action: "CREATE", module: "leavePolicies", entityType: "Leave Policy", entityId: row.id, entityName: lt.name, companyId, userId: ctx.userId });
  return ok(row);
}

export async function deleteLeavePolicy(req: Request, id: string) {
  const ctx = await requirePermission("leavePolicies.delete");
  const companyId = requireCompanyId(ctx.companyId);
  const row = await prisma.leavePolicy.findUnique({ where: { id } });
  if (!row || row.companyId !== companyId) throw notFound("Leave policy not found.");
  await prisma.leavePolicy.delete({ where: { id } });
  await logAudit({ action: "DELETE", module: "leavePolicies", entityType: "Leave Policy", entityId: id, companyId, userId: ctx.userId });
  return ok({ id, deleted: true });
}

// ---------------------------------------------------------------------------
// Leave requests (admin / HR view)
// ---------------------------------------------------------------------------

const includeRequest = {
  employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, department: { select: { name: true } } } },
  leaveType: { select: { id: true, name: true, code: true, color: true } },
} satisfies Prisma.LeaveRequestInclude;

export async function listLeaveRequests(req: Request) {
  const ctx = await requirePermission("leaveRequests.read");
  const companyId = requireCompanyId(ctx.companyId);
  const url = new URL(req.url);
  const sp = url.searchParams;
  const page = Math.max(parseInt(sp.get("page") ?? "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(sp.get("pageSize") ?? "30", 10) || 30, 1), 500);
  const status = sp.get("status");
  const employeeId = sp.get("employeeId");
  const leaveTypeId = sp.get("leaveTypeId");
  const from = sp.get("from");
  const to = sp.get("to");

  const where: Prisma.LeaveRequestWhereInput = {
    companyId,
    ...(status ? { status: status as LeaveRequestStatus } : {}),
    ...(employeeId ? { employeeId } : {}),
    ...(leaveTypeId ? { leaveTypeId } : {}),
    ...(from ? { startDate: { lte: new Date(to ?? new Date()) } } : {}),
    ...(to ? { endDate: { gte: new Date(from ?? new Date("2000-01-01")) } } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.findMany({ where, include: includeRequest, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return ok(rows, { page, pageSize, total, pageCount: Math.ceil(total / pageSize) });
}

export async function applyLeaveAdmin(req: Request, employeeIdOverride?: string) {
  const ctx = await requirePermission("leaveRequests.create");
  const companyId = requireCompanyId(ctx.companyId);
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const employeeId = String(employeeIdOverride ?? body.employeeId ?? "");
  if (!employeeId) throw badRequest("employeeId is required.");
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!emp) throw notFound("Employee not found.");

  const request = await applyLeave({
    companyId,
    employeeId,
    userId: ctx.userId,
    leaveTypeId: String(body.leaveTypeId ?? ""),
    startDate: new Date(String(body.startDate ?? "")),
    endDate: new Date(String(body.endDate ?? "")),
    isHalfDay: Boolean(body.isHalfDay),
    halfDayType: body.halfDayType ? String(body.halfDayType) : null,
    reason: body.reason ? String(body.reason) : null,
  });
  return created(request);
}

export async function approveRequest(req: Request, id: string) {
  const ctx = await requirePermission("leaveRequests.manage");
  const companyId = requireCompanyId(ctx.companyId);
  const body = await req.json().catch(() => ({}));
  return ok(await updateRequestStatus({ companyId, userId: ctx.userId }, id, "APPROVED", body?.remarks ? String(body.remarks) : "Approved"));
}

export async function rejectRequest(req: Request, id: string) {
  const ctx = await requirePermission("leaveRequests.manage");
  const companyId = requireCompanyId(ctx.companyId);
  const body = await req.json().catch(() => ({}));
  return ok(await updateRequestStatus({ companyId, userId: ctx.userId }, id, "REJECTED", body?.remarks ? String(body.remarks) : "Rejected"));
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

export async function listBalances(req: Request) {
  const ctx = await requirePermission("leaveBalances.read");
  const companyId = requireCompanyId(ctx.companyId);
  const url = new URL(req.url);
  const sp = url.searchParams;
  const employeeId = sp.get("employeeId");
  const year = sp.get("year") ? parseInt(sp.get("year")!, 10) : new Date().getFullYear();
  const rows = await prisma.leaveBalance.findMany({
    where: { companyId, year, ...(employeeId ? { employeeId } : {}) },
    include: {
      employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      leaveType: { select: { name: true, code: true, color: true } },
    },
    orderBy: { employee: { employeeCode: "asc" } },
  });
  return ok(rows);
}

export async function adjustBalanceAdmin(req: Request, id: string) {
  const ctx = await requirePermission("leaveBalances.manage");
  const companyId = requireCompanyId(ctx.companyId);
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const bal = await prisma.leaveBalance.findUnique({ where: { id } });
  if (!bal || bal.companyId !== companyId) throw notFound("Leave balance not found.");
  const opening = body.openingBalance !== undefined ? Number(body.openingBalance) : bal.openingBalance;
  const credited = body.credited !== undefined ? Number(body.credited) : bal.credited;
  const availed = body.availed !== undefined ? Number(body.availed) : bal.availed;
  const lapsed = body.lapsed !== undefined ? Number(body.lapsed) : bal.lapsed;
  const encashed = body.encashed !== undefined ? Number(body.encashed) : bal.encashed;
  const closing = new Decimal(opening).add(credited).sub(availed).sub(lapsed).sub(encashed);
  const row = await prisma.leaveBalance.update({
    where: { id },
    data: { openingBalance: opening, credited, availed, lapsed, encashed, closingBalance: Number(closing) },
  });
  await logAudit({ action: "UPDATE", module: "leaveBalances", entityType: "Leave Balance", entityId: id, companyId, userId: ctx.userId, afterState: row as unknown as Prisma.InputJsonValue });
  return ok(row);
}

export async function runAnnualCredit(req: Request) {
  const ctx = await requirePermission("leaveBalances.manage");
  const companyId = requireCompanyId(ctx.companyId);
  const body = await req.json().catch(() => ({}));
  const year = body?.year ? parseInt(String(body.year), 10) : new Date().getFullYear();
  const credited = await creditAnnualLeaves(companyId, year);
  await logAudit({ action: "UPDATE", module: "leaveBalances", entityType: "Leave Balance", companyId, userId: ctx.userId, metadata: { creditRun: year, credited } as unknown as Prisma.InputJsonValue });
  return ok({ year, credited });
}

export async function runYearEnd(req: Request) {
  const ctx = await requirePermission("leaveBalances.manage");
  const companyId = requireCompanyId(ctx.companyId);
  const body = await req.json().catch(() => ({}));
  const fromYear = body?.fromYear ? parseInt(String(body.fromYear), 10) : new Date().getFullYear();
  const result = await processYearEnd(companyId, fromYear);
  await logAudit({ action: "UPDATE", module: "leaveBalances", entityType: "Leave Balance", companyId, userId: ctx.userId, metadata: result as unknown as Prisma.InputJsonValue });
  return ok({ fromYear, ...result });
}

// ---------------------------------------------------------------------------
// Encashment
// ---------------------------------------------------------------------------

export async function listEncashments(req: Request) {
  const ctx = await requirePermission("leaveEncashments.read");
  const companyId = requireCompanyId(ctx.companyId);
  const url = new URL(req.url);
  const sp = url.searchParams;
  const status = sp.get("status");
  const rows = await prisma.leaveEncashment.findMany({
    where: { companyId, ...(status ? { status: status as Prisma.LeaveEncashmentWhereInput["status"] } : {}) },
    include: {
      employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      leaveType: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return ok(rows);
}

export async function createEncashment(req: Request) {
  const ctx = await requirePermission("leaveEncashments.create");
  const companyId = requireCompanyId(ctx.companyId);
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const employeeId = String(body.employeeId ?? "");
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!emp) throw notFound("Employee not found.");
  const enc = await requestEncashment({
    companyId,
    employeeId,
    userId: ctx.userId,
    leaveTypeId: String(body.leaveTypeId ?? ""),
    days: Number(body.days ?? 0),
    ratePerDay: Number(body.ratePerDay ?? 0),
  });
  return created(enc);
}

export async function decideEncashment(req: Request, id: string) {
  const ctx = await requirePermission("leaveEncashments.manage");
  const companyId = requireCompanyId(ctx.companyId);
  const body = await req.json().catch(() => ({}));
  const approve = body?.approve === true;
  return ok(await approveEncashment({ companyId, userId: ctx.userId }, id, approve));
}

// ---------------------------------------------------------------------------
// Leave reports
// ---------------------------------------------------------------------------

export async function leaveReportHandler(req: Request) {
  const ctx = await requirePermission("leaveRequests.read");
  const companyId = requireCompanyId(ctx.companyId);
  const url = new URL(req.url);
  const sp = url.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if (!from || !to) throw badRequest("from and to dates are required.");
  const employeeId = sp.get("employeeId") ?? undefined;
  return ok(await leaveReport(companyId, new Date(from), new Date(to), employeeId));
}