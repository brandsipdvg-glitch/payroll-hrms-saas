import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireCompanyId } from "@/lib/authz";
import { ok, created } from "@/lib/api";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import {
  processPayrollRun,
  recalculateRun,
  finalizeRun,
  markRunPaid,
  cancelRun,
  listPayslipsForRun,
  buildRunRegister,
  buildRunSummary,
  buildBankFile,
  toCsv,
  resolveStructure,
  monthRange,
} from "@/server/services/payroll";
import { Prisma, PayComponentType, CalculationType, PayrollAdjustmentType, PayrollRunStatus, PayslipStatus } from "@prisma/client";

// ---------------------------------------------------------------------------
// Pay components
// ---------------------------------------------------------------------------

const includePayComponent = {} as const;

export async function listPayComponents(req: Request) {
  const { companyId } = await reqCtx(req, "payComponents.read");
  const url = new URL(req.url);
  const sp = url.searchParams;
  const type = sp.get("type");
  const where: Prisma.PayComponentWhereInput = {
    companyId,
    ...(type === "EARNING" || type === "DEDUCTION" ? { componentType: type } : {}),
  };
  const rows = await prisma.payComponent.findMany({
    where,
    include: includePayComponent,
    orderBy: [{ componentType: "asc" }, { sortOrder: "asc" }],
  });
  return ok(rows);
}

export async function createPayComponent(req: Request) {
  const ctx = await reqCtx(req, "payComponents.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { name, code, componentType, calcType, formula, percentOf, percent, defaultValue, isTaxable, isStatutory, isVariable, isLoanRecovery, sortOrder, description } = body as Record<string, unknown>;
  if (!name || !code) throw badRequest("name and code are required.");
  const exists = await prisma.payComponent.findUnique({ where: { companyId_code: { companyId: ctx.companyId, code: String(code).toUpperCase() } } });
  if (exists) throw badRequest(`A pay component with code "${code}" already exists.`);

  const row = await prisma.payComponent.create({
    data: {
      companyId: ctx.companyId,
      name: String(name),
      code: String(code).toUpperCase(),
      componentType: (componentType as PayComponentType) ?? "EARNING",
      calcType: (calcType as CalculationType) ?? "FIXED",
      formula: formula ? String(formula) : null,
      percentOf: percentOf ? String(percentOf).toUpperCase() : null,
      percent: percent !== undefined && percent !== null && percent !== "" ? new Prisma.Decimal(Number(percent)) : null,
      defaultValue: defaultValue !== undefined && defaultValue !== null && defaultValue !== "" ? new Prisma.Decimal(Number(defaultValue)) : null,
      isTaxable: Boolean(isTaxable),
      isStatutory: Boolean(isStatutory),
      isVariable: Boolean(isVariable),
      isLoanRecovery: Boolean(isLoanRecovery),
      sortOrder: sortOrder !== undefined ? Number(sortOrder) : 100,
      description: description ? String(description) : null,
    },
  });
  await logAudit({ action: "CREATE", module: "payComponents", entityType: "PayComponent", entityId: row.id, entityName: row.name, companyId: ctx.companyId, userId: ctx.userId });
  return created(row);
}

export async function updatePayComponent(req: Request, id: string) {
  const ctx = await reqCtx(req, "payComponents.update");
  const existing = await prisma.payComponent.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!existing) throw notFound("Pay component not found.");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const row = await prisma.payComponent.update({ where: { id }, data: pickComponentPatch(body) });
  await logAudit({ action: "UPDATE", module: "payComponents", entityType: "PayComponent", entityId: row.id, entityName: row.name, companyId: ctx.companyId, userId: ctx.userId });
  return ok(row);
}

export async function archivePayComponent(req: Request, id: string) {
  const ctx = await reqCtx(req, "payComponents.delete");
  const existing = await prisma.payComponent.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!existing) throw notFound("Pay component not found.");
  const row = await prisma.payComponent.update({ where: { id }, data: { isActive: false } });
  await logAudit({ action: "DELETE", module: "payComponents", entityType: "PayComponent", entityId: row.id, entityName: row.name, companyId: ctx.companyId, userId: ctx.userId });
  return ok({ id, archived: true });
}

function pickComponentPatch(body: Record<string, unknown>): Prisma.PayComponentUpdateInput {
  const patch: Prisma.PayComponentUpdateInput = {};
  const s = (k: string) => (body[k] !== undefined ? String(body[k]) : undefined);
  if (body.name !== undefined) patch.name = s("name");
  if (body.code !== undefined) patch.code = s("code")?.toUpperCase();
  if (body.componentType !== undefined) patch.componentType = body.componentType as PayComponentType;
  if (body.calcType !== undefined) patch.calcType = body.calcType as CalculationType;
  if (body.formula !== undefined) patch.formula = body.formula ? String(body.formula) : null;
  if (body.percentOf !== undefined) patch.percentOf = body.percentOf ? String(body.percentOf).toUpperCase() : null;
  if (body.percent !== undefined) patch.percent = body.percent === "" || body.percent === null ? null : new Prisma.Decimal(Number(body.percent));
  if (body.defaultValue !== undefined) patch.defaultValue = body.defaultValue === "" || body.defaultValue === null ? null : new Prisma.Decimal(Number(body.defaultValue));
  for (const b of ["isTaxable", "isStatutory", "isVariable", "isLoanRecovery", "isActive"]) {
    if (body[b] !== undefined) (patch as Record<string, unknown>)[b] = Boolean(body[b]);
  }
  if (body.sortOrder !== undefined) patch.sortOrder = Number(body.sortOrder);
  if (body.description !== undefined) patch.description = body.description ? String(body.description) : null;
  return patch;
}

// ---------------------------------------------------------------------------
// Salary structures
// ---------------------------------------------------------------------------

export async function listStructures(req: Request) {
  const { companyId } = await reqCtx(req, "salaryStructures.read");
  const sp = new URL(req.url).searchParams;
  const employeeId = sp.get("employeeId");
  const rows = await prisma.salaryStructure.findMany({
    where: { companyId, ...(employeeId ? { employeeId } : {}) },
    include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return ok(rows);
}

export async function getStructure(req: Request, id: string) {
  const { companyId } = await reqCtx(req, "salaryStructures.read");
  const row = await prisma.salaryStructure.findFirst({
    where: { id, companyId },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      components: { include: { payComponent: true } },
    },
  });
  if (!row) throw notFound("Salary structure not found.");
  return ok(row);
}

export async function previewStructure(req: Request) {
  const { companyId } = await reqCtx(req, "salaryStructures.read");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const grossSalary = Number(body.grossSalary ?? 0);
  const payrollDays = Number(body.payrollDays ?? 30) || 30;
  const overrides = (body.components as Array<Record<string, unknown>> | undefined) ?? [];

  const masters = await prisma.payComponent.findMany({ where: { companyId, isActive: true }, orderBy: [{ componentType: "asc" }, { sortOrder: "asc" }] });
  const overrideById = new Map(overrides.map((o) => [String(o.payComponentId), o]));

  const inputs = masters.map((m) => {
    const o = overrideById.get(m.id) ?? {};
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      componentType: m.componentType === "DEDUCTION" ? "DEDUCTION" as const : "EARNING" as const,
      calcType: (o.calcType as CalculationType | undefined) ?? m.calcType,
      formula: o.formula ? String(o.formula) : m.formula,
      percentOf: o.percentOf ? String(o.percentOf).toUpperCase() : m.percentOf,
      percent: o.percent !== undefined && o.percent !== null && o.percent !== "" ? Number(o.percent) : Number(m.percent ?? 0),
      defaultValue: o.defaultValue !== undefined && o.defaultValue !== null && o.defaultValue !== "" ? Number(o.defaultValue) : Number(m.defaultValue ?? 0),
      value: o.value !== undefined && o.value !== null && o.value !== "" ? Number(o.value) : null,
      sortOrder: m.sortOrder,
      isStatutory: m.isStatutory,
      isVariable: m.isVariable,
      isLoanRecovery: m.isLoanRecovery,
    };
  });

  const resolved = resolveStructure(inputs, grossSalary, payrollDays);
  return ok({
    gross: resolved.gross,
    perDay: resolved.perDay,
    earnings: resolved.earnings,
    deductions: resolved.deductions,
    warnings: resolved.warnings,
  });
}

export async function createStructure(req: Request) {
  const ctx = await reqCtx(req, "salaryStructures.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { employeeId, name, effectiveFrom, grossSalary, paymentMode, components, notes } = body as Record<string, unknown>;
  if (!employeeId || !grossSalary) throw badRequest("employeeId and grossSalary are required.");

  const emp = await prisma.employee.findFirst({ where: { id: String(employeeId), companyId: ctx.companyId } });
  if (!emp) throw notFound("Employee not found.");

  const existingComponents = components as Array<{ payComponentId: string; calcType?: string; formula?: string; percentOf?: string; percent?: number; value?: number; sortOrder?: number }> | undefined;
  const componentRows: Prisma.SalaryStructureComponentUncheckedCreateWithoutStructureInput[] = [];
  if (existingComponents && existingComponents.length) {
    for (const c of existingComponents) {
      if (!c.payComponentId) continue;
      componentRows.push({
        payComponentId: c.payComponentId,
        calcType: (c.calcType as CalculationType) ?? undefined,
        formula: c.formula ?? null,
        percentOf: c.percentOf ? String(c.percentOf).toUpperCase() : null,
        percent: c.percent !== undefined && c.percent !== null ? new Prisma.Decimal(Number(c.percent)) : null,
        value: c.value === undefined || c.value === null ? null : new Prisma.Decimal(Number(c.value)),
        sortOrder: c.sortOrder ?? 100,
      });
    }
  } else {
    const componentsFromMaster = await prisma.payComponent.findMany({ where: { companyId: ctx.companyId, isActive: true }, orderBy: [{ componentType: "asc" }, { sortOrder: "asc" }] });
    for (const mc of componentsFromMaster) {
      componentRows.push({
        payComponentId: mc.id,
        calcType: mc.calcType as CalculationType,
        value: mc.calcType === "FIXED" ? new Prisma.Decimal(Number(mc.defaultValue ?? 0)) : null,
        sortOrder: mc.sortOrder,
      });
    }
  }

  await prisma.salaryStructure.updateMany({ where: { employeeId: String(employeeId), isCurrent: true, companyId: ctx.companyId }, data: { isCurrent: false } });

  const row = await prisma.salaryStructure.create({
    data: {
      companyId: ctx.companyId,
      employeeId: String(employeeId),
      name: (name as string) ?? "Primary",
      effectiveFrom: new Date(String(effectiveFrom ?? new Date().toISOString().slice(0, 10))),
      grossSalary: new Prisma.Decimal(Number(grossSalary)),
      paymentMode: (paymentMode as string) ?? "BANK",
      isCurrent: true,
      notes: notes ? String(notes) : null,
      createdBy: ctx.userId,
      components: { create: componentRows },
    },
    include: { components: { include: { payComponent: true } } },
  });
  await logAudit({ action: "CREATE", module: "salaryStructures", entityType: "SalaryStructure", entityId: row.id, entityName: `${emp.employeeCode} - ${row.name}`, companyId: ctx.companyId, userId: ctx.userId });
  return created(row);
}

export async function updateStructure(req: Request, id: string) {
  const ctx = await reqCtx(req, "salaryStructures.update");
  const existing = await prisma.salaryStructure.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!existing) throw notFound("Salary structure not found.");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { components, notes } = body as Record<string, unknown>;
  const updates: Prisma.SalaryStructureUpdateInput = {};
  if (body.effectiveFrom) updates.effectiveFrom = new Date(String(body.effectiveFrom));
  if (body.grossSalary !== undefined && body.grossSalary !== "") updates.grossSalary = new Prisma.Decimal(Number(body.grossSalary));
  if (body.name) updates.name = String(body.name);
  if (body.paymentMode) updates.paymentMode = String(body.paymentMode);
  if (notes !== undefined) updates.notes = notes ? String(notes) : null;
  if (body.isCurrent !== undefined) updates.isCurrent = Boolean(body.isCurrent);

  if (Array.isArray(components) && components.length) {
    await prisma.salaryStructureComponent.deleteMany({ where: { structureId: id } });
    updates.components = {
      create: (components as Array<Record<string, unknown>>).map((c) => ({
        payComponentId: String(c.payComponentId),
        calcType: c.calcType ? (String(c.calcType) as CalculationType) : undefined,
        formula: c.formula ? String(c.formula) : null,
        percentOf: c.percentOf ? String(c.percentOf).toUpperCase() : null,
        percent: c.percent !== undefined && c.percent !== "" ? new Prisma.Decimal(Number(c.percent)) : null,
        value: c.value !== undefined && c.value !== "" ? new Prisma.Decimal(Number(c.value)) : null,
        sortOrder: c.sortOrder !== undefined ? Number(c.sortOrder) : 100,
      })),
    };
  }
  const row = await prisma.salaryStructure.update({ where: { id }, data: updates });
  return ok(row);
}

// ---------------------------------------------------------------------------
// Payroll runs
// ---------------------------------------------------------------------------

export async function listRuns(req: Request) {
  const { companyId } = await reqCtx(req, "payrollRuns.read");
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const year = sp.get("year") ? parseInt(sp.get("year")!, 10) : undefined;
  const rows = await prisma.payrollRun.findMany({
    where: { companyId, ...(status ? { status: status as PayrollRunStatus } : {}), ...(year ? { year } : {}) },
    include: { _count: { select: { payslips: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 200,
  });
  return ok(rows);
}

export async function getRun(req: Request, id: string) {
  const { companyId } = await reqCtx(req, "payrollRuns.read");
  const run = await prisma.payrollRun.findFirst({ where: { id, companyId }, include: { _count: { select: { payslips: true } } } });
  if (!run) throw notFound("Payroll run not found.");
  const payslips = await listPayslipsForRun(id);
  return ok({ ...run, payslips });
}

export async function createRun(req: Request) {
  const ctx = await reqCtx(req, "payrollRuns.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const month = Number(body.month);
  const year = Number(body.year);
  const result = await processPayrollRun(ctx.companyId, ctx.userId, {
    month,
    year,
    payrollDays: body.payrollDays !== undefined ? Number(body.payrollDays) : undefined,
    notes: body.notes ? String(body.notes) : undefined,
  });
  await logAudit({ action: "CREATE", module: "payrollRuns", entityType: "PayrollRun", entityId: result.run.id, entityName: `Payroll ${month}/${year}`, companyId: ctx.companyId, userId: ctx.userId, metadata: { payslips: result.payslips.length } });
  return created(result);
}

export async function recalcRun(req: Request, id: string) {
  const ctx = await reqCtx(req, "payrollRuns.update");
  const result = await recalculateRun(ctx.companyId, id);
  await logAudit({ action: "UPDATE", module: "payrollRuns", entityType: "PayrollRun", entityId: id, entityName: `Payroll recalc`, companyId: ctx.companyId, userId: ctx.userId });
  return ok(result);
}

export async function finalize(req: Request, id: string) {
  const ctx = await reqCtx(req, "payrollRuns.manage");
  const run = await finalizeRun(ctx.companyId, id, ctx.userId);
  await logAudit({ action: "APPROVE", module: "payrollRuns", entityType: "PayrollRun", entityId: id, entityName: `Payroll finalized`, companyId: ctx.companyId, userId: ctx.userId });
  return ok(run);
}

export async function markPaid(req: Request, id: string) {
  const ctx = await reqCtx(req, "payrollRuns.manage");
  const run = await markRunPaid(ctx.companyId, id, ctx.userId);
  await logAudit({ action: "APPROVE", module: "payrollRuns", entityType: "PayrollRun", entityId: id, entityName: `Payroll paid`, companyId: ctx.companyId, userId: ctx.userId });
  return ok(run);
}

export async function cancel(req: Request, id: string) {
  const ctx = await reqCtx(req, "payrollRuns.manage");
  const run = await cancelRun(ctx.companyId, id, ctx.userId);
  await logAudit({ action: "REJECT", module: "payrollRuns", entityType: "PayrollRun", entityId: id, entityName: `Payroll cancelled`, companyId: ctx.companyId, userId: ctx.userId });
  return ok(run);
}

/** Draft runs are safe to remove; finalized and paid payroll remain immutable. */
export async function deleteRun(req: Request, id: string) {
  const ctx = await reqCtx(req, "payrollRuns.manage");
  const run = await prisma.payrollRun.findFirst({
    where: { id, companyId: ctx.companyId },
    include: { _count: { select: { payslips: true } } },
  });
  if (!run) throw notFound("Payroll run not found.");
  if (run.status !== "DRAFT") {
    throw badRequest("Only draft payroll runs can be deleted. Cancel finalized or paid runs instead.");
  }

  await prisma.payrollRun.delete({ where: { id } });
  await logAudit({
    action: "DELETE",
    module: "payrollRuns",
    entityType: "PayrollRun",
    entityId: id,
    entityName: `Payroll ${run.month}/${run.year}`,
    companyId: ctx.companyId,
    userId: ctx.userId,
    metadata: { payslips: run._count.payslips },
  });
  return ok({ id, deleted: true });
}

// ---------------------------------------------------------------------------
// Adjustments (bonus / incentive / reimbursement / arrears)
// ---------------------------------------------------------------------------

export async function createAdjustment(req: Request) {
  const ctx = await reqCtx(req, "payrollAdjustments.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { runId, employeeId, type, amount, description } = body as Record<string, unknown>;
  if (!runId || !employeeId || !amount) throw badRequest("runId, employeeId, type and amount are required.");
  const run = await prisma.payrollRun.findFirst({ where: { id: String(runId), companyId: ctx.companyId } });
  if (!run) throw notFound("Payroll run not found.");
  if (run.status === "PAID") throw badRequest("Paid runs cannot be adjusted.");
  const row = await prisma.payrollAdjustment.create({
    data: {
      companyId: ctx.companyId,
      runId: run.id,
      employeeId: String(employeeId),
      type: (type as PayrollAdjustmentType) ?? "BONUS",
      amount: new Prisma.Decimal(Number(amount)),
      description: description ? String(description) : null,
      createdBy: ctx.userId,
    },
  });
  return created(row);
}

export async function listAdjustments(req: Request) {
  const { companyId } = await reqCtx(req, "payrollAdjustments.read");
  const sp = new URL(req.url).searchParams;
  const runId = sp.get("runId");
  const rows = await prisma.payrollAdjustment.findMany({
    where: { companyId, ...(runId ? { runId } : {}) },
    include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return ok(rows);
}

export async function deleteAdjustment(req: Request, id: string) {
  const ctx = await reqCtx(req, "payrollAdjustments.delete");
  const existing = await prisma.payrollAdjustment.findFirst({
    where: { id, companyId: ctx.companyId },
    include: { run: { select: { status: true } } },
  });
  if (!existing) throw notFound("Adjustment not found.");
  if (existing.run?.status === "PAID") throw badRequest("Paid runs cannot be adjusted.");
  await prisma.payrollAdjustment.delete({ where: { id } });
  return ok({ id, deleted: true });
}

// ---------------------------------------------------------------------------
// Payslips
// ---------------------------------------------------------------------------

const includePayslip = {
  employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, pan: true, designation: { select: { title: true } } } },
  run: { select: { id: true, month: true, year: true, status: true } },
  components: { orderBy: [{ componentType: "asc" }, { sortOrder: "asc" }] },
} satisfies Prisma.PayslipInclude;

export async function listPayslips(req: Request) {
  const { companyId } = await reqCtx(req, "payslips.read");
  const sp = new URL(req.url).searchParams;
  const runId = sp.get("runId");
  const employeeId = sp.get("employeeId");
  const status = sp.get("status");
  const where: Prisma.PayslipWhereInput = {
    companyId,
    ...(runId ? { runId } : {}),
    ...(employeeId ? { employeeId } : {}),
    ...(status ? { status: status as PayslipStatus } : {}),
  };
  const rows = await prisma.payslip.findMany({
    where,
    include: includePayslip,
    orderBy: [{ run: { year: "desc" } }, { run: { month: "desc" } }, { employee: { employeeCode: "asc" } }],
    take: 500,
  });
  return ok(rows);
}

export async function getPayslip(req: Request, id: string) {
  const { companyId } = await reqCtx(req, "payslips.read");
  const row = await prisma.payslip.findFirst({ where: { id, companyId }, include: includePayslip });
  if (!row) throw notFound("Payslip not found.");
  return ok(row);
}

export async function printPayslip(req: Request, id: string) {
  const { companyId } = await reqCtx(req, "payslips.read");
  const row = await prisma.payslip.findFirst({
    where: { id, companyId },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, pan: true, designation: { select: { title: true } } } },
      run: { select: { id: true, month: true, year: true, status: true, payrollDays: true } },
      components: { orderBy: [{ componentType: "asc" }, { sortOrder: "asc" }] },
    },
  });
  if (!row) throw notFound("Payslip not found.");
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const html = renderPayslipHtml(row, company);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// ---------------------------------------------------------------------------
// Register / summary / bank file
// ---------------------------------------------------------------------------

export async function runRegister(req: Request, id: string) {
  const { companyId } = await reqCtx(req, "payslips.read");
  const result = await buildRunRegister(companyId, id);
  return ok(result);
}

export async function runSummary(req: Request, id: string) {
  const { companyId } = await reqCtx(req, "payrollRuns.read");
  const result = await buildRunSummary(companyId, id);
  return ok(result);
}

export async function bankFile(req: Request, id: string) {
  const { companyId } = await reqCtx(req, "payrollRuns.read");
  const rows = await buildBankFile(companyId, id);
  const run = await prisma.payrollRun.findFirst({ where: { id, companyId } });
  const csv = toCsv(rows);
  const filename = `bank-file-${run?.month}-${run?.year ?? "payroll"}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// ---------------------------------------------------------------------------
// Payroll summary for dashboard (current or any month)
// ---------------------------------------------------------------------------

export async function payrollSummary(req: Request) {
  const { companyId } = await reqCtx(req, "payrollRuns.read");
  const sp = new URL(req.url).searchParams;
  const month = sp.get("month") ? Number(sp.get("month")) : new Date().getMonth() + 1;
  const year = sp.get("year") ? Number(sp.get("year")) : new Date().getFullYear();
  const { start, end } = monthRange(month, year);
  const persons = await prisma.employee.count({ where: { companyId, status: "ACTIVE", employmentStatus: { in: ["ACTIVE", "PROBATION"] }, salaryStructures: { some: { isCurrent: true } } } });
  const stateCount = await prisma.payrollRun.count({ where: { companyId, month, year, status: { not: "CANCELLED" } } });
  const run = await prisma.payrollRun.findFirst({ where: { companyId, month, year, status: { in: ["DRAFT", "FINALIZED", "PAID"] } }, orderBy: { createdAt: "desc" } });
  const attendance = await prisma.attendance.aggregate({
    where: { companyId, date: { gte: start, lte: end } },
    _sum: { overtimeMinutes: true },
    _count: true,
  });
  return ok({
    month,
    year,
    payrollDays: run?.payrollDays ?? null,
    status: run?.status ?? "NOT_RUN",
    totalGross: run ? Number(run.totalGross) : 0,
    totalDeductions: run ? Number(run.totalDeductions) : 0,
    totalReimbursements: run ? Number(run.totalReimbursements) : 0,
    totalArrears: run ? Number(run.totalArrears) : 0,
    totalBonus: run ? Number(run.totalBonus) : 0,
    totalNet: run ? Number(run.totalNet) : 0,
    payslips: run?.id ? await prisma.payslip.count({ where: { runId: run.id } }) : 0,
    employeesWithStructures: persons,
    runExists: stateCount > 0,
    overtimeHours: (attendance._sum.overtimeMinutes ?? 0) / 60,
    attendanceDays: attendance._count,
  });
}

// ---------------------------------------------------------------------------
// ESS — employee self service
// ---------------------------------------------------------------------------

async function selfPayslipContext(permission: string) {
  const session = await auth();
  if (!session?.user) throw forbidden("Please sign in.");
  if (!session.user.employeeId) throw forbidden("Your account is not linked to an employee profile.");
  await requirePermission(permission);
  const companyId = requireCompanyId(session.user.companyId);
  return { userId: session.user.id, companyId, employeeId: session.user.employeeId };
}

export async function listMyPayslips(req: Request) {
  const ctx = await selfPayslipContext("payslips.read");
  const rows = await prisma.payslip.findMany({
    where: { companyId: ctx.companyId, employeeId: ctx.employeeId },
    include: { run: { select: { month: true, year: true, status: true } } },
    orderBy: [{ run: { year: "desc" } }, { run: { month: "desc" } }],
    take: 500,
  });
  return ok(rows);
}

export async function myPayslip(req: Request, id: string) {
  const ctx = await selfPayslipContext("payslips.read");
  const row = await prisma.payslip.findFirst({ where: { id, companyId: ctx.companyId, employeeId: ctx.employeeId }, include: includePayslip });
  if (!row) throw notFound("Payslip not found.");
  return ok(row);
}

export async function myPayslipPrint(req: Request, id: string) {
  const ctx = await selfPayslipContext("payslips.read");
  const row = await prisma.payslip.findFirst({
    where: { id, companyId: ctx.companyId, employeeId: ctx.employeeId },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, pan: true, designation: { select: { title: true } } } },
      run: { select: { id: true, month: true, year: true, status: true, payrollDays: true } },
      components: { orderBy: [{ componentType: "asc" }, { sortOrder: "asc" }] },
    },
  });
  if (!row) throw notFound("Payslip not found.");
  const company = await prisma.company.findUnique({ where: { id: ctx.companyId } });
  const html = renderPayslipHtml(row, company);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function reqCtx(req: Request, permission: string) {
  const session = await auth();
  if (!session?.user) throw forbidden("Please sign in.");
  await requirePermission(permission);
  const companyId = requireCompanyId(session.user.companyId);
  void req;
  return { userId: session.user.id, companyId };
}

function renderPayslipHtml(
  row: {
    id: string;
    status: string;
    payrollDays: number;
    presentDays: number;
    absentDays: number;
    leaveDays: number;
    perDaySalary: Prisma.Decimal;
    lopDays: number;
    lopAmount: Prisma.Decimal;
    grossSalary: Prisma.Decimal;
    totalEarnings: Prisma.Decimal;
    overtimeHours: Prisma.Decimal;
    overtimePay: Prisma.Decimal;
    totalDeductions: Prisma.Decimal;
    reimbursements: Prisma.Decimal;
    bonus: Prisma.Decimal;
    arrears: Prisma.Decimal;
    incentives: Prisma.Decimal;
    netSalary: Prisma.Decimal;
    bankAccount: string | null;
    bankIfsc: string | null;
    bankName: string | null;
    paymentMode: string | null;
    employee: { firstName: string; lastName: string; employeeCode: string; pan: string | null; designation?: { title: string } | null };
    run: { month: number; year: number; status: string; payrollDays: number };
    components: Array<{ name: string; componentType: string; amount: Prisma.Decimal }>;
  },
  company: { name: string; addressLine1?: string | null; city?: string | null; state?: string | null; postalCode?: string | null; legalName?: string | null; pan?: string | null } | null
): string {
  const earnings = row.components.filter((c) => c.componentType === "EARNING");
  const deductions = row.components.filter((c) => c.componentType === "DEDUCTION");
  const monthName = new Date(`${row.run.year}-${row.run.month}-01`).toLocaleString("en-US", { month: "long", year: "numeric" });
  const f = (n: Prisma.Decimal | number) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Payslip - ${monthName}</title>
<style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:32px}
.wrap{max-width:760px;margin:0 auto;border:1px solid #ddd;border-radius:12px;padding:32px}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:16px}
.meta{border-bottom:1px solid #ddd;padding:12px 0;font-size:14px}
.meta table{width:100%} .meta td{padding:4px 8px}
table.money{width:100%;border-collapse:collapse;margin-top:16px}
table.money th,table.money td{border:1px solid #ddd;padding:8px 10px;text-align:left}
table.money th{background:#f5f5f5}
.net{display:flex;justify-content:space-between;margin-top:16px;padding:12px;background:#eef6ff;border:1px solid #bcd6f5;border-radius:8px;font-size:18px;font-weight:600}
.two{display:flex;gap:24px} .two > div{flex:1}
.muted{color:#666;font-size:12px}
@media print{ body{margin:0} .noprint{display:none} }
</style></head><body>
<div class="wrap">
  <div style="text-align:right;margin-bottom:16px" class="noprint"><button onclick="window.print()" style="font-size:14px;padding:8px 16px;cursor:pointer">Print / Save as PDF</button></div>
  <div class="header">
    <div>
      <h1 style="margin:0">${company?.name ?? ""}</h1>
      ${company?.legalName ? `<div class="muted">${company.legalName}</div>` : ""}
      <div class="muted">${company?.addressLine1 ?? ""} ${company?.city ?? ""} ${company?.state ?? ""} ${company?.postalCode ?? ""}</div>
    </div>
    <div style="text-align:right"><strong>Payslip</strong><br/>Period: ${monthName}<br/>Status: ${row.run.status}</div>
  </div>
  <div class="meta">
    <table>
      <tr><td><strong>Employee</strong></td><td>${row.employee.firstName} ${row.employee.lastName}</td>
      <td><strong>Employee ID</strong></td><td>${row.employee.employeeCode}</td></tr>
      <tr><td><strong>Designation</strong></td><td>${row.employee.designation?.title ?? "--"}</td>
      <td><strong>PAN</strong></td><td>${row.employee.pan ?? "--"}</td></tr>
      <tr><td><strong>Bank</strong></td><td>${row.bankName ?? "--"}</td>
      <td><strong>Account / IFSC</strong></td><td>${row.bankAccount ?? "--"} / ${row.bankIfsc ?? "--"}</td></tr>
      <tr><td><strong>Pay days</strong></td><td>${row.payrollDays} (${row.presentDays} present, ${row.absentDays} absent, ${row.leaveDays} leave)</td>
      <td><strong>Per day</strong></td><td>${f(row.perDaySalary)}</td></tr>
      <tr><td><strong>Gross pay</strong></td><td>${f(row.grossSalary)}</td>
      <td><strong>LOP days</strong></td><td>${row.lopDays} day(s) (${f(row.lopAmount)})</td></tr>
    </table>
  </div>
  <div class="two">
    <div>
      <h3>Earnings</h3>
      <table class="money"><tr><th>Component</th><th style="text-align:right">Amount</th></tr>
      ${earnings.map((c) => `<tr><td>${c.name}</td><td style="text-align:right">${f(c.amount)}</td></tr>`).join("")}
      <tr><th>Gross Earnings</th><th style="text-align:right">${f(row.totalEarnings)}</th></tr>
      <tr><td>Overtime</td><td style="text-align:right">${f(row.overtimePay)}</td></tr>
      <tr><td>Reimbursements</td><td style="text-align:right">${f(row.reimbursements)}</td></tr>
      <tr><td>Bonus</td><td style="text-align:right">${f(row.bonus)}</td></tr>
      <tr><td>Incentives</td><td style="text-align:right">${f(row.incentives)}</td></tr>
      <tr><td>Arrears</td><td style="text-align:right">${f(row.arrears)}</td></tr>
      </table>
    </div>
    <div>
      <h3>Deductions</h3>
      <table class="money"><tr><th>Component</th><th style="text-align:right">Amount</th></tr>
      ${deductions.map((c) => `<tr><td>${c.name}</td><td style="text-align:right">${f(c.amount)}</td></tr>`).join("")}
      <tr><th>Total Deductions</th><th style="text-align:right">${f(row.totalDeductions)}</th></tr>
      <tr><td>Loss of Pay</td><td style="text-align:right">${f(row.lopAmount)}</td></tr>
      </table>
    </div>
  </div>
  <div class="net"><span>NET PAY</span><span>${f(row.netSalary)}</span></div>
  <div class="muted" style="margin-top:16px">This is a system-generated payslip for ${company?.name ?? ""}. Net pay is computed as gross earnings + reimbursements + bonus + incentives + arrears - deductions - loss of pay.</div>
</div></body></html>`;
}
