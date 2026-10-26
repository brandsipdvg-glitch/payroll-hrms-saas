import { prisma } from "@/lib/prisma";
import { requirePermission, requireCompanyId } from "@/lib/authz";
import { ok, created } from "@/lib/api";
import { badRequest, notFound } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import {
  saveAttendanceRecord,
  getAttendance,
  importAttendance,
} from "@/server/services/attendance";
import type { AttendanceSource, AttendanceStatus, BiometricDeviceStatus, Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Attendance records
// ---------------------------------------------------------------------------

const includeAttendance = {
  employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, department: { select: { name: true } } } },
  shift: { select: { id: true, name: true, startTime: true, endTime: true } },
  policy: { select: { id: true, name: true } },
} satisfies Prisma.AttendanceInclude;

export async function listAttendance(req: Request) {
  const ctx = await requirePermission("attendance.read");
  const companyId = requireCompanyId(ctx.companyId);

  const url = new URL(req.url);
  const sp = url.searchParams;
  const page = Math.max(parseInt(sp.get("page") ?? "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(sp.get("pageSize") ?? "30", 10) || 30, 1), 500);
  const from = sp.get("from");
  const to = sp.get("to");
  const employeeId = sp.get("employeeId");
  const departmentId = sp.get("departmentId");
  const status = sp.get("status");

  const where: Prisma.AttendanceWhereInput = {
    companyId,
    ...(from ? { date: { gte: new Date(from as string) } } : {}),
    ...(to ? { date: { lte: new Date(to as string) } } : {}),
    ...(employeeId ? { employeeId } : {}),
    ...(departmentId ? { employee: { departmentId } } : {}),
    ...(status ? { status: status as AttendanceStatus } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.attendance.count({ where }),
    prisma.attendance.findMany({
      where,
      include: includeAttendance,
      orderBy: [{ date: "desc" }, { employee: { employeeCode: "asc" } }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok(rows, { page, pageSize, total, pageCount: Math.ceil(total / pageSize) });
}

export async function createAttendanceManual(req: Request) {
  const ctx = await requirePermission("attendance.create");
  const companyId = requireCompanyId(ctx.companyId);
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { employeeId, date, inTime, outTime, breakMinutes, shiftId, remarks } = body as Record<string, unknown>;
  if (!employeeId || !date) throw badRequest("employeeId and date are required.");

  const { attendance, created: isNew } = await saveAttendanceRecord({
    companyId,
    employeeId: String(employeeId),
    date: new Date(String(date)),
    inTime: inTime ? new Date(String(inTime)) : undefined,
    outTime: outTime ? new Date(String(outTime)) : undefined,
    breakMinutes: breakMinutes ? Number(breakMinutes) : 0,
    shiftId: shiftId ? String(shiftId) : undefined,
    source: "MANUAL",
    remarks: remarks ? String(remarks) : undefined,
    userId: ctx.userId,
  });

  await logAudit({
    action: isNew ? "CREATE" : "UPDATE",
    module: "attendance",
    entityType: "Attendance",
    entityId: attendance.id,
    companyId,
    userId: ctx.userId,
    afterState: attendance as unknown as Prisma.InputJsonValue,
  });

  return created(attendance);
}

export async function getAttendanceById(req: Request, id: string) {
  const ctx = await requirePermission("attendance.read");
  const companyId = requireCompanyId(ctx.companyId);
  return ok(await getAttendance(companyId, id));
}

export async function updateAttendance(req: Request, id: string) {
  const ctx = await requirePermission("attendance.update");
  const companyId = requireCompanyId(ctx.companyId);
  const existing = await getAttendance(companyId, id);
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { inTime, outTime, breakMinutes, shiftId, remarks, date } = body as Record<string, unknown>;

  const { attendance } = await saveAttendanceRecord({
    companyId,
    employeeId: existing.employee.id,
    date: date ? new Date(String(date)) : existing.date,
    inTime: inTime ? new Date(String(inTime)) : undefined,
    outTime: outTime ? new Date(String(outTime)) : undefined,
    breakMinutes: breakMinutes != null ? Number(breakMinutes) : existing.breakMinutes,
    shiftId: shiftId ? String(shiftId) : existing.shiftId,
    remarks: remarks != null ? String(remarks) : existing.remarks,
    source: "MANUAL",
    userId: ctx.userId,
  });

  await logAudit({
    action: "UPDATE",
    module: "attendance",
    entityType: "Attendance",
    entityId: attendance.id,
    companyId,
    userId: ctx.userId,
    beforeState: existing as unknown as Prisma.InputJsonValue,
    afterState: attendance as unknown as Prisma.InputJsonValue,
  });

  return ok(attendance);
}

export async function deleteAttendance(req: Request, id: string) {
  const ctx = await requirePermission("attendance.delete");
  const companyId = requireCompanyId(ctx.companyId);
  const existing = await getAttendance(companyId, id);
  await prisma.attendance.delete({ where: { id } });
  await logAudit({
    action: "DELETE",
    module: "attendance",
    entityType: "Attendance",
    entityId: id,
    companyId,
    userId: ctx.userId,
    beforeState: existing as unknown as Prisma.InputJsonValue,
  });
  return ok({ id, deleted: true });
}

// ---------------------------------------------------------------------------
// Attendance imports
// ---------------------------------------------------------------------------

const VALID_SOURCES: AttendanceSource[] = ["CSV_IMPORT", "EXCEL_IMPORT", "BIOMETRIC", "API", "MANUAL"];

export async function createImport(req: Request) {
  const ctx = await requirePermission("attendanceImports.create");
  const companyId = requireCompanyId(ctx.companyId);
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const source = body.source as AttendanceSource;
  if (!VALID_SOURCES.includes(source)) throw badRequest("Invalid import source.");
  const rows = body.rows as unknown[];
  if (!Array.isArray(rows)) throw badRequest("rows must be an array.");

  const result = await importAttendance(
    { companyId, userId: ctx.userId },
    {
      source,
      rows: rows as Parameters<typeof importAttendance>[1]["rows"],
      fileName: body.fileName ? String(body.fileName) : null,
    }
  );
  return ok(result);
}

export async function listImports(req: Request) {
  const ctx = await requirePermission("attendanceImports.read");
  const companyId = requireCompanyId(ctx.companyId);
  const url = new URL(req.url);
  const sp = url.searchParams;
  const page = Math.max(parseInt(sp.get("page") ?? "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(sp.get("pageSize") ?? "20", 10) || 20, 1), 100);
  const [total, rows] = await Promise.all([
    prisma.attendanceImport.count({ where: { companyId } }),
    prisma.attendanceImport.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return ok(rows, { page, pageSize, total, pageCount: Math.ceil(total / pageSize) });
}

// ---------------------------------------------------------------------------
// Attendance policies
// ---------------------------------------------------------------------------

const POLICY_FIELDS = [
  "name",
  "code",
  "description",
  "graceTimeMinutes",
  "maxLateMinutes",
  "lateAfterGraceMinutes",
  "minHoursForFullDay",
  "otEnabled",
  "otAfterMinutes",
  "otRoundToMinutes",
  "otMaxPerDayMinutes",
  "absentIfNoPunch",
  "absentAfterHalfDay",
  "isDefault",
  "isActive",
];

export async function listPolicies(req: Request) {
  const ctx = await requirePermission("attendancePolicies.read");
  const companyId = requireCompanyId(ctx.companyId);
  const rows = await prisma.attendancePolicy.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
  return ok(rows);
}

export async function createPolicy(req: Request) {
  const ctx = await requirePermission("attendancePolicies.create");
  const companyId = requireCompanyId(ctx.companyId);
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const data: Record<string, unknown> = { companyId };
  for (const f of POLICY_FIELDS) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  if (!data.name || !data.code) throw badRequest("name and code are required.");
  if (body.isDefault) await prisma.attendancePolicy.updateMany({ where: { companyId, isDefault: true }, data: { isDefault: false } });
  const row = await prisma.attendancePolicy.create({ data: data as Prisma.AttendancePolicyUncheckedCreateInput });
  await logAudit({ action: "CREATE", module: "attendancePolicies", entityType: "Attendance Policy", entityId: row.id, entityName: row.name, companyId, userId: ctx.userId, afterState: row as unknown as Prisma.InputJsonValue });
  return created(row);
}

export async function getPolicy(req: Request, id: string) {
  const ctx = await requirePermission("attendancePolicies.read");
  const companyId = requireCompanyId(ctx.companyId);
  const row = await prisma.attendancePolicy.findUnique({ where: { id } });
  if (!row || row.companyId !== companyId) throw notFound("Attendance policy not found.");
  return ok(row);
}

export async function updatePolicy(req: Request, id: string) {
  const ctx = await requirePermission("attendancePolicies.update");
  const companyId = requireCompanyId(ctx.companyId);
  const existing = await prisma.attendancePolicy.findUnique({ where: { id } });
  if (!existing || existing.companyId !== companyId) throw notFound("Attendance policy not found.");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const data: Record<string, unknown> = {};
  for (const f of POLICY_FIELDS) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  if (data.isDefault === true) await prisma.attendancePolicy.updateMany({ where: { companyId, isDefault: true, id: { not: id } }, data: { isDefault: false } });
  const row = await prisma.attendancePolicy.update({ where: { id }, data });
  await logAudit({ action: "UPDATE", module: "attendancePolicies", entityType: "Attendance Policy", entityId: row.id, entityName: row.name, companyId, userId: ctx.userId, beforeState: existing as unknown as Prisma.InputJsonValue, afterState: row as unknown as Prisma.InputJsonValue });
  return ok(row);
}

export async function deletePolicy(req: Request, id: string) {
  const ctx = await requirePermission("attendancePolicies.delete");
  const companyId = requireCompanyId(ctx.companyId);
  const existing = await prisma.attendancePolicy.findUnique({ where: { id } });
  if (!existing || existing.companyId !== companyId) throw notFound("Attendance policy not found.");
  await prisma.attendancePolicy.delete({ where: { id } });
  await logAudit({ action: "DELETE", module: "attendancePolicies", entityType: "Attendance Policy", entityId: id, entityName: existing.name, companyId, userId: ctx.userId });
  return ok({ id, deleted: true });
}

// ---------------------------------------------------------------------------
// Biometric devices
// ---------------------------------------------------------------------------

const DEVICE_FIELDS = ["name", "code", "deviceType", "model", "serialNumber", "ipAddress", "port", "location", "status", "apiEndpoint", "authToken", "isActive"];

export async function listDevices(req: Request) {
  const ctx = await requirePermission("biometricDevices.read");
  const companyId = requireCompanyId(ctx.companyId);
  const rows = await prisma.biometricDevice.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
  return ok(rows);
}

export async function createDevice(req: Request) {
  const ctx = await requirePermission("biometricDevices.create");
  const companyId = requireCompanyId(ctx.companyId);
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const data: Record<string, unknown> = { companyId };
  for (const f of DEVICE_FIELDS) if (body[f] !== undefined) data[f] = body[f];
  if (!data.name || !data.code) throw badRequest("name and code are required.");
  const row = await prisma.biometricDevice.create({ data: data as Prisma.BiometricDeviceUncheckedCreateInput });
  await logAudit({ action: "CREATE", module: "biometricDevices", entityType: "Biometric Device", entityId: row.id, entityName: row.name, companyId, userId: ctx.userId, afterState: row as unknown as Prisma.InputJsonValue });
  return created(row);
}

export async function updateDevice(req: Request, id: string) {
  const ctx = await requirePermission("biometricDevices.update");
  const companyId = requireCompanyId(ctx.companyId);
  const existing = await prisma.biometricDevice.findUnique({ where: { id } });
  if (!existing || existing.companyId !== companyId) throw notFound("Biometric device not found.");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const data: Record<string, unknown> = {};
  for (const f of DEVICE_FIELDS) if (body[f] !== undefined) data[f] = body[f];
  const row = await prisma.biometricDevice.update({ where: { id }, data });
  await logAudit({ action: "UPDATE", module: "biometricDevices", entityType: "Biometric Device", entityId: row.id, entityName: row.name, companyId, userId: ctx.userId, beforeState: existing as unknown as Prisma.InputJsonValue, afterState: row as unknown as Prisma.InputJsonValue });
  return ok(row);
}

export async function deleteDevice(req: Request, id: string) {
  const ctx = await requirePermission("biometricDevices.delete");
  const companyId = requireCompanyId(ctx.companyId);
  const existing = await prisma.biometricDevice.findUnique({ where: { id } });
  if (!existing || existing.companyId !== companyId) throw notFound("Biometric device not found.");
  await prisma.biometricDevice.delete({ where: { id } });
  await logAudit({ action: "DELETE", module: "biometricDevices", entityType: "Biometric Device", entityId: id, entityName: existing.name, companyId, userId: ctx.userId });
  return ok({ id, deleted: true });
}

export async function syncDevice(req: Request, id: string) {
  const ctx = await requirePermission("biometricDevices.manage");
  const companyId = requireCompanyId(ctx.companyId);
  const device = await prisma.biometricDevice.findUnique({ where: { id } });
  if (!device || device.companyId !== companyId) throw notFound("Biometric device not found.");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const rows = body.rows as unknown[];
  if (!Array.isArray(rows)) throw badRequest("rows must be an array.");
  const result = await importAttendance(
    { companyId, userId: ctx.userId },
    { source: "BIOMETRIC", rows: rows as Parameters<typeof importAttendance>[1]["rows"], fileName: device.name }
  );
  await prisma.biometricDevice.update({ where: { id }, data: { status: "ONLINE" as BiometricDeviceStatus, lastSyncAt: new Date() } });
  return ok(result);
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function attendanceReport(req: Request) {
  const ctx = await requirePermission("attendance.read");
  const companyId = requireCompanyId(ctx.companyId);

  const url = new URL(req.url);
  const sp = url.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const departmentId = sp.get("departmentId");
  const employeeId = sp.get("employeeId");
  if (!from || !to) throw badRequest("from and to dates are required.");

  const where: Prisma.AttendanceWhereInput = {
    companyId,
    date: { gte: new Date(from), lte: new Date(to) },
    ...(departmentId ? { employee: { departmentId } } : {}),
    ...(employeeId ? { employeeId } : {}),
  };

  const records = await prisma.attendance.findMany({
    where,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, department: { select: { name: true } } } },
    },
    orderBy: { employee: { employeeCode: "asc" } },
  });

  const grouped = new Map<
    string,
    {
      employeeId: string;
      employeeCode: string;
      name: string;
      department: string | null;
      present: number;
      absent: number;
      halfDay: number;
      onLeave: number;
      weekOff: number;
      holiday: number;
      pending: number;
      totalWorkingMin: number;
      totalLateMin: number;
      totalEarlyMin: number;
      totalOtMin: number;
    }
  >();

  for (const r of records) {
    const key = r.employee.id;
    const g =
      grouped.get(key) ??
      {
        employeeId: key,
        employeeCode: r.employee.employeeCode,
        name: `${r.employee.firstName} ${r.employee.lastName}`,
        department: r.employee.department?.name ?? null,
        present: 0,
        absent: 0,
        halfDay: 0,
        onLeave: 0,
        weekOff: 0,
        holiday: 0,
        pending: 0,
        totalWorkingMin: 0,
        totalLateMin: 0,
        totalEarlyMin: 0,
        totalOtMin: 0,
      };
    switch (r.status) {
      case "PRESENT": g.present++; break;
      case "ABSENT": g.absent++; break;
      case "HALF_DAY": g.halfDay++; break;
      case "ON_LEAVE": g.onLeave++; break;
      case "WEEK_OFF": g.weekOff++; break;
      case "HOLIDAY": g.holiday++; break;
      default: g.pending++;
    }
    g.totalWorkingMin += r.workingMinutes ?? 0;
    g.totalLateMin += r.lateMinutes;
    g.totalEarlyMin += r.earlyGoingMinutes;
    g.totalOtMin += r.overtimeMinutes;
    grouped.set(key, g);
  }

  const summary = {
    present: records.filter((r) => r.status === "PRESENT").length,
    absent: records.filter((r) => r.status === "ABSENT").length,
    halfDay: records.filter((r) => r.status === "HALF_DAY").length,
    onLeave: records.filter((r) => r.status === "ON_LEAVE").length,
  };

  const daySpan = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);
  return ok(
    {
      rows: [...grouped.values()].map((r) => ({
        ...r,
        presentationRate: daySpan ? Math.round((r.present + r.halfDay) / daySpan * 100) : 0,
      })),
      summary,
      daySpan,
    },
    { from, to }
  );
}