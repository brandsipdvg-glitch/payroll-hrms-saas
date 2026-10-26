import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/errors";
import type { ReportRow } from "@/server/services/reporting";

type FilterMap = Record<string, unknown>;

/**
 * Attendance dataset for the reporting engine.
 * Returns a per-employee summary of presence/lateness/OT within a period,
 * matching the dedicated attendance report shape.
 */
export async function attendanceReportDataset(companyId: string, filters: FilterMap = {}): Promise<{ rows: ReportRow[]; summary: Record<string, unknown> }> {
  const f = filters as { from?: string; to?: string; departmentId?: string; employeeId?: string };
  const from = f.from ?? filters.periodFrom;
  const to = f.to ?? filters.periodTo;
  if (!from || !to) throw badRequest("from and to dates are required for attendance reports.");

  const records = await prisma.attendance.findMany({
    where: {
      companyId,
      date: { gte: new Date(String(from)), lt: new Date(new Date(String(to)).getTime() + 86400000) },
      ...(f.departmentId ? { employee: { departmentId: String(f.departmentId) } } : {}),
      ...(f.employeeId ? { employeeId: String(f.employeeId) } : {}),
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: { employee: { employeeCode: "asc" } },
  });

  const grouped = new Map<string, ReportRow>();
  for (const r of records) {
    const key = r.employee.id;
    const g =
      grouped.get(key) ??
      {
        employeeId: key,
        employeeCode: r.employee.employeeCode,
        name: `${r.employee.firstName} ${r.employee.lastName}`,
        department: r.employee.department?.name ?? "",
        present: 0,
        absent: 0,
        halfDay: 0,
        onLeave: 0,
        weekOff: 0,
        holiday: 0,
        pending: 0,
        totalWorkingMin: 0,
        totalLateMin: 0,
        totalOtMin: 0,
      };
    switch (r.status) {
      case "PRESENT": g.present = Number(g.present) + 1; break;
      case "ABSENT": g.absent = Number(g.absent) + 1; break;
      case "HALF_DAY": g.halfDay = Number(g.halfDay) + 1; break;
      case "ON_LEAVE": g.onLeave = Number(g.onLeave) + 1; break;
      case "WEEK_OFF": g.weekOff = Number(g.weekOff) + 1; break;
      case "HOLIDAY": g.holiday = Number(g.holiday) + 1; break;
      default: g.pending = Number(g.pending) + 1;
    }
    g.totalWorkingMin = Number(g.totalWorkingMin) + (r.workingMinutes ?? 0);
    g.totalLateMin = Number(g.totalLateMin) + r.lateMinutes;
    g.totalOtMin = Number(g.totalOtMin) + r.overtimeMinutes;
    grouped.set(key, g);
  }

  const daySpan = Math.max(1, Math.round((new Date(String(to)).getTime() - new Date(String(from)).getTime()) / 86400000) + 1);
  const rows = [...grouped.values()].map((r) => ({ ...r, presentationRate: daySpan ? Math.round((((Number(r.present) + Number(r.halfDay)) / daySpan) * 100)) : 0 }));

  const summary: Record<string, unknown> = {
    present: records.filter((r) => r.status === "PRESENT").length,
    absent: records.filter((r) => r.status === "ABSENT").length,
    halfDay: records.filter((r) => r.status === "HALF_DAY").length,
    onLeave: records.filter((r) => r.status === "ON_LEAVE").length,
    daySpan,
  };

  return { rows, summary };
}