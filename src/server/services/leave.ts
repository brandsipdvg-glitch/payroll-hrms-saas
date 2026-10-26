import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { badRequest, conflict, notFound } from "@/lib/errors";
import type { ApprovalStatus, LeaveRequestStatus, Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Balance helpers
// ---------------------------------------------------------------------------

function daysBetween(a: Date, b: Date): number {
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((B.getTime() - A.getTime()) / 86400000) + 1;
}

function round1(v: Decimal | number | string): number {
  return Number(new Decimal(v).mul(10).round().div(10));
}

export async function getBalance(companyId: string, employeeId: string, year: number) {
  return prisma.leaveBalance.findMany({
    where: { companyId, employeeId, year },
    include: {
      leaveType: {
        select: { id: true, name: true, code: true, color: true, isPaid: true, isEncashable: true, carryForwardAllowed: true },
      },
    },
    orderBy: { leaveType: { name: "asc" } },
  });
}

export async function ensureBalance(companyId: string, employeeId: string, leaveTypeId: string, year: number) {
  const existing = await prisma.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
  });
  if (existing) return existing;
  return prisma.leaveBalance.create({
    data: { companyId, employeeId, leaveTypeId, year },
  });
}

export async function adjustBalance(delta: {
  companyId: string;
  employeeId: string;
  leaveTypeId: string;
  year: number;
  availedDelta?: number;
  creditedDelta?: number;
  lapsedDelta?: number;
  encashedDelta?: number;
}) {
  const bal = await ensureBalance(delta.companyId, delta.employeeId, delta.leaveTypeId, delta.year);
  const credit = delta.creditedDelta ?? 0;
  const availed = delta.availedDelta ?? 0;
  const lapsed = delta.lapsedDelta ?? 0;
  const encashed = delta.encashedDelta ?? 0;
  const closing = round1(
    new Decimal(bal.openingBalance).add(bal.credited).add(credit)
      .sub(bal.availed).sub(availed)
      .sub(bal.lapsed).sub(lapsed)
      .sub(bal.encashed).sub(encashed)
  );
  return prisma.leaveBalance.update({
    where: { id: bal.id },
    data: {
      credited: { increment: credit },
      availed: { increment: availed },
      lapsed: { increment: lapsed },
      encashed: { increment: encashed },
      closingBalance: closing,
    },
  });
}

// ---------------------------------------------------------------------------
// Apply leave
// ---------------------------------------------------------------------------

export async function applyLeave(ctx: {
  companyId: string;
  employeeId: string;
  userId: string;
  leaveTypeId: string;
  startDate: Date | string;
  endDate: Date | string;
  isHalfDay?: boolean;
  halfDayType?: string | null;
  reason?: string | null;
}) {
  const company = await prisma.company.findUnique({ where: { id: ctx.companyId } });
  if (!company) throw badRequest("Company not found.");

  const leaveType = await prisma.leaveType.findUnique({ where: { id: ctx.leaveTypeId } });
  if (!leaveType || leaveType.companyId !== ctx.companyId) throw notFound("Leave type not found.");
  if (leaveType.code === "LOSS_OF_PAY") throw badRequest("Loss of pay cannot be applied directly.");

  const year = new Date(ctx.startDate).getFullYear();
  const balance = await ensureBalance(ctx.companyId, ctx.employeeId, ctx.leaveTypeId, year);

  const start = new Date(ctx.startDate);
  const end = new Date(ctx.endDate);
  if (end < start) throw badRequest("End date must be on or after start date.");

  let days = daysBetween(start, end);
  if (ctx.isHalfDay) {
    if (days > 1) throw badRequest("Half-day leave can only span one day.");
    days = 0.5;
  }

  // Check policy restrictions
  const policy = await prisma.leavePolicy.findUnique({ where: { companyId_leaveTypeId: { companyId: ctx.companyId, leaveTypeId: ctx.leaveTypeId } } });
  if (policy) {
    const allowHalfDay = policy.allowHalfDay;
    if (ctx.isHalfDay && !allowHalfDay) throw badRequest("Half-day leave is not allowed for this leave type.");
    const maxConsec = policy.maxConsecutiveDays;
    if (maxConsec && days > maxConsec) throw badRequest(`Maximum ${maxConsec} consecutive days allowed per request.`);
    const minNotice = policy.minNoticeDays;
    if (minNotice > 0) {
      const diff = Math.round((start.getTime() - Date.now()) / 86400000);
      if (diff < minNotice) throw badRequest(`At least ${minNotice} days advance notice required.`);
    }
  }

  if (round1(days) <= 0) throw badRequest("Days requested must be positive.");

  const avail = round1(new Decimal(balance.closingBalance));
  // Block insufficient balance for paid leaves (LOP cannot be applied here).
  if (leaveType.isPaid && new Decimal(avail).lt(days)) {
    throw badRequest(`Insufficient leave balance. Available: ${round1(avail)}, requested: ${round1(days)}.`);
  }

  const request = await prisma.leaveRequest.create({
    data: {
      companyId: ctx.companyId,
      employeeId: ctx.employeeId,
      leaveTypeId: ctx.leaveTypeId,
      startDate: start,
      endDate: end,
      isHalfDay: ctx.isHalfDay ?? false,
      halfDayType: ctx.halfDayType ?? null,
      daysRequested: days,
      reason: ctx.reason ?? null,
      appliedBy: ctx.userId,
    },
  });

  await logAudit({
    action: "CREATE",
    module: "leaveRequests",
    entityType: "Leave Request",
    entityId: request.id,
    companyId: ctx.companyId,
    userId: ctx.userId,
    afterState: request as unknown as Prisma.InputJsonValue,
  });

  return request;
}

// ---------------------------------------------------------------------------
// Approve / Reject / Cancel
// ---------------------------------------------------------------------------

export async function updateRequestStatus(
  ctx: { companyId: string; userId: string },
  requestId: string,
  status: LeaveRequestStatus,
  remarks?: string | null
) {
  const existing = await prisma.leaveRequest.findUnique({ where: { id: requestId } });
  if (!existing || existing.companyId !== ctx.companyId) throw notFound("Leave request not found.");

  const isDecision = status === "APPROVED" || status === "REJECTED";
  if (existing.status === "CANCELLED") throw badRequest("Request already cancelled.");
  if (status === "CANCELLED" && existing.status === "REJECTED") throw badRequest("Cannot cancel a rejected request.");
  if (isDecision && existing.status !== "PENDING") throw badRequest(`Cannot change status of a ${existing.status.toLowerCase()} request.`);

  const year = existing.startDate.getFullYear();
  const updates: Prisma.LeaveRequestUncheckedUpdateInput = { status: status as LeaveRequestStatus };

  if (status === "APPROVED") {
    updates.approvedBy = ctx.userId;
    updates.approvedAt = new Date();
    await adjustBalance({
      companyId: ctx.companyId,
      employeeId: existing.employeeId,
      leaveTypeId: existing.leaveTypeId,
      year,
      availedDelta: Number(existing.daysRequested),
    });
  } else if (status === "REJECTED") {
    updates.approvedBy = ctx.userId;
    updates.approvedAt = new Date();
    updates.remarks = remarks ?? "Rejected";
  } else if (status === "CANCELLED") {
    // Restore balance if the request was previously approved
    if (existing.status === "APPROVED") {
      await adjustBalance({
        companyId: ctx.companyId,
        employeeId: existing.employeeId,
        leaveTypeId: existing.leaveTypeId,
        year,
        availedDelta: -Number(existing.daysRequested),
      });
    }
    updates.cancelledBy = ctx.userId;
    updates.cancelledAt = new Date();
  }

  const updated = await prisma.leaveRequest.update({ where: { id: requestId }, data: updates });
  await logAudit({
    action: status === "APPROVED" ? "APPROVE" : status === "REJECTED" ? "REJECT" : "UPDATE",
    module: "leaveRequests",
    entityType: "Leave Request",
    entityId: requestId,
    companyId: ctx.companyId,
    userId: ctx.userId,
    afterState: updated as unknown as Prisma.InputJsonValue,
  });

  return updated;
}

export async function cancelByEmployee(ctx: { companyId: string; employeeId: string; userId: string }, requestId: string) {
  const existing = await prisma.leaveRequest.findUnique({ where: { id: requestId } });
  if (!existing || existing.companyId !== ctx.companyId || existing.employeeId !== ctx.employeeId) throw notFound("Leave request not found.");
  if (existing.status === "CANCELLED") throw badRequest("Request already cancelled.");
  if (existing.status === "REJECTED") throw badRequest("Cannot cancel a rejected request.");

  return updateRequestStatus(ctx, requestId, "CANCELLED", "Cancelled by employee");
}

// ---------------------------------------------------------------------------
// Annual credit run
// ---------------------------------------------------------------------------

export async function creditAnnualLeaves(companyId: string, year?: number) {
  const currentYear = year ?? new Date().getFullYear();
  const types = await prisma.leaveType.findMany({ where: { companyId, accrualBasis: "ANNUAL", isActive: true, isPaid: true } });
  const employees = await prisma.employee.findMany({ where: { companyId }, select: { id: true, doj: true } });
  let credited = 0;
  for (const emp of employees) {
    for (const lt of types) {
      // Pro-rate for joiners mid-year
      const doj = new Date(emp.doj);
      const monthsThisYear = doj.getFullYear() === currentYear ? 12 - doj.getMonth() : 12;
      const amount = Math.round((lt.accrualValue * monthsThisYear / 12) * 10) / 10;
      if (amount <= 0) continue;
      await adjustBalance({
        companyId,
        employeeId: emp.id,
        leaveTypeId: lt.id,
        year: currentYear,
        creditedDelta: amount,
      });
      credited += amount;
    }
  }
  return credited;
}

// ---------------------------------------------------------------------------
// Carry-forward & lapse (year-end processing)
// ---------------------------------------------------------------------------

export async function processYearEnd(companyId: string, fromYear: number) {
  const toYear = fromYear + 1;
  const balances = await prisma.leaveBalance.findMany({ where: { companyId, year: fromYear } });
  let carried = 0;
  let lapsed = 0;
  for (const bal of balances) {
    const lt = await prisma.leaveType.findUnique({ where: { id: bal.leaveTypeId } });
    if (!lt) continue;
    const remaining = new Decimal(bal.openingBalance).add(bal.credited).sub(bal.availed).sub(bal.lapsed).sub(bal.encashed);
    if (remaining.lte(0)) continue;
    const carryMax = lt.maxCarryForward ?? 0;
    const carryAmt = lt.carryForwardAllowed ? Math.min(round1(remaining), carryMax) : 0;
    const lapseAmt = round1(new Decimal(remaining).sub(carryAmt));

    if (carryAmt > 0) {
      await adjustBalance({
        companyId,
        employeeId: bal.employeeId,
        leaveTypeId: bal.leaveTypeId,
        year: toYear,
        creditedDelta: carryAmt,
      });
      await prisma.leaveCarryForward.create({
        data: { companyId, employeeId: bal.employeeId, leaveTypeId: bal.leaveTypeId, fromYear, toYear, carriedAmount: carryAmt, lapsedAmount: lapseAmt },
      });
    }
    if (lapseAmt > 0) {
      await adjustBalance({
        companyId,
        employeeId: bal.employeeId,
        leaveTypeId: bal.leaveTypeId,
        year: fromYear,
        lapsedDelta: lapseAmt,
      });
    }
    carried += carryAmt;
    lapsed += lapseAmt;
  }
  return { carried, lapsed };
}

// ---------------------------------------------------------------------------
// Encashment
// ---------------------------------------------------------------------------

export async function requestEncashment(ctx: {
  companyId: string;
  employeeId: string;
  userId: string;
  leaveTypeId: string;
  days: number;
  ratePerDay: number;
}) {
  const lt = await prisma.leaveType.findUnique({ where: { id: ctx.leaveTypeId } });
  if (!lt || lt.companyId !== ctx.companyId) throw notFound("Leave type not found.");
  if (!lt.isEncashable) throw badRequest("This leave type is not encashable.");

  const year = new Date().getFullYear();
  const bal = await ensureBalance(ctx.companyId, ctx.employeeId, lt.id, year);
  const available = new Decimal(bal.closingBalance).sub(bal.availed);
  if (available.lt(ctx.days)) throw badRequest(`Insufficient balance for encashment. Available: ${round1(available)}.`);

  const maxEnc = lt.maxEncashable;
  if (maxEnc && ctx.days > maxEnc) throw badRequest(`Maximum ${maxEnc} days encashable per year.`);

  const enc = await prisma.leaveEncashment.create({
    data: {
      companyId: ctx.companyId,
      employeeId: ctx.employeeId,
      leaveTypeId: lt.id,
      year,
      days: ctx.days,
      ratePerDay: ctx.ratePerDay,
      amount: new Decimal(ctx.ratePerDay).mul(ctx.days),
      status: "PENDING",
    },
  });

  await logAudit({
    action: "CREATE",
    module: "leaveEncashments",
    entityType: "Leave Encashment",
    entityId: enc.id,
    companyId: ctx.companyId,
    userId: ctx.userId,
    afterState: enc as unknown as Prisma.InputJsonValue,
  });

  return enc;
}

export async function approveEncashment(ctx: { companyId: string; userId: string }, encashmentId: string, approve: boolean) {
  const existing = await prisma.leaveEncashment.findUnique({ where: { id: encashmentId } });
  if (!existing || existing.companyId !== ctx.companyId) throw notFound("Encashment not found.");
  if (existing.status !== "PENDING") throw badRequest(`Cannot ${approve ? "approve" : "reject"} a ${existing.status.toLowerCase()} encashment.`);

  const year = existing.year;
  const status: ApprovalStatus = approve ? "APPROVED" : "REJECTED";

  if (approve) {
    await adjustBalance({
      companyId: ctx.companyId,
      employeeId: existing.employeeId,
      leaveTypeId: existing.leaveTypeId,
      year,
      encashedDelta: existing.days,
    });
  }

  const updated = await prisma.leaveEncashment.update({
    where: { id: encashmentId },
    data: { status, approvedBy: ctx.userId, approvedAt: new Date() },
  });

  await logAudit({
    action: approve ? "APPROVE" : "REJECT",
    module: "leaveEncashments",
    entityType: "Leave Encashment",
    entityId: encashmentId,
    companyId: ctx.companyId,
    userId: ctx.userId,
    afterState: updated as unknown as Prisma.InputJsonValue,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function leaveReport(companyId: string, from: Date, to: Date, employeeId?: string) {
  const where: Prisma.LeaveRequestWhereInput = {
    companyId,
    startDate: { lte: to },
    endDate: { gte: from },
    ...(employeeId ? { employeeId } : {}),
  };
  const [total, approved, pending, rejected] = await Promise.all([
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.count({ where: { ...where, status: "APPROVED" } }),
    prisma.leaveRequest.count({ where: { ...where, status: "PENDING" } }),
    prisma.leaveRequest.count({ where: { ...where, status: "REJECTED" } }),
  ]);
  const byType = await prisma.leaveRequest.groupBy({
    by: ["leaveTypeId"],
    _sum: { daysRequested: true },
    _count: true,
    where: { ...where, status: "APPROVED" },
  });
  const types = await prisma.leaveType.findMany({ where: { companyId }, select: { id: true, name: true, code: true } });
  const typeMap = new Map(types.map((t) => [t.id, t]));
  return {
    summary: { total, approved, pending, rejected },
    byType: byType.map((g) => ({
      type: typeMap.get(g.leaveTypeId)?.name ?? "Unknown",
      days: round1(g._sum.daysRequested ?? 0),
      count: g._count,
    })),
  };
}