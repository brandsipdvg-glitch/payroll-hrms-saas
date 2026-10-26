import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireCompanyId } from "@/lib/authz";
import { ok, created } from "@/lib/api";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { saveAttendanceRecord } from "@/server/services/attendance";
import { applyLeave, updateRequestStatus, getBalance } from "@/server/services/leave";
import { Prisma } from "@prisma/client";

interface MobileCtx {
  userId: string;
  companyId: string;
  employeeId: string;
}

async function employeeCtx(permission: string): Promise<MobileCtx> {
  const session = await auth();
  if (!session?.user) throw forbidden("Please sign in.");
  const companyId = requireCompanyId(session.user.companyId);
  const employeeId = session.user.employeeId;
  if (!employeeId) throw forbidden("Account is not linked to an employee profile.");
  await requirePermission(permission);
  return { userId: session.user.id, companyId, employeeId };
}

async function managerCtx(permission: string): Promise<MobileCtx> {
  const session = await auth();
  if (!session?.user) throw forbidden("Please sign in.");
  const companyId = requireCompanyId(session.user.companyId);
  const employeeId = session.user.employeeId;
  if (!employeeId) throw forbidden("Account is not linked to an employee profile.");
  await requirePermission(permission);
  return { userId: session.user.id, companyId, employeeId };
}

/** Team = employees whose reporting manager is the caller. */
async function teamEmployeeIds(ctx: MobileCtx): Promise<string[]> {
  const members = await prisma.employee.findMany({
    where: { companyId: ctx.companyId, reportingManagerId: ctx.employeeId },
    select: { id: true },
  });
  return members.map((m) => m.id);
}

const employeeSummary = { id: true, firstName: true, lastName: true, employeeCode: true } as const;

// ---------------------------------------------------------------------------
// Employee: profile
// ---------------------------------------------------------------------------

export async function mobileMe() {
  const ctx = await employeeCtx("employees.read");
  const employee = await prisma.employee.findFirst({
    where: { companyId: ctx.companyId, id: ctx.employeeId },
    include: {
      department: { select: { name: true } },
      designation: { select: { title: true } },
      grade: { select: { name: true } },
      branch: { select: { name: true } },
      bankDetails: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!employee) throw notFound("Employee profile not found.");
  return ok(employee);
}

// ---------------------------------------------------------------------------
// Employee: attendance
// ---------------------------------------------------------------------------

export async function mobileAttendance(req: Request) {
  const ctx = await employeeCtx("attendance.read");
  const sp = new URL(req.url).searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const rows = await prisma.attendance.findMany({
    where: {
      companyId: ctx.companyId,
      employeeId: ctx.employeeId,
      ...(from ? { date: { gte: new Date(from) } } : {}),
      ...(to ? { date: { lte: new Date(to) } } : {}),
    },
    orderBy: { date: "desc" },
    take: 60,
  });
  const month = new Date();
  const summary = {
    present: await prisma.attendance.count({
      where: { companyId: ctx.companyId, employeeId: ctx.employeeId, status: "PRESENT", date: { gte: new Date(month.getFullYear(), month.getMonth(), 1) } },
    }),
    absent: await prisma.attendance.count({
      where: { companyId: ctx.companyId, employeeId: ctx.employeeId, status: "ABSENT", date: { gte: new Date(month.getFullYear(), month.getMonth(), 1) } },
    }),
  };
  return ok({ rows, summary });
}

export async function mobilePunch(req: Request) {
  const ctx = await employeeCtx("attendance.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { date, inTime, outTime, breakMinutes, remarks } = body as Record<string, unknown>;
  if (!date) throw badRequest("date is required.");
  const { attendance, created: isNew } = await saveAttendanceRecord({
    companyId: ctx.companyId,
    employeeId: ctx.employeeId,
    date: new Date(String(date)),
    inTime: inTime ? new Date(String(inTime)) : undefined,
    outTime: outTime ? new Date(String(outTime)) : undefined,
    breakMinutes: breakMinutes ? Number(breakMinutes) : 0,
    source: "MOBILE",
    remarks: remarks ? String(remarks) : undefined,
    userId: ctx.userId,
  });
  return created({ attendance, isNew });
}

// ---------------------------------------------------------------------------
// Employee: leave
// ---------------------------------------------------------------------------

export async function mobileLeaveList(req: Request) {
  const ctx = await employeeCtx("leaveRequests.read");
  const rows = await prisma.leaveRequest.findMany({
    where: { companyId: ctx.companyId, employeeId: ctx.employeeId },
    include: { leaveType: { select: { name: true, color: true } } },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  return ok(rows);
}

export async function mobileLeaveApply(req: Request) {
  const ctx = await employeeCtx("leaveRequests.create");
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

export async function mobileLeaveBalances() {
  const ctx = await employeeCtx("leaveBalances.read");
  const year = new Date().getFullYear();
  const balances = await getBalance(ctx.companyId, ctx.employeeId, year);
  return ok(balances);
}

// ---------------------------------------------------------------------------
// Employee: payslips
// ---------------------------------------------------------------------------

export async function mobilePayslips(req: Request) {
  const ctx = await employeeCtx("payslips.read");
  const sp = new URL(req.url).searchParams;
  const year = sp.get("year") ? Number(sp.get("year")) : new Date().getFullYear();
  const rows = await prisma.payslip.findMany({
    where: { companyId: ctx.companyId, employeeId: ctx.employeeId, run: { year } },
    orderBy: { run: { month: "desc" } },
    take: 12,
  });
  // latest available months for the picker
  return ok(rows);
}

export async function mobilePayslipDetail(req: Request, id: string) {
  const ctx = await employeeCtx("payslips.read");
  const payslip = await prisma.payslip.findFirst({
    where: { id, companyId: ctx.companyId, employeeId: ctx.employeeId },
    include: {
      components: {
        include: { payComponent: { select: { code: true, componentType: true } } },
        orderBy: [{ componentType: "asc" }, { sortOrder: "asc" }],
      },
    },
  });
  if (!payslip) throw notFound("Payslip not found.");
  return ok(payslip);
}

// ---------------------------------------------------------------------------
// Employee: claims
// ---------------------------------------------------------------------------

export async function mobileClaims(req: Request) {
  const ctx = await employeeCtx("reimbursements.read");
  const rows = await prisma.reimbursement.findMany({
    where: { companyId: ctx.companyId, employeeId: ctx.employeeId },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  return ok(rows);
}

export async function mobileClaimCreate(req: Request) {
  const ctx = await employeeCtx("reimbursements.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { type, description, expenseDate, amount, billReference, receiptUrls } = body as Record<string, unknown>;
  if (!type || !description || !amount || !expenseDate) throw badRequest("type, description, amount and expenseDate are required.");
  const row = await prisma.reimbursement.create({
    data: {
      companyId: ctx.companyId,
      employeeId: ctx.employeeId,
      type: type as never,
      description: String(description),
      expenseDate: new Date(String(expenseDate)),
      amount: new Prisma.Decimal(Number(amount)),
      billReference: billReference ? String(billReference) : null,
      receiptUrls: Array.isArray(receiptUrls) ? (receiptUrls as string[]) : undefined,
      createdBy: ctx.userId,
      appliedBy: ctx.userId,
    },
  });
  await logAudit({ action: "CREATE", module: "reimbursements", entityType: "Reimbursement", entityId: row.id, companyId: ctx.companyId, userId: ctx.userId });
  return created(row);
}

// ---------------------------------------------------------------------------
// Manager: approvals
// ---------------------------------------------------------------------------

export async function managerApprovals() {
  const ctx = await managerCtx("teamApprovals.manage");
  const teamIds = await teamEmployeeIds(ctx);
  const [leavePending, claimsPending] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { companyId: ctx.companyId, employeeId: { in: teamIds }, status: "PENDING" },
      include: {
        employee: { select: employeeSummary },
        leaveType: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.reimbursement.findMany({
      where: { companyId: ctx.companyId, employeeId: { in: teamIds }, status: "SUBMITTED" },
      include: { employee: { select: employeeSummary } },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
  ]);
  return ok({ teamSize: teamIds.length, leavePending, claimsPending });
}

export async function managerApproveLeave(req: Request, id: string, approve: boolean) {
  const ctx = await managerCtx("teamApprovals.manage");
  const teamIds = await teamEmployeeIds(ctx);
  const request = await prisma.leaveRequest.findFirst({
    where: { id, companyId: ctx.companyId, employeeId: { in: teamIds }, status: "PENDING" },
  });
  if (!request) throw notFound("Pending leave request not found in your team.");
  const body = await req.json().catch(() => ({}));
  const updated = await updateRequestStatus(
    { companyId: ctx.companyId, userId: ctx.userId },
    id,
    approve ? "APPROVED" : "REJECTED",
    body?.remarks ? String(body.remarks) : approve ? "Approved via mobile" : "Rejected via mobile"
  );
  await logAudit({
    action: approve ? "APPROVE" : "REJECT",
    module: "teamApprovals",
    entityType: "LeaveRequest",
    entityId: id,
    companyId: ctx.companyId,
    userId: ctx.userId,
  });
  return ok(updated);
}

export async function managerApproveClaim(req: Request, id: string, approve: boolean) {
  const ctx = await managerCtx("teamApprovals.manage");
  const teamIds = await teamEmployeeIds(ctx);
  const claim = await prisma.reimbursement.findFirst({
    where: { id, companyId: ctx.companyId, employeeId: { in: teamIds }, status: "SUBMITTED" },
  });
  if (!claim) throw notFound("Pending claim not found in your team.");
  const body = await req.json().catch(() => ({}));
  const row = await prisma.reimbursement.update({
    where: { id },
    data: approve
      ? { status: "APPROVED", approvedBy: ctx.userId, approvedAt: new Date() }
      : { status: "REJECTED", rejectionReason: body?.remarks ? String(body.remarks) : "Rejected via mobile" },
  });
  await logAudit({
    action: approve ? "APPROVE" : "REJECT",
    module: "teamApprovals",
    entityType: "Reimbursement",
    entityId: id,
    companyId: ctx.companyId,
    userId: ctx.userId,
  });
  return ok(row);
}

// ---------------------------------------------------------------------------
// Manager: team dashboard
// ---------------------------------------------------------------------------

export async function managerTeamDashboard() {
  const ctx = await managerCtx("teamApprovals.read");
  const teamIds = await teamEmployeeIds(ctx);
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86400000);

  const [members, todayAttendance, pendingLeave, pendingClaims, monthlyWorking] = await Promise.all([
    prisma.employee.findMany({
      where: { companyId: ctx.companyId, id: { in: teamIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        employmentStatus: true,
        department: { select: { name: true } },
      },
      orderBy: { employeeCode: "asc" },
    }),
    prisma.attendance.groupBy({
      where: { companyId: ctx.companyId, employeeId: { in: teamIds }, date: { gte: dayStart, lt: dayEnd } },
      by: ["status"],
      _count: true,
    }),
    prisma.leaveRequest.count({ where: { companyId: ctx.companyId, employeeId: { in: teamIds }, status: "PENDING" } }),
    prisma.reimbursement.count({ where: { companyId: ctx.companyId, employeeId: { in: teamIds }, status: "SUBMITTED" } }),
    prisma.attendance.aggregate({
      where: { companyId: ctx.companyId, employeeId: { in: teamIds }, date: { gte: new Date(today.getFullYear(), today.getMonth(), 1) } },
      _sum: { overtimeMinutes: true },
      _count: true,
    }),
  ]);

  const countBy = (s: string) => todayAttendance.find((r) => r.status === s)?._count ?? 0;
  const present = countBy("PRESENT");
  const onLeave = countBy("ON_LEAVE");
  const absent = countBy("ABSENT");

  return ok({
    teamSize: members.length,
    today: {
      present,
      onLeave,
      absent,
      unmarked: Math.max(0, members.length - present - onLeave - absent),
    },
    pending: { leave: pendingLeave, claims: pendingClaims },
    month: {
      records: monthlyWorking._count,
      overtimeHours: Math.round(((monthlyWorking._sum.overtimeMinutes ?? 0) / 60) * 100) / 100,
    },
    members,
  });
}
