import { prisma } from "../src/lib/prisma";
import { processPayrollRun, monthRange } from "../src/server/services/payroll";

async function main() {
  const company = await prisma.company.findFirstOrThrow();
  const employees = await prisma.employee.findMany({ where: { companyId: company.id, status: "ACTIVE" } });
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // clear prior artifacts for a clean re-test
  const existing = await prisma.payrollRun.findUnique({ where: { companyId_month_year: { companyId: company.id, month, year } } });
  if (existing) {
    await prisma.payslipComponent.deleteMany({ where: { payslip: { runId: existing.id } } });
    await prisma.payslip.deleteMany({ where: { runId: existing.id } });
    await prisma.payrollAdjustment.deleteMany({ where: { runId: existing.id } });
    await prisma.payrollRun.delete({ where: { id: existing.id } });
  }
  const { start, end } = monthRange(month, year);
  await prisma.attendance.deleteMany({ where: { companyId: company.id, date: { gte: start, lte: end }, createdBy: "payroll-test" } });

  // attendance fixture: employee #0 => 3 present (1 with OT), 1 absent, 1 on leave
  const emp = employees[0];
  const days = [1, 2, 3, 4, 5, 6, 7, 8];
  const statuses: Array<"PRESENT" | "ABSENT" | "ON_LEAVE"> = ["PRESENT", "PRESENT", "PRESENT", "ABSENT", "ON_LEAVE", "PRESENT", "PRESENT", "PRESENT"];
  for (let i = 0; i < days.length; i++) {
    await prisma.attendance.create({
      data: {
        companyId: company.id,
        employeeId: emp.id,
        date: new Date(year, month - 1, days[i]),
        status: statuses[i],
        source: "API",
        overtimeMinutes: days[i] === 1 ? 75 : 0,
        createdBy: "payroll-test",
      } as never,
    });
  }

  const result = await processPayrollRun(company.id, "payroll-test", { month, year });
  const payslips = await prisma.payslip.findMany({
    where: { runId: result.run.id, employeeId: emp.id },
    include: { components: true },
  });
  const p = payslips[0];
  console.log("RUN", result.run.status, "payslips", result.payslips.length, "warnings", result.warnings.slice(0, 5));
  if (p) {
    console.log("PAYSLIP", p.runId.slice(0, 6));
    for (const c of p.components) console.log(`  ${c.componentType} ${c.name} = ${c.amount}`);
    console.log(`  gross=${p.grossSalary} present=${p.presentDays} absent=${p.absentDays} leave=${p.leaveDays}`);
    console.log(`  perDay=${p.perDaySalary} lop=${p.lopAmount} OT(h)=${p.overtimeHours} OT(pay)=${p.overtimePay}`);
    console.log(`  earnings=${p.totalEarnings} deductions=${p.totalDeductions} net=${p.netSalary}`);
    console.log(`  run totals: gross=${result.run.totalGross} deductions=${result.run.totalDeductions} net=${result.run.totalNet}`);
  }
}

main().finally(() => prisma.$disconnect());