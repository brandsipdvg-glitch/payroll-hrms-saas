import { prisma } from "@/lib/prisma";
import type { Decimal } from "@prisma/client/runtime/library";

type DecimalLike = Decimal | number;

function dec(n: unknown): number {
  if (!n) return 0;
  if (typeof n === "number") return n;
  if (typeof n === "string") return Number(n);
  try { return Number((n as DecimalLike).toString()); } catch { return 0; }
}

export interface AnalyticsSummary {
  headcount: {
    total: number;
    active: number;
    probation: number;
    resigned: number;
    exited: number;
    avgTenureDays: number;
    monthlyJoins: Array<{ month: string; count: number }>;
  };
  payroll: {
    totalGross: number;
    totalNet: number;
    totalDeductions: number;
    totalEarnings: number;
    avgCostPerEmployee: number;
    monthlyTrend: Array<{ month: string; gross: number; net: number; deductions: number }>;
  };
  compliance: {
    pfEmployer: number;
    pfEmployee: number;
    esiEmployer: number;
    esiEmployee: number;
    totalTax: number;
  };
  finance: {
    activeLoans: number;
    loanOutstanding: number;
    pendingReimbursements: number;
    reimbursementVolume: number;
    pendingBonusAllocations: number;
    bonusVolume: number;
    gratuityProvision: number;
    pendingSettlements: number;
    settlementVolume: number;
  };
  attendance: {
    avgPresenceRate: number;
    totalOTHours: number;
    totalLateMinutes: number;
    pendingLeaveRequests: number;
  };
}

export async function fetchAnalytics(companyId: string): Promise<AnalyticsSummary> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const financialYearStart = currentMonth >= 4 ? currentYear : currentYear - 1;
  const fyMonth = currentMonth >= 4 ? currentMonth - 3 : currentMonth + 9;

  const [
    totalEmp,
    activeEmp,
    probationEmp,
    resignedEmp,
    exitedEmp,
    joinsLastYear,
    latestRun,
    runsThisFY,
  ] = await Promise.all([
    prisma.employee.count({ where: { companyId } }),
    prisma.employee.count({ where: { companyId, employmentStatus: "ACTIVE" } }),
    prisma.employee.count({ where: { companyId, employmentStatus: "PROBATION" } }),
    prisma.employee.count({ where: { companyId, employmentStatus: "RESIGNED" } }),
    prisma.employee.count({ where: { companyId, employmentStatus: "EXITED" } }),
    prisma.employee.findMany({
      where: { companyId, createdAt: { gte: new Date(currentYear - 1, 0, 1) } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.payrollRun.findFirst({
      where: { companyId, status: { in: ["FINALIZED", "PAID"] } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    prisma.payrollRun.findMany({
      where: { companyId, year: financialYearStart, month: { gte: currentMonth >= 4 ? 1 : 10 } },
    }),
  ]);

  // Monthly joins (last 12 months)
  const monthlyJoins: Record<string, number> = {};
  for (const j of joinsLastYear) {
    const k = `${j.createdAt.getFullYear()}-${String(j.createdAt.getMonth() + 1).padStart(2, "0")}`;
    monthlyJoins[k] = (monthlyJoins[k] ?? 0) + 1;
  }
  const monthlyJoinsList = Object.entries(monthlyJoins)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([month, count]) => ({ month, count }));

  // Avg tenure
  const allEmp = await prisma.employee.findMany({ where: { companyId }, select: { doj: true, createdAt: true } });
  const avgTenure = allEmp.length
    ? allEmp.reduce((s, e) => s + (now.getTime() - e.doj.getTime()) / 86400000, 0) / allEmp.length
    : 0;

  // Payroll
  const payslips = latestRun
    ? await prisma.payslip.findMany({
        where: { companyId, runId: latestRun.id },
        include: {
          employee: { select: { employeeCode: true, firstName: true, lastName: true, uan: true, esiNumber: true, pan: true } },
          components: { include: { payComponent: { select: { code: true, componentType: true } } } },
        },
      })
    : [];
  const totalGross = payslips.reduce((s, p) => s + dec(p.grossSalary), 0);
  const totalNet = payslips.reduce((s, p) => s + dec(p.netSalary), 0);
  const totalDeductions = payslips.reduce((s, p) => s + dec(p.totalDeductions), 0);
  const totalEarnings = payslips.reduce((s, p) => s + dec(p.totalEarnings), 0);

  const monthlyPayrollTrend: Array<{ month: string; gross: number; net: number; deductions: number }> = [];
  for (const run of runsThisFY.slice(-6)) {
    const ps = await prisma.payslip.findMany({ where: { companyId, runId: run.id } });
    monthlyPayrollTrend.push({
      month: `${run.year}-${String(run.month).padStart(2, "0")}`,
      gross: ps.reduce((s, p) => s + dec(p.grossSalary), 0),
      net: ps.reduce((s, p) => s + dec(p.netSalary), 0),
      deductions: ps.reduce((s, p) => s + dec(p.totalDeductions), 0),
    });
  }

  // Compliance cost (from latest run payslips)
  const { computePf, computeEsi, getPfConfig, getEsiConfig } = await import("@/server/services/compliance");
  const [pfConfig, esiConfig] = await Promise.all([getPfConfig(companyId), getEsiConfig(companyId)]);
  const statutory = payslips.map((p) => ({
    pf: pfConfig ? computePf(p, pfConfig) : null,
    esi: esiConfig ? computeEsi(p, esiConfig) : null,
  }));
  const pfEmployer = statutory.reduce((s, value) => s + (value.pf?.employerShare ?? 0), 0);
  const pfEmployee = statutory.reduce((s, value) => s + (value.pf?.employeeShare ?? 0), 0);
  const esiEmployee = statutory.reduce((s, value) => s + (value.esi?.employeeShare ?? 0), 0);
  const esiEmployer = statutory.reduce((s, value) => s + (value.esi?.employerShare ?? 0), 0);
  const totalTax = 0;

  // Finance
  const [activeLoans, pendingReimbursements, pendingBonusAllocations, gratuityRecords, pendingSettlements] =
    await Promise.all([
      prisma.loan.findMany({ where: { companyId, status: { in: ["APPROVED", "ACTIVE"] } } }),
      prisma.reimbursement.findMany({ where: { companyId, status: "APPROVED" } }),
      prisma.bonusAllocation.findMany({ where: { companyId, runId: null, plan: { status: "APPROVED" } } }),
      prisma.gratuityRecord.findMany({ where: { companyId, status: "DRAFT" } }),
      prisma.settlement.findMany({ where: { companyId, status: { in: ["DRAFT", "APPROVED"] } } }),
    ]);

  const loanOutstanding = activeLoans.reduce((s, l) => s + dec(l.totalRepayable), 0);
  const reimbursementVolume = pendingReimbursements.reduce((s, r) => s + dec(r.amount), 0);
  const bonusVolume = pendingBonusAllocations.reduce((s, a) => s + dec(a.amount), 0);
  const gratuityProvision = gratuityRecords.reduce((s, g) => s + dec(g.gratuityAmount), 0);
  const settlementVolume = pendingSettlements.reduce((s, st) => s + dec(st.totalAmount), 0);

  // Attendance (current month)
  const monthStart = new Date(currentYear, currentMonth - 1, 1);
  const monthEnd = new Date(currentYear, currentMonth, 0);
  const attendanceRows = await prisma.attendance.findMany({
    where: { companyId, date: { gte: monthStart, lte: monthEnd } },
    select: { status: true, workingMinutes: true, lateMinutes: true, overtimeMinutes: true },
  });
  const totalDays = attendanceRows.length;
  const presentDays = attendanceRows.filter((r) => r.status === "PRESENT" || r.status === "HALF_DAY").length;
  const avgPresenceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;
  const totalOTHours = attendanceRows.reduce((s, r) => s + (r.overtimeMinutes ?? 0), 0) / 60;
  const totalLateMinutes = attendanceRows.reduce((s, r) => s + r.lateMinutes, 0);
  const pendingLeaveRequests = await prisma.leaveRequest.count({ where: { companyId, status: "PENDING" } });

  return {
    headcount: {
      total: totalEmp,
      active: activeEmp,
      probation: probationEmp,
      resigned: resignedEmp,
      exited: exitedEmp,
      avgTenureDays: Math.round(avgTenure),
      monthlyJoins: monthlyJoinsList,
    },
    payroll: {
      totalGross,
      totalNet,
      totalDeductions,
      totalEarnings,
      avgCostPerEmployee: payslips.length > 0 ? Math.round(totalNet / payslips.length) : 0,
      monthlyTrend: monthlyPayrollTrend,
    },
    compliance: {
      pfEmployer,
      pfEmployee: Math.max(0, pfEmployee),
      esiEmployer,
      esiEmployee,
      totalTax,
    },
    finance: {
      activeLoans: activeLoans.length,
      loanOutstanding,
      pendingReimbursements: pendingReimbursements.length,
      reimbursementVolume,
      pendingBonusAllocations: pendingBonusAllocations.length,
      bonusVolume,
      gratuityProvision,
      pendingSettlements: pendingSettlements.length,
      settlementVolume,
    },
    attendance: {
      avgPresenceRate,
      totalOTHours: Math.round(totalOTHours * 100) / 100,
      totalLateMinutes,
      pendingLeaveRequests,
    },
  };
}
