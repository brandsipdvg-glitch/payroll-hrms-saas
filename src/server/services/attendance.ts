import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/errors";
import { Prisma } from "@prisma/client";
import type {
  AttendancePolicy,
  AttendanceSource,
  AttendanceStatus,
  ShiftMaster,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Time helpers (shifts are stored as "HH:mm" 24h strings)
// ---------------------------------------------------------------------------

export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(time.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().slice(0, 5);
}

export function minutesToHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function shiftDurationMinutes(shift: Pick<ShiftMaster, "startTime" | "endTime">): number {
  const start = timeToMinutes(shift.startTime) ?? 0;
  let end = timeToMinutes(shift.endTime) ?? 0;
  if (end <= start) end += 24 * 60;
  return end - start;
}

export function asDateOnly(d: Date | string): Date {
  const date = typeof d === "string" ? new Date(d) : d;
  const out = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return out;
}

export function dayOfWeekName(date: Date): string {
  return ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][date.getDay()] ?? "";
}

// ---------------------------------------------------------------------------
// Attendance engine
// ---------------------------------------------------------------------------

export interface ShiftLike {
  id?: string;
  startTime?: string | null;
  endTime?: string | null;
  gracePeriodMinutes?: number | null;
  maxLateMinutes?: number | null;
  allowsOvertime?: boolean | null;
  weeklyOffRule?: { offDays?: string[] } | null;
}

export interface PolicyLike {
  graceTimeMinutes?: number | null;
  maxLateMinutes?: number | null;
  lateAfterGraceMinutes?: number | null;
  minHoursForFullDay?: number | null;
  otEnabled?: boolean | null;
  otAfterMinutes?: number | null;
  otRoundToMinutes?: number | null;
  otMaxPerDayMinutes?: number | null;
  absentIfNoPunch?: boolean | null;
  absentAfterHalfDay?: boolean | null;
}

export interface AttendanceEvalInput {
  date: Date;
  inTime?: Date | string | null;
  outTime?: Date | string | null;
  breakMinutes?: number | null;
  shift?: ShiftLike | null;
  policy?: PolicyLike | null;
  isHoliday?: boolean;
  isWeekOff?: boolean;
  isOnLeave?: boolean;
}

export interface AttendanceEvalResult {
  workingMinutes: number | null;
  lateMinutes: number;
  earlyGoingMinutes: number;
  overtimeMinutes: number;
  status: AttendanceStatus;
}

/** Extra minutes of the day against a reference noon to detect cross-midnight. */
function minuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function evaluateAttendance(input: AttendanceEvalInput): AttendanceEvalResult {
  const policy = input.policy ?? {};
  const shift = input.shift ?? {};
  const inTime = input.inTime ? new Date(input.inTime) : null;
  const outTime = input.outTime ? new Date(input.outTime) : null;
  const shiftStart = timeToMinutes(shift.startTime ?? "09:00") ?? 540;
  let shiftEnd = timeToMinutes(shift.endTime ?? "18:00") ?? 1080;
  const isNight = shiftEnd <= shiftStart;
  if (isNight) shiftEnd += 24 * 60;
  const shiftMinutes = shiftEnd - shiftStart;

  // No punches at all
  if (!inTime && !outTime) {
    if (input.isOnLeave) return { workingMinutes: null, lateMinutes: 0, earlyGoingMinutes: 0, overtimeMinutes: 0, status: "ON_LEAVE" };
    if (input.isHoliday) return { workingMinutes: null, lateMinutes: 0, earlyGoingMinutes: 0, overtimeMinutes: 0, status: "HOLIDAY" };
    if (input.isWeekOff) return { workingMinutes: null, lateMinutes: 0, earlyGoingMinutes: 0, overtimeMinutes: 0, status: "WEEK_OFF" };
    if (policy.absentIfNoPunch !== false) return { workingMinutes: null, lateMinutes: 0, earlyGoingMinutes: 0, overtimeMinutes: 0, status: "ABSENT" };
    return { workingMinutes: null, lateMinutes: 0, earlyGoingMinutes: 0, overtimeMinutes: 0, status: "PENDING" };
  }

  // Partial punch — record what we can
  if (!inTime || !outTime) {
    const late = inTime ? Math.max(0, minuteOfDay(inTime) - shiftStart) : 0;
    return { workingMinutes: null, lateMinutes: late, earlyGoingMinutes: 0, overtimeMinutes: 0, status: "PENDING" };
  }

  const workingMinutesRaw = Math.max(0, Math.round((outTime.getTime() - inTime.getTime()) / 60000));
  const breakMs = Math.max(0, input.breakMinutes ?? 0);
  const workingMinutes = Math.max(0, workingMinutesRaw - breakMs);

  const inDay = minuteOfDay(inTime);
  let outDay = minuteOfDay(outTime);
  if (isNight && outTime.getTime() < inTime.getTime()) outDay += 24 * 60;
  const late = Math.max(0, inDay - shiftStart);
  const early = Math.max(0, shiftEnd - outDay);

  // Overtime: hours worked beyond the shift span
  let overtime = Math.max(0, workingMinutes - shiftMinutes);
  const otEnabled = policy.otEnabled ?? shift.allowsOvertime ?? false;
  if (otEnabled) {
    const after = policy.otAfterMinutes ?? 0;
    overtime = Math.max(0, overtime - after);
    const roundTo = Math.max(1, policy.otRoundToMinutes ?? 1);
    overtime = Math.floor(overtime / roundTo) * roundTo;
    const cap = policy.otMaxPerDayMinutes;
    if (cap != null && cap > 0) overtime = Math.min(overtime, cap);
  } else {
    overtime = 0;
  }

  // Status determination
  let status: AttendanceStatus = "PRESENT";
  if (input.isOnLeave) status = "ON_LEAVE";
  else {
    const minFull = policy.minHoursForFullDay;
    if (minFull != null && minFull > 0 && workingMinutes < minFull) {
      if (policy.absentAfterHalfDay) status = "ABSENT";
      else status = "HALF_DAY";
    } else {
      const maxLate = policy.maxLateMinutes;
      const grace = policy.graceTimeMinutes ?? 0;
      if (maxLate != null && maxLate > 0 && late - grace > maxLate) {
        status = "HALF_DAY";
      }
    }
  }

  return { workingMinutes, lateMinutes: late, earlyGoingMinutes: early, overtimeMinutes: overtime, status };
}

// ---------------------------------------------------------------------------
// Context resolution (holiday / week-off / approved leave) + persistence
// ---------------------------------------------------------------------------

export interface AttendanceContext {
  isHoliday: boolean;
  isWeekOff: boolean;
  isOnLeave: boolean;
}

const WEEK_DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export async function resolveDayContext(companyId: string, employeeId: string, date: Date): Promise<AttendanceContext> {
  const day = asDateOnly(date);
  const [calendars, employee, leave] = await Promise.all([
    prisma.holidayCalendar.findMany({
      where: { companyId, isDefault: true },
      include: { holidays: { where: { date: day }, select: { id: true } } },
    }),
    prisma.employee.findUnique({
      where: { id: employeeId },
      select: { shift: { include: { weeklyOffRule: { select: { offDays: true } } } } },
    }),
    prisma.leaveRequest.findFirst({
      where: {
        companyId,
        employeeId,
        status: "APPROVED",
        OR: [{ startDate: { lte: day } }, { endDate: { gte: day } }],
        AND: [
          { startDate: { lte: day } },
          { endDate: { gte: day } },
        ],
      },
      select: { id: true },
    }),
  ]);

  const isHoliday = calendars.some((c) => c.holidays.length > 0);
  const offDays = employee?.shift?.weeklyOffRule?.offDays ?? ["SATURDAY", "SUNDAY"];
  const dow = WEEK_DAYS[day.getDay()];
  const isWeekOff = offDays.includes(dow);

  return { isHoliday, isWeekOff, isOnLeave: Boolean(leave) };
}

export interface SaveAttendanceInput {
  companyId: string;
  employeeId: string;
  date: Date | string;
  inTime?: Date | string | null;
  outTime?: Date | string | null;
  breakMinutes?: number | null;
  shiftId?: string | null;
  policyId?: string | null;
  source?: AttendanceSource;
  remarks?: string | null;
  userId?: string | null;
  upsert?: boolean;
}

export async function resolveShift(companyId: string, employeeId: string, shiftId?: string | null) {
  if (shiftId) {
    const shift = await prisma.shiftMaster.findUnique({
      where: { id: shiftId },
      include: { weeklyOffRule: { select: { offDays: true } } },
    });
    if (!shift || shift.companyId !== companyId) throw notFound("Shift not found.");
    return shift;
  }
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { shift: { include: { weeklyOffRule: { select: { offDays: true } } } } },
  });
  if (!employee || employee.companyId !== companyId) throw notFound("Employee not found.");
  return employee.shift;
}

export async function resolvePolicy(companyId: string, policyId?: string | null): Promise<AttendancePolicy | null> {
  if (policyId) {
    const policy = await prisma.attendancePolicy.findUnique({ where: { id: policyId } });
    if (!policy || policy.companyId !== companyId) throw notFound("Attendance policy not found.");
    return policy;
  }
  return prisma.attendancePolicy.findFirst({ where: { companyId, isDefault: true, isActive: true } });
}

export async function saveAttendanceRecord(input: SaveAttendanceInput) {
  const date = asDateOnly(new Date(input.date));
  const day = new Date(date);

  const shift = await resolveShift(input.companyId, input.employeeId, input.shiftId);
  const policy = await resolvePolicy(input.companyId, input.policyId);
  const { isHoliday, isWeekOff, isOnLeave } = await resolveDayContext(input.companyId, input.employeeId, day);

  const inTime = input.inTime ? new Date(input.inTime) : null;
  const outTime = input.outTime ? new Date(input.outTime) : null;

  const result = evaluateAttendance({
    date: day,
    inTime,
    outTime,
    breakMinutes: input.breakMinutes,
    shift,
    policy,
    isHoliday,
    isWeekOff,
    isOnLeave,
  });

  const data: Prisma.AttendanceUncheckedCreateInput = {
    companyId: input.companyId,
    employeeId: input.employeeId,
    date: day,
    inTime,
    outTime,
    breakMinutes: input.breakMinutes ?? 0,
    shiftId: shift?.id ?? null,
    policyId: policy?.id ?? null,
    source: input.source ?? "MANUAL",
    status: result.status,
    workingMinutes: result.workingMinutes,
    lateMinutes: result.lateMinutes,
    earlyGoingMinutes: result.earlyGoingMinutes,
    overtimeMinutes: result.overtimeMinutes,
    remarks: input.remarks ?? null,
    createdBy: input.userId ?? null,
  };

  const existing = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: input.employeeId, date: day } },
  });
  if (existing) {
    const { employeeId, date: _d, ...rest } = data;
    void employeeId;
    void _d;
    const updated = await prisma.attendance.update({
      where: { id: existing.id },
      data: rest as Prisma.AttendanceUpdateInput,
    });
    return { attendance: updated, created: false };
  }
  const created = await prisma.attendance.create({ data });
  return { attendance: created, created: true };
}

export async function getAttendance(companyId: string, id: string) {
  const row = await prisma.attendance.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      policy: { select: { id: true, name: true } },
    },
  });
  if (!row || row.companyId !== companyId) throw notFound("Attendance record not found.");
  return row;
}

// ---------------------------------------------------------------------------
// Attendance import (CSV / Excel / API / Biometric)
// ---------------------------------------------------------------------------

export interface ImportRow {
  employeeCode?: string;
  employeeId?: string;
  date: string | Date;
  inTime?: string | null;
  outTime?: string | null;
  breakMinutes?: number | null;
  shiftCode?: string | null;
}

interface ImportSummary {
  importId: string;
  total: number;
  success: number;
  failed: number;
  errors: { row: number; message: string }[];
}

export async function importAttendance(
  ctx: { companyId: string; userId: string | null },
  input: {
    source: AttendanceSource;
    rows: ImportRow[];
    fileName?: string | null;
  }
): Promise<ImportSummary> {
  if (!Array.isArray(input.rows) || input.rows.length === 0) {
    throw badRequest("No attendance rows provided.");
  }
  const { companyId } = ctx;
  const errors: { row: number; message: string }[] = [];
  let success = 0;
  let total = 0;

  const shifts = await prisma.shiftMaster.findMany({ where: { companyId } });
  const shiftByCode = new Map(shifts.map((s) => [s.code.toLowerCase(), s]));

  for (const row of input.rows) {
    total++;
    const idx = total;
    try {
      let employeeId = row.employeeId;
      if (!employeeId && row.employeeCode) {
        const emp = await prisma.employee.findFirst({
          where: { companyId, employeeCode: String(row.employeeCode).trim() },
          select: { id: true },
        });
        if (!emp) throw new Error(`Unknown employee code "${row.employeeCode}".`);
        employeeId = emp.id;
      }
      if (!employeeId) throw new Error("Missing employee reference (employeeId or employeeCode).");
      if (!row.date) throw new Error("Missing date.");

      const date = asDateOnly(new Date(row.date));
      if (Number.isNaN(date.getTime())) throw new Error(`Invalid date "${String(row.date)}".`);

      const shift = row.shiftCode ? shiftByCode.get(String(row.shiftCode).trim().toLowerCase()) : undefined;

      const inTime = buildDateTime(date, row.inTime);
      const outTime = buildDateTime(date, row.outTime);
      const breakMinutes = Number(row.breakMinutes ?? 0);
      if (!Number.isInteger(breakMinutes) || breakMinutes < 0) {
        throw new Error(`Invalid breakMinutes "${String(row.breakMinutes)}".`);
      }

      await saveAttendanceRecord({
        companyId,
        employeeId,
        date,
        inTime,
        outTime,
        breakMinutes,
        shiftId: shift?.id ?? undefined,
        source: input.source,
        userId: ctx.userId,
      });
      success++;
    } catch (e) {
      errors.push({ row: idx, message: e instanceof Error ? e.message : "Failed to import row." });
    }
  }

  const imp = await prisma.attendanceImport.create({
    data: {
      companyId,
      source: input.source,
      fileName: input.fileName ?? null,
      totalRows: total,
      successRows: success,
      failedRows: errors.length,
      errors: errors.length ? (errors as Prisma.InputJsonValue) : Prisma.JsonNull,
      importedBy: ctx.userId,
    },
  });

  await logAudit({
    action: "CREATE",
    module: "attendanceImports",
    entityType: "Attendance Import",
    entityId: imp.id,
    entityName: input.fileName ?? `${input.source} import`,
    companyId,
    userId: ctx.userId,
    metadata: { total, success, failed: errors.length } as Prisma.InputJsonValue,
  });

  return { importId: imp.id, total, success, failed: errors.length, errors };
}

function buildDateTime(date: Date, time: string | null | undefined): Date | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time).trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const out = new Date(date);
  out.setHours(h, min, 0, 0);
  return out;
}

export async function recalcAttendanceForEmployee(companyId: string, employeeId: string) {
  const records = await prisma.attendance.findMany({ where: { companyId, employeeId } });
  let n = 0;
  for (const r of records) {
    await saveAttendanceRecord({
      companyId,
      employeeId,
      date: r.date,
      inTime: r.inTime,
      outTime: r.outTime,
      breakMinutes: r.breakMinutes,
      shiftId: r.shiftId,
      policyId: r.policyId,
      source: r.source,
      remarks: r.remarks,
    });
    n++;
  }
  return n;
}

export { WEEK_DAYS };
