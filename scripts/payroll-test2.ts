import { prisma } from "../src/lib/prisma";
import { processPayrollRun, recalculateRun, finalizeRun, markRunPaid, monthRange } from "../src/server/services/payroll";

async function main() {
  const company = await prisma.company.findFirstOrThrow();
  const employees = await prisma.employee.findMany({ where: { companyId: company.id, status: "ACTIVE" } });
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const emp = employees[0];

  const existing = await prisma.payrollRun.findUnique({ where: { companyId_month_year: { companyId: company.id, month, year } } });
  if (existing) {
    await prisma.payslipComponent.deleteMany({ where: { payslip: { runId: existing.id } } });
    await prisma.payslip.deleteMany({ where: { runId: existing.id } });
    await prisma.payrollAdjustment.deleteMany({ where: { runId: existing.id } });
    await prisma.payrollRun.delete({ where: { id: existing.id } });
  }

  const result = await processPayrollRun(company.id, "payroll-test", { month, year });
  let sl = await prisma.payslip.findFirstOrThrow({ where: { runId: result.run.id, employeeId: emp.id } });
  console.log("net (base)      =", Number(sl.netSalary));

  await prisma.payrollAdjustment.create({
    data: { companyId: company.id, runId: result.run.id, employeeId: emp.id, type: "BONUS", amount: 3000, description: "Festival bonus", createdBy: "payroll-test" },
  });
  await prisma.payrollAdjustment.create({
    data: { companyId: company.id, runId: result.run.id, employeeId: emp.id, type: "REIMBURSEMENT", amount: 1200, description: "Internet reimbursement", createdBy: "payroll-test" },
  });

  const recalc = await recalculateRun(company.id, result.run.id);
  sl = await prisma.payslip.findFirstOrThrow({ where: { runId: result.run.id, employeeId: emp.id } });
  console.log("net (after adj) =", Number(sl.netSalary), "reim=", Number(sl.reimbursements), "bonus=", Number(sl.bonus));
  console.log("run totalNet    =", Number(await (async () => (await prisma.payrollRun.findUniqueOrThrow({ where: { id: result.run.id } })).totalNet)()));

  const fin = await finalizeRun(company.id, result.run.id, "payroll-test");
  const paid = await markRunPaid(company.id, result.run.id, "payroll-test");
  console.log("finalize ->", fin.status, "| mark-paid ->", paid.status);

  // The bank file only exposes paid/finalized runs
  const { getRunOrThrow } = await import("../src/server/services/payroll");

  // cleanup all test artifacts
  await prisma.payslipComponent.deleteMany({ where: { payslip: { runId: result.run.id } } });
  await prisma.payslip.deleteMany({ where: { runId: result.run.id } });
  await prisma.payrollAdjustment.deleteMany({ where: { runId: result.run.id } });
  await prisma.payrollRun.delete({ where: { id: result.run.id } });
  const { start, end } = monthRange(month, year);
  await prisma.attendance.deleteMany({ where: { companyId: company.id, date: { gte: start, lte: end }, createdBy: "payroll-test" } });
  const left = await prisma.payrollRun.count({ where: { companyId: company.id } });
  console.log("cleanup done, remaining runs:", left, "| getRunOrThrow:", typeof getRunOrThrow);
}

main().finally(() => prisma.$disconnect());