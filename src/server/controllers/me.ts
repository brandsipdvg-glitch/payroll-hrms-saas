import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireCompanyId, requirePermission } from "@/lib/authz";
import { ok, created } from "@/lib/api";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { saveAttendanceRecord } from "@/server/services/attendance";
import { applyLeave, cancelByEmployee, getBalance } from "@/server/services/leave";
import type { Prisma } from "@prisma/client";

async function selfContext(permission: string) {
  const session = await auth();
  if (!session?.user) throw forbidden("Please sign in.");
  if (!session.user.employeeId) throw forbidden("Your account is not linked to an employee profile.");
  await requirePermission(permission);
  const companyId = requireCompanyId(session.user.companyId);
  return { userId: session.user.id, companyId, employeeId: session.user.employeeId };
}

export async function listMyAttendance(req: Request) {
  const ctx = await selfContext("attendance.read");
  const url = new URL(req.url);
  const sp = url.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const year = sp.get("year") ? parseInt(sp.get("year")!, 10) : new Date().getFullYear();

  const rows = await prisma.attendance.findMany({
    where: {
      companyId: ctx.companyId,
      employeeId: ctx.employeeId,
      ...(from ? { date: { gte: new Date(from) } } : {}),
      ...(to ? { date: { lte: new Date(to) } } : {}),
    },
    include: { shift: { select: { id: true, name: true } } },
    orderBy: { date: "desc" },
    take: 500,
  });

  const yearWhere = { companyId: ctx.companyId, employeeId: ctx.employeeId, date: { gte: new Date(`${year}-01-01`), lte: new Date(`${year}-12-31`) } };
  const summary = {
    present: await prisma.attendance.count({ where: { ...yearWhere, status: "PRESENT" } }),
    absent: await prisma.attendance.count({ where: { ...yearWhere, status: "ABSENT" } }),
    halfDay: await prisma.attendance.count({ where: { ...yearWhere, status: "HALF_DAY" } }),
    onLeave: await prisma.attendance.count({ where: { ...yearWhere, status: "ON_LEAVE" } }),
    weekOff: await prisma.attendance.count({ where: { ...yearWhere, status: "WEEK_OFF" } }),
    holiday: await prisma.attendance.count({ where: { ...yearWhere, status: "HOLIDAY" } }),
    overtimeMinutes: (await prisma.attendance.aggregate({ where: yearWhere, _sum: { overtimeMinutes: true } }))._sum.overtimeMinutes ?? 0,
  };

  return ok({ rows, summary, year });
}

export async function selfPunch(req: Request) {
  const ctx = await selfContext("attendance.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { date, inTime, outTime, breakMinutes, shiftId, remarks } = body as Record<string, unknown>;
  if (!date) throw badRequest("date is required.");

  const { attendance, created: isNew } = await saveAttendanceRecord({
    companyId: ctx.companyId,
    employeeId: ctx.employeeId,
    date: new Date(String(date)),
    inTime: inTime ? new Date(String(inTime)) : undefined,
    outTime: outTime ? new Date(String(outTime)) : undefined,
    breakMinutes: breakMinutes ? Number(breakMinutes) : 0,
    shiftId: shiftId ? String(shiftId) : undefined,
    source: "MANUAL",
    remarks: remarks ? String(remarks) : undefined,
    userId: ctx.userId,
  });
  return created(attendance);
}

export async function listMyLeave(req: Request) {
  const ctx = await selfContext("leaveRequests.read");
  const rows = await prisma.leaveRequest.findMany({
    where: { companyId: ctx.companyId, employeeId: ctx.employeeId },
    include: { leaveType: { select: { id: true, name: true, code: true, color: true } } },
    orderBy: { createdAt: "desc" },
  });
  return ok(rows);
}

export async function applyMyLeave(req: Request) {
  const ctx = await selfContext("leaveRequests.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const request = await applyLeave({
    companyId: ctx.companyId,
    employeeId: ctx.employeeId,
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

export async function cancelMyLeave(req: Request, id: string) {
  const ctx = await selfContext("leaveRequests.update");
  return ok(await cancelByEmployee(ctx, id));
}

export async function myBalances(req: Request) {
  const ctx = await selfContext("leaveBalances.read");
  const url = new URL(req.url);
  const sp = url.searchParams;
  const year = sp.get("year") ? parseInt(sp.get("year")!, 10) : new Date().getFullYear();
  const rows = await getBalance(ctx.companyId, ctx.employeeId, year);
  return ok(rows);
}

export async function listMyAssets(_req: Request) {
  const ctx = await selfContext("assetAssignments.read");
  const rows = await prisma.assetAssignment.findMany({
    where: { companyId: ctx.companyId, employeeId: ctx.employeeId, status: "ACTIVE" },
    include: {
      asset: {
        select: { id: true, category: true, assetTag: true, name: true, model: true, serialNumber: true, status: true },
      },
    },
    orderBy: { assignedAt: "desc" },
  });
  return ok(rows);
}