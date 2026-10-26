import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireCompanyId } from "@/lib/authz";
import { ok, created } from "@/lib/api";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { Prisma, TaxRegime } from "@prisma/client";
import {
  buildPfRegister,
  buildEsiRegister,
  buildPtRegister,
  buildLwfRegister,
  buildTdsRegister,
  computeTaxForEmployee,
  applyMonthlyTds,
  complianceDashboard,
  getCompanyStatutorySettings,
  toCsv,
  dec,
} from "@/server/services/compliance";
import { renderTaxComputationHtml, renderForm16Html, buildForm24qCsv } from "@/server/services/tax-documents";

// ---------------------------------------------------------------------------
// Statutory settings (employer identifiers)
// ---------------------------------------------------------------------------

export async function getSettings(req: Request) {
  const { companyId } = await reqCtx(req, "compliances.read");
  const row = await getCompanyStatutorySettings(companyId).catch(() => null);
  return ok(row);
}

export async function updateSettings(req: Request) {
  const ctx = await reqCtx(req, "compliances.manage");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const fields = ["pfNumber", "pfEstablishmentName", "pfBankName", "pfBankAccount", "pfBankBranch", "esiNumber", "esiLocalOffice", "esiReturnOffice", "tan", "itTdsCircle", "itAssessingOfficer"] as const;
  const patch: Prisma.CompanyStatutorySettingUpdateInput = {};
  for (const f of fields) {
    if (body[f] !== undefined) (patch as Record<string, unknown>)[f] = body[f] === "" || body[f] === null ? null : String(body[f]);
  }
  const scoped = await prisma.companyStatutorySetting.findUnique({ where: { companyId: ctx.companyId } });
  const row = scoped
    ? await prisma.companyStatutorySetting.update({ where: { id: scoped.id }, data: patch })
    : await prisma.companyStatutorySetting.create({ data: { ...(patch as Record<string, string>), companyId: ctx.companyId } });
  await logAudit({ action: "UPDATE", module: "compliances", entityType: "CompanyStatutorySetting", entityId: row.id, entityName: "Company statutory settings", companyId: ctx.companyId, userId: ctx.userId });
  return ok(row);
}

// ---------------------------------------------------------------------------
// Config CRUD helpers
// ---------------------------------------------------------------------------

async function activatePf(companyId: string, activeId: string) {
  await prisma.pfConfig.updateMany({ where: { companyId }, data: { isCurrent: false } });
  await prisma.pfConfig.update({ where: { id: activeId }, data: { isCurrent: true } });
}

async function activateEsi(companyId: string, activeId: string) {
  await prisma.esiConfig.updateMany({ where: { companyId }, data: { isCurrent: false } });
  await prisma.esiConfig.update({ where: { id: activeId }, data: { isCurrent: true } });
}

async function activateLwf(companyId: string, activeId: string) {
  await prisma.lwfConfig.updateMany({ where: { companyId }, data: { isActive: false } });
  await prisma.lwfConfig.update({ where: { id: activeId }, data: { isActive: true } });
}

// ---------------------------------------------------------------------------
// PF configs
// ---------------------------------------------------------------------------

export async function listPfConfigs(req: Request) {
  const { companyId } = await reqCtx(req, "pf.read");
  const rows = await prisma.pfConfig.findMany({ where: { companyId }, orderBy: [{ isCurrent: "desc" }, { effectiveFrom: "desc" }] });
  return ok(rows);
}

export async function createPfConfig(req: Request) {
  const ctx = await reqCtx(req, "pf.manage");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const row = await prisma.pfConfig.create({
    data: {
      companyId: ctx.companyId,
      name: String(body.name ?? "PF configuration"),
      employeeRate: decNum(body.employeeRate, 12),
      employerRate: decNum(body.employerRate, 12),
      epsRate: decNum(body.epsRate, 8.33),
      epfRate: decNum(body.epfRate, 3.67),
      wageCeiling: decNum(body.wageCeiling, 15000),
      pensionWageCeiling: decNum(body.pensionWageCeiling, 15000),
      wageComponents: String(body.wageComponents ?? "BASIC,CONVEYANCE,MEDICAL"),
      effectiveFrom: new Date(String(body.effectiveFrom ?? new Date().toISOString().slice(0, 10))),
      isCurrent: Boolean(body.isCurrent ?? true),
      notes: body.notes ? String(body.notes) : null,
    },
  });
  if (row.isCurrent) await activatePf(ctx.companyId, row.id);
  await logAudit({ action: "CREATE", module: "pf", entityType: "PfConfig", entityId: row.id, entityName: row.name, companyId: ctx.companyId, userId: ctx.userId });
  return created(row);
}

export async function updatePfConfig(req: Request, id: string) {
  const ctx = await reqCtx(req, "pf.manage");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const existing = await prisma.pfConfig.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!existing) throw notFound("PF config not found.");
  const row = await prisma.pfConfig.update({ where: { id }, data: pfPatch(body) });
  if (row.isCurrent) await prisma.pfConfig.updateMany({ where: { companyId: ctx.companyId, id: { not: id } }, data: { isCurrent: false } });
  await logAudit({ action: "UPDATE", module: "pf", entityType: "PfConfig", entityId: row.id, entityName: row.name, companyId: ctx.companyId, userId: ctx.userId });
  return ok(row);
}

function pfPatch(body: Record<string, unknown>): Prisma.PfConfigUpdateInput {
  const patch: Prisma.PfConfigUpdateInput = {};
  for (const k of ["name", "wageComponents", "notes"]) if (body[k] !== undefined) (patch as Record<string, unknown>)[k] = body[k] !== null && body[k] !== "" ? String(body[k]) : null;
  for (const k of ["employeeRate", "employerRate", "epsRate", "epfRate", "wageCeiling", "pensionWageCeiling"]) if (body[k] !== undefined) (patch as Record<string, unknown>)[k] = decNum(body[k], undefined);
  if (body.effectiveFrom !== undefined && body.effectiveFrom !== "") (patch as Record<string, unknown>).effectiveFrom = new Date(String(body.effectiveFrom));
  if (body.isCurrent !== undefined) (patch as Record<string, unknown>).isCurrent = Boolean(body.isCurrent);
  return patch;
}

// ---------------------------------------------------------------------------
// ESI configs
// ---------------------------------------------------------------------------

export async function listEsiConfigs(req: Request) {
  const { companyId } = await reqCtx(req, "esi.read");
  const rows = await prisma.esiConfig.findMany({ where: { companyId }, orderBy: [{ isCurrent: "desc" }, { effectiveFrom: "desc" }] });
  return ok(rows);
}

export async function createEsiConfig(req: Request) {
  const ctx = await reqCtx(req, "esi.manage");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const row = await prisma.esiConfig.create({
    data: {
      companyId: ctx.companyId,
      name: String(body.name ?? "ESI configuration"),
      employeeRate: decNum(body.employeeRate, 0.75),
      employerRate: decNum(body.employerRate, 3.25),
      wageCeiling: decNum(body.wageCeiling, 21000),
      wageComponents: String(body.wageComponents ?? "BASIC,HRA,CONVEYANCE,MEDICAL,SPECIAL,OT"),
      effectiveFrom: new Date(String(body.effectiveFrom ?? new Date().toISOString().slice(0, 10))),
      isCurrent: Boolean(body.isCurrent ?? true),
      notes: body.notes ? String(body.notes) : null,
    },
  });
  if (row.isCurrent) await activateEsi(ctx.companyId, row.id);
  await logAudit({ action: "CREATE", module: "esi", entityType: "EsiConfig", entityId: row.id, entityName: row.name, companyId: ctx.companyId, userId: ctx.userId });
  return created(row);
}

export async function updateEsiConfig(req: Request, id: string) {
  const ctx = await reqCtx(req, "esi.manage");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const existing = await prisma.esiConfig.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!existing) throw notFound("ESI config not found.");
  const tryPatch: Prisma.EsiConfigUpdateInput = {};
  for (const k of ["name", "wageComponents", "notes"]) if (body[k] !== undefined) (tryPatch as Record<string, unknown>)[k] = body[k] !== null && body[k] !== "" ? String(body[k]) : null;
  for (const k of ["employeeRate", "employerRate", "wageCeiling"]) if (body[k] !== undefined) (tryPatch as Record<string, unknown>)[k] = decNum(body[k], undefined);
  if (body.effectiveFrom !== undefined && body.effectiveFrom !== "") (tryPatch as Record<string, unknown>).effectiveFrom = new Date(String(body.effectiveFrom));
  if (body.isCurrent !== undefined) (tryPatch as Record<string, unknown>).isCurrent = Boolean(body.isCurrent);
  const row = await prisma.esiConfig.update({ where: { id }, data: tryPatch });
  if (row.isCurrent) await prisma.esiConfig.updateMany({ where: { companyId: ctx.companyId, id: { not: id } }, data: { isCurrent: false } });
  await logAudit({ action: "UPDATE", module: "esi", entityType: "EsiConfig", entityId: row.id, entityName: row.name, companyId: ctx.companyId, userId: ctx.userId });
  return ok(row);
}

// ---------------------------------------------------------------------------
// Professional tax regions + slabs
// ---------------------------------------------------------------------------

export async function listPtRegions(req: Request) {
  const { companyId } = await reqCtx(req, "professionalTax.read");
  const rows = await prisma.professionalTaxRegion.findMany({
    where: { companyId },
    include: { slabs: { orderBy: { sortOrder: "asc" } } },
    orderBy: { state: "asc" },
  });
  return ok(rows);
}

export async function createPtRegion(req: Request) {
  const ctx = await reqCtx(req, "professionalTax.manage");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const slabs = (body.slabs as Array<Record<string, unknown>> | undefined) ?? [];
  const row = await prisma.professionalTaxRegion.create({
    data: {
      companyId: ctx.companyId,
      name: String(body.name ?? "Professional tax"),
      state: String(body.state ?? "Karnataka"),
      effectiveFrom: new Date(String(body.effectiveFrom ?? new Date().toISOString().slice(0, 10))),
      notes: body.notes ? String(body.notes) : null,
      slabs: { create: slabs.map((s, i) => ({ fromAmount: decNum(s.fromAmount, 0), toAmount: s.toAmount === "" || s.toAmount === null ? null : decNum(s.toAmount, undefined), monthlyAmount: decNum(s.monthlyAmount, 0), sortOrder: Number(s.sortOrder ?? i + 1) })) },
    },
    include: { slabs: { orderBy: { sortOrder: "asc" } } },
  });
  await logAudit({ action: "CREATE", module: "professionalTax", entityType: "ProfessionalTaxRegion", entityId: row.id, entityName: row.name, companyId: ctx.companyId, userId: ctx.userId });
  return created(row);
}

export async function updatePtRegion(req: Request, id: string) {
  const ctx = await reqCtx(req, "professionalTax.manage");
  const existing = await prisma.professionalTaxRegion.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!existing) throw notFound("PT region not found.");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const patch: Prisma.ProfessionalTaxRegionUpdateInput = {};
  if (body.name !== undefined && body.name !== "") patch.name = String(body.name);
  if (body.state !== undefined && body.state !== "") patch.state = String(body.state);
  if (body.effectiveFrom !== undefined && body.effectiveFrom !== "") patch.effectiveFrom = new Date(String(body.effectiveFrom));
  if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);
  if (Array.isArray(body.slabs)) {
    await prisma.professionalTaxSlab.deleteMany({ where: { regionId: id } });
    patch.slabs = {
      create: (body.slabs as Array<Record<string, unknown>>).map((s, i) => ({
        fromAmount: decNum(s.fromAmount, 0),
        toAmount: s.toAmount === "" || s.toAmount === null ? null : decNum(s.toAmount, undefined),
        monthlyAmount: decNum(s.monthlyAmount, 0),
        sortOrder: Number(s.sortOrder ?? i + 1),
      })),
    };
  }
  const row = await prisma.professionalTaxRegion.update({ where: { id }, data: patch, include: { slabs: { orderBy: { sortOrder: "asc" } } } });
  await logAudit({ action: "UPDATE", module: "professionalTax", entityType: "ProfessionalTaxRegion", entityId: row.id, entityName: row.name, companyId: ctx.companyId, userId: ctx.userId });
  return ok(row);
}

// ---------------------------------------------------------------------------
// LWF configs
// ---------------------------------------------------------------------------

export async function listLwfConfigs(req: Request) {
  const { companyId } = await reqCtx(req, "labourWelfareFund.read");
  const rows = await prisma.lwfConfig.findMany({ where: { companyId }, orderBy: [{ isActive: "desc" }, { state: "asc" }] });
  return ok(rows);
}

export async function createLwfConfig(req: Request) {
  const ctx = await reqCtx(req, "labourWelfareFund.manage");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const row = await prisma.lwfConfig.create({
    data: {
      companyId: ctx.companyId,
      name: String(body.name ?? "LWF configuration"),
      state: String(body.state ?? "Karnataka"),
      employeeShare: decNum(body.employeeShare, 20),
      employerShare: decNum(body.employerShare, 20),
      effectiveFrom: new Date(String(body.effectiveFrom ?? new Date().toISOString().slice(0, 10))),
      isActive: Boolean(body.isActive ?? true),
      notes: body.notes ? String(body.notes) : null,
    },
  });
  if (row.isActive) await prisma.lwfConfig.updateMany({ where: { companyId: ctx.companyId, id: { not: row.id } }, data: { isActive: false } });
  await logAudit({ action: "CREATE", module: "labourWelfareFund", entityType: "LwfConfig", entityId: row.id, entityName: row.name, companyId: ctx.companyId, userId: ctx.userId });
  return created(row);
}

export async function updateLwfConfig(req: Request, id: string) {
  const ctx = await reqCtx(req, "labourWelfareFund.manage");
  const existing = await prisma.lwfConfig.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!existing) throw notFound("LWF config not found.");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const patch: Prisma.LwfConfigUpdateInput = {};
  for (const k of ["name", "state", "notes"]) if (body[k] !== undefined) (patch as Record<string, unknown>)[k] = body[k] !== null && body[k] !== "" ? String(body[k]) : null;
  for (const k of ["employeeShare", "employerShare"]) if (body[k] !== undefined) (patch as Record<string, unknown>)[k] = decNum(body[k], undefined);
  if (body.effectiveFrom !== undefined && body.effectiveFrom !== "") (patch as Record<string, unknown>).effectiveFrom = new Date(String(body.effectiveFrom));
  if (body.isActive !== undefined) (patch as Record<string, unknown>).isActive = Boolean(body.isActive);
  const row = await prisma.lwfConfig.update({ where: { id }, data: patch });
  if (row.isActive) await prisma.lwfConfig.updateMany({ where: { companyId: ctx.companyId, id: { not: id } }, data: { isActive: false } });
  await logAudit({ action: "UPDATE", module: "labourWelfareFund", entityType: "LwfConfig", entityId: row.id, entityName: row.name, companyId: ctx.companyId, userId: ctx.userId });
  return ok(row);
}

// ---------------------------------------------------------------------------
// Income tax config + slabs
// ---------------------------------------------------------------------------

export async function listItConfigs(req: Request) {
  const { companyId } = await reqCtx(req, "incomeTax.read");
  const rows = await prisma.itConfig.findMany({ where: { companyId }, include: { slabs: { orderBy: [{ regime: "asc" }, { sortOrder: "asc" }] } }, orderBy: { financialYear: "desc" } });
  return ok(rows);
}

export async function createItConfig(req: Request) {
  const ctx = await reqCtx(req, "incomeTax.manage");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const financialYear = String(body.financialYear ?? "2026-27");
  const exists = await prisma.itConfig.findUnique({ where: { companyId_financialYear: { companyId: ctx.companyId, financialYear } } });
  if (exists) throw badRequest(`Income-tax config already exists for FY ${financialYear}.`);
  const row = await prisma.itConfig.create({
    data: {
      companyId: ctx.companyId,
      financialYear,
      isCurrent: Boolean(body.isCurrent ?? true),
      notes: body.notes ? String(body.notes) : null,
      slabs: {
        create: ((body.slabs as Array<Record<string, unknown>> | undefined) ?? []).map((s, i) => ({
          regime: (s.regime as TaxRegime) ?? "NEW",
          fromAmount: decNum(s.fromAmount, 0),
          toAmount: s.toAmount === "" || s.toAmount === null ? null : decNum(s.toAmount, undefined),
          rate: decNum(s.rate, 0),
          sortOrder: Number(s.sortOrder ?? i + 1),
        })),
      },
    },
    include: { slabs: true },
  });
  if (row.isCurrent) await prisma.itConfig.updateMany({ where: { companyId: ctx.companyId, id: { not: row.id } }, data: { isCurrent: false } });
  await logAudit({ action: "CREATE", module: "incomeTax", entityType: "ItConfig", entityId: row.id, entityName: row.financialYear, companyId: ctx.companyId, userId: ctx.userId });
  return created(row);
}

export async function updateItConfig(req: Request, id: string) {
  const ctx = await reqCtx(req, "incomeTax.manage");
  const existing = await prisma.itConfig.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!existing) throw notFound("Income-tax config not found.");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const numericKeys = ["standardDeductionOld", "standardDeductionNew", "deduction80CLimit", "deduction80DLimit", "senior80DLimit", "nps80CCD1BLimit", "homeLoanInterestLimit", "hraMetroPercent", "hraNonMetroPercent", "rebate87ALimitOld", "rebate87AAmountOld", "rebate87ALimitNew", "rebate87AAmountNew", "healthCessPercent"] as const;
  const patch: Prisma.ItConfigUpdateInput = {};
  for (const k of numericKeys) if (body[k] !== undefined) (patch as Record<string, unknown>)[k] = decNum(body[k], undefined);
  for (const k of ["notes"]) if (body[k] !== undefined) (patch as Record<string, unknown>)[k] = body[k] !== null && body[k] !== "" ? String(body[k]) : null;
  if (body.isCurrent !== undefined) (patch as Record<string, unknown>).isCurrent = Boolean(body.isCurrent);
  if (Array.isArray(body.slabs)) {
    await prisma.itSlab.deleteMany({ where: { configId: id } });
    patch.slabs = {
      create: (body.slabs as Array<Record<string, unknown>>).map((s, i) => ({
        regime: (s.regime as TaxRegime) ?? "NEW",
        fromAmount: decNum(s.fromAmount, 0),
        toAmount: s.toAmount === "" || s.toAmount === null ? null : decNum(s.toAmount, undefined),
        rate: decNum(s.rate, 0),
        sortOrder: Number(s.sortOrder ?? i + 1),
      })),
    };
  }
  const row = await prisma.itConfig.update({ where: { id }, data: patch, include: { slabs: { orderBy: [{ regime: "asc" }, { sortOrder: "asc" }] } } });
  if (row.isCurrent) await prisma.itConfig.updateMany({ where: { companyId: ctx.companyId, id: { not: id } }, data: { isCurrent: false } });
  await logAudit({ action: "UPDATE", module: "incomeTax", entityType: "ItConfig", entityId: row.id, entityName: row.financialYear, companyId: ctx.companyId, userId: ctx.userId });
  return ok(row);
}

// ---------------------------------------------------------------------------
// Declarations (admin)
// ---------------------------------------------------------------------------

export async function listDeclarations(req: Request) {
  const { companyId } = await reqCtx(req, "incomeTax.read");
  const sp = new URL(req.url).searchParams;
  const financialYear = sp.get("financialYear") ?? undefined;
  const rows = await prisma.itDeclaration.findMany({
    where: { companyId, ...(financialYear ? { financialYear } : {}) },
    include: { employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, pan: true } } },
    orderBy: { employee: { employeeCode: "asc" } },
    take: 500,
  });
  return ok(rows);
}

export async function upsertDeclaration(req: Request) {
  const ctx = await reqCtx(req, "incomeTax.manage");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const employeeId = String(body.employeeId ?? "");
  const financialYear = String(body.financialYear ?? "2026-27");
  if (!employeeId) throw badRequest("employeeId is required.");
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId: ctx.companyId } });
  if (!emp) throw notFound("Employee not found.");
  const data = {
    companyId: ctx.companyId,
    employeeId,
    financialYear,
    regime: (body.regime as TaxRegime) ?? "NEW",
    section80C: decNum(body.section80C ?? 0, 0),
    section80D: decNum(body.section80D ?? 0, 0),
    nps80CCD1B: decNum(body.nps80CCD1B ?? 0, 0),
    homeLoanInterest: decNum(body.homeLoanInterest ?? 0, 0),
    hraExemption: decNum(body.hraExemption ?? 0, 0),
    otherDeductions: decNum(body.otherDeductions ?? 0, 0),
    previousEmployerIncome: decNum(body.previousEmployerIncome ?? 0, 0),
    previousEmployerTax: decNum(body.previousEmployerTax ?? 0, 0),
  };
  const row = await prisma.itDeclaration.upsert({
    where: { companyId_employeeId_financialYear: { companyId: ctx.companyId, employeeId, financialYear } },
    update: { ...data, updatedAt: new Date() },
    create: { ...data, createdBy: ctx.userId },
  });
  await logAudit({ action: "UPDATE", module: "incomeTax", entityType: "ItDeclaration", entityId: row.id, entityName: `${emp.employeeCode} · ${financialYear}`, companyId: ctx.companyId, userId: ctx.userId });
  return ok(row);
}

// ---------------------------------------------------------------------------
// Tax computation + exports
// ---------------------------------------------------------------------------

export async function taxComputation(req: Request) {
  const { companyId } = await reqCtx(req, "incomeTax.read");
  const sp = new URL(req.url).searchParams;
  const employeeId = sp.get("employeeId") ?? "";
  const financialYear = sp.get("financialYear") ?? "2026-27";
  const throughMonth = sp.get("month") ? Number(sp.get("month")) : undefined;
  if (!employeeId) throw badRequest("employeeId is required.");
  const computed = await computeTaxForEmployee(companyId, employeeId, financialYear, throughMonth);
  const declaration = await prisma.itDeclaration.findUnique({
    where: { companyId_employeeId_financialYear: { companyId, employeeId, financialYear } },
  });
  return ok({ computed, declaration });
}

export async function taxComputationSheet(req: Request, employeeId: string) {
  const { companyId } = await reqCtx(req, "incomeTax.read");
  const sp = new URL(req.url).searchParams;
  const financialYear = sp.get("financialYear") ?? "2026-27";
  const throughMonth = sp.get("month") ? Number(sp.get("month")) : undefined;
  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    include: { designation: { select: { title: true } } },
  });
  if (!emp) throw notFound("Employee not found.");
  const computed = await computeTaxForEmployee(companyId, employeeId, financialYear, throughMonth);
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const html = renderTaxComputationHtml(emp, company, computed);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function form16(req: Request, employeeId: string) {
  const { companyId } = await reqCtx(req, "incomeTax.read");
  const sp = new URL(req.url).searchParams;
  const financialYear = sp.get("financialYear") ?? "2026-27";
  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    include: { designation: { select: { title: true } } },
  });
  if (!emp) throw notFound("Employee not found.");
  const computed = await computeTaxForEmployee(companyId, employeeId, financialYear, 3);
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  const settings = await getCompanyStatutorySettings(companyId).catch(() => null);
  const payslips = await prisma.payslip.findMany({
    where: { companyId, employeeId },
    include: { components: true, run: { select: { month: true, year: true } } },
    orderBy: [{ run: { year: "asc" } }, { run: { month: "asc" } }],
  });
  const html = renderForm16Html(emp, company, settings, computed, payslips);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function form24q(req: Request) {
  const { companyId } = await reqCtx(req, "incomeTax.read");
  const sp = new URL(req.url).searchParams;
  const financialYear = sp.get("financialYear") ?? "2026-27";
  const quarter = sp.get("quarter") ? Number(sp.get("quarter")) : undefined;
  const startYear = Number(financialYear.split("-")[0]);
  const qMonths = quarter ? qMonthsOfQuarter(quarter, startYear) : undefined;
  const runs = await prisma.payrollRun.findMany({
    where: {
      companyId,
      ...(qMonths
        ? { OR: qMonths.map(([m, y]) => ({ month: m, year: y })) }
        : { OR: [...Array.from({ length: 9 }, (_, i) => ({ month: i + 4, year: startYear })), ...Array.from({ length: 3 }, (_, i) => ({ month: i + 1, year: startYear + 1 }))] }),
    },
    include: { payslips: { include: { employee: { select: { employeeCode: true, firstName: true, lastName: true, pan: true } }, components: true } } },
  });
  const csv = buildForm24qCsv(financialYear, quarter, runs, companyId);
  const filename = `form-24q-${financialYear}-Q${quarter ?? "all"}.csv`;
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}

function qMonthsOfQuarter(q: number, fyStartYear: number): Array<[number, number]> {
  // FY quarters: Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar
  switch (q) {
    case 1: return [[4, fyStartYear], [5, fyStartYear], [6, fyStartYear]];
    case 2: return [[7, fyStartYear], [8, fyStartYear], [9, fyStartYear]];
    case 3: return [[10, fyStartYear], [11, fyStartYear], [12, fyStartYear]];
    case 4: return [[1, fyStartYear + 1], [2, fyStartYear + 1], [3, fyStartYear + 1]];
    default: throw badRequest("Quarter must be between 1 and 4.");
  }
}

// ---------------------------------------------------------------------------
// Registers + exports
// ---------------------------------------------------------------------------

export async function pfRegister(req: Request) {
  const ctx = await reqCtx(req, "pf.read");
  const { month, year } = monthYear(req);
  const result = await buildPfRegister(ctx.companyId, month, year);
  return ok(result);
}

export async function pfRegisterCsv(req: Request) {
  const ctx = await reqCtx(req, "pf.read");
  const { month, year } = monthYear(req);
  const result = await buildPfRegister(ctx.companyId, month, year);
  const filename = `pf-register-${month}-${year}.csv`;
  return csvResponse(result.rows, filename);
}

export async function pfEcrCsv(req: Request) {
  const ctx = await reqCtx(req, "pf.manage");
  const { month, year } = monthYear(req);
  const result = await buildPfRegister(ctx.companyId, month, year);
  const rows = result.rows.map((r) => ({
    uan: r.uan,
    memberName: r.employeeName,
    memberContribution: r.memberContribution,
    employerEps: r.epsContribution,
    employerEpf: r.epfContribution,
    total: r.totalContribution,
    monthCode: `${year}${String(month).padStart(2, "0")}`,
  }));
  return csvResponse(rows, `ecr-${year}${String(month).padStart(2, "0")}.csv`);
}

export async function pfChallan(req: Request) {
  const ctx = await reqCtx(req, "pf.manage");
  const { month, year } = monthYear(req);
  const result = await buildPfRegister(ctx.companyId, month, year);
  const rows = [{
    pfNumber: result.rows[0]?.pfNumber ?? "",
    month: `${year}-${String(month).padStart(2, "0")}`,
    members: result.rows.length,
    employeeShare: result.totals.memberContribution,
    employerEps: result.totals.epsContribution,
    employerEpf: result.totals.epfContribution,
    totalDue: result.totals.totalContribution,
  }];
  return csvResponse(rows, `pf-challan-${month}-${year}.csv`);
}

export async function esiRegister(req: Request) {
  const ctx = await reqCtx(req, "esi.read");
  const { month, year } = monthYear(req);
  const result = await buildEsiRegister(ctx.companyId, month, year);
  return ok(result);
}

export async function esiRegisterCsv(req: Request) {
  const ctx = await reqCtx(req, "esi.read");
  const { month, year } = monthYear(req);
  const result = await buildEsiRegister(ctx.companyId, month, year);
  return csvResponse(result.rows, `esi-register-${month}-${year}.csv`);
}

export async function esiChallanCsv(req: Request) {
  const ctx = await reqCtx(req, "esi.manage");
  const { month, year } = monthYear(req);
  const result = await buildEsiRegister(ctx.companyId, month, year);
  const rows = [{
    esiNumber: result.rows[0]?.esiNumber ?? "",
    contributionPeriod: `${year}-${String(month).padStart(2, "0")}`,
    employees: result.rows.length,
    employeeShare: result.totals.employeeContribution,
    employerShare: result.totals.employerContribution,
    totalDue: result.totals.totalContribution,
  }];
  return csvResponse(rows, `esi-challan-${month}-${year}.csv`);
}

export async function esiReturnCsv(req: Request) {
  const ctx = await reqCtx(req, "esi.manage");
  const { month, year } = monthYear(req);
  const result = await buildEsiRegister(ctx.companyId, month, year);
  const rows = result.rows.map((r) => ({
    ipNumber: r.ipNumber,
    name: r.employeeName,
    esiWages: r.esiWages,
    employeeContribution: r.employeeContribution,
    employerContribution: r.employerContribution,
    total: r.totalContribution,
    monthCode: `${year}${String(month).padStart(2, "0")}`,
  }));
  return csvResponse(rows, `esi-return-${month}-${year}.csv`);
}

export async function ptRegister(req: Request) {
  const ctx = await reqCtx(req, "professionalTax.read");
  const { month, year } = monthYear(req);
  const result = await buildPtRegister(ctx.companyId, month, year);
  return ok(result);
}

export async function ptRegisterCsv(req: Request) {
  const ctx = await reqCtx(req, "professionalTax.read");
  const { month, year } = monthYear(req);
  const result = await buildPtRegister(ctx.companyId, month, year);
  return csvResponse(result.rows, `pt-register-${month}-${year}.csv`);
}

export async function ptChallanCsv(req: Request) {
  const ctx = await reqCtx(req, "professionalTax.manage");
  const { month, year } = monthYear(req);
  const result = await buildPtRegister(ctx.companyId, month, year);
  const rows = [{
    state: result.region?.state ?? "",
    month: `${year}-${String(month).padStart(2, "0")}`,
    employees: result.totals.employees,
    totalDue: result.totals.ptAmount,
  }];
  return csvResponse(rows, `pt-challan-${month}-${year}.csv`);
}

export async function lwfRegister(req: Request) {
  const ctx = await reqCtx(req, "labourWelfareFund.read");
  const { month, year } = monthYear(req);
  const result = await buildLwfRegister(ctx.companyId, month, year);
  return ok(result);
}

export async function lwfRegisterCsv(req: Request) {
  const ctx = await reqCtx(req, "labourWelfareFund.read");
  const { month, year } = monthYear(req);
  const result = await buildLwfRegister(ctx.companyId, month, year);
  return csvResponse(result.rows, `lwf-register-${month}-${year}.csv`);
}

export async function tdsRegister(req: Request) {
  const ctx = await reqCtx(req, "incomeTax.read");
  const { month, year } = monthYear(req);
  const result = await buildTdsRegister(ctx.companyId, month, year);
  return ok(result);
}

export async function tdsRegisterCsv(req: Request) {
  const ctx = await reqCtx(req, "incomeTax.read");
  const { month, year } = monthYear(req);
  const result = await buildTdsRegister(ctx.companyId, month, year);
  return csvResponse(result.rows, `tds-register-${month}-${year}.csv`);
}

export async function applyTdsToRun(req: Request, runId: string) {
  const ctx = await reqCtx(req, "incomeTax.manage");
  const result = await applyMonthlyTds(ctx.companyId, runId, ctx.userId);
  return ok(result);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function dashboard(req: Request) {
  const { companyId } = await reqCtx(req, "compliances.read");
  const sp = new URL(req.url).searchParams;
  const month = sp.get("month") ? Number(sp.get("month")) : new Date().getMonth() + 1;
  const year = sp.get("year") ? Number(sp.get("year")) : new Date().getFullYear();
  const result = await complianceDashboard(companyId, month, year);
  return ok(result);
}

// ---------------------------------------------------------------------------
// ESS — self-service income tax
// ---------------------------------------------------------------------------

async function selfTaxContext(permission: string) {
  const session = await auth();
  if (!session?.user) throw forbidden("Please sign in.");
  if (!session.user.employeeId) throw forbidden("Your account is not linked to an employee profile.");
  await requirePermission(permission);
  const companyId = requireCompanyId(session.user.companyId);
  return { userId: session.user.id, companyId, employeeId: session.user.employeeId };
}

export async function myTax(req: Request) {
  const ctx = await selfTaxContext("incomeTax.read");
  const sp = new URL(req.url).searchParams;
  const financialYear = sp.get("financialYear") ?? "2026-27";
  const throughMonth = sp.get("month") ? Number(sp.get("month")) : undefined;
  const declaration = await prisma.itDeclaration.findUnique({
    where: { companyId_employeeId_financialYear: { companyId: ctx.companyId, employeeId: ctx.employeeId, financialYear } },
  });
  const computed = await computeTaxForEmployee(ctx.companyId, ctx.employeeId, financialYear, throughMonth);
  return ok({ computed, declaration });
}

export async function updateMyDeclaration(req: Request) {
  const ctx = await selfTaxContext("incomeTax.update");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const financialYear = String(body.financialYear ?? "2026-27");
  const data = {
    section80C: decNum(body.section80C ?? 0, 0),
    section80D: decNum(body.section80D ?? 0, 0),
    nps80CCD1B: decNum(body.nps80CCD1B ?? 0, 0),
    homeLoanInterest: decNum(body.homeLoanInterest ?? 0, 0),
    hraExemption: decNum(body.hraExemption ?? 0, 0),
    otherDeductions: decNum(body.otherDeductions ?? 0, 0),
    previousEmployerIncome: decNum(body.previousEmployerIncome ?? 0, 0),
    previousEmployerTax: decNum(body.previousEmployerTax ?? 0, 0),
  };
  const regime = ((body.regime as TaxRegime) ?? "NEW") as TaxRegime;
  const row = await prisma.itDeclaration.upsert({
    where: { companyId_employeeId_financialYear: { companyId: ctx.companyId, employeeId: ctx.employeeId, financialYear } },
    update: { ...data, regime, updatedAt: new Date() },
    create: { ...data, regime, companyId: ctx.companyId, employeeId: ctx.employeeId, financialYear, createdBy: ctx.userId },
  });
  await logAudit({ action: "UPDATE", module: "incomeTax", entityType: "ItDeclaration", entityId: row.id, entityName: `Self-service declaration · ${financialYear}`, companyId: ctx.companyId, userId: ctx.userId });
  const computed = await computeTaxForEmployee(ctx.companyId, ctx.employeeId, financialYear);
  return ok({ declaration: row, computed });
}

export async function myTaxSheet(req: Request) {
  const ctx = await selfTaxContext("incomeTax.read");
  const sp = new URL(req.url).searchParams;
  const financialYear = sp.get("financialYear") ?? "2026-27";
  const throughMonth = sp.get("month") ? Number(sp.get("month")) : undefined;
  const emp = await prisma.employee.findFirst({
    where: { id: ctx.employeeId, companyId: ctx.companyId },
    include: { designation: { select: { title: true } } },
  });
  if (!emp) throw notFound("Employee not found.");
  const computed = await computeTaxForEmployee(ctx.companyId, ctx.employeeId, financialYear, throughMonth);
  const company = await prisma.company.findUnique({ where: { id: ctx.companyId } });
  return new Response(renderTaxComputationHtml(emp, company, computed), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function myForm16(req: Request) {
  const ctx = await selfTaxContext("incomeTax.read");
  const sp = new URL(req.url).searchParams;
  const financialYear = sp.get("financialYear") ?? "2026-27";
  const emp = await prisma.employee.findFirst({
    where: { id: ctx.employeeId, companyId: ctx.companyId },
    include: { designation: { select: { title: true } } },
  });
  if (!emp) throw notFound("Employee not found.");
  const computed = await computeTaxForEmployee(ctx.companyId, ctx.employeeId, financialYear, 3);
  const company = await prisma.company.findUnique({ where: { id: ctx.companyId } });
  const settings = await getCompanyStatutorySettings(ctx.companyId).catch(() => null);
  const payslips = await prisma.payslip.findMany({
    where: { companyId: ctx.companyId, employeeId: ctx.employeeId },
    include: { components: true, run: { select: { month: true, year: true } } },
    orderBy: [{ run: { year: "asc" } }, { run: { month: "asc" } }],
  });
  return new Response(renderForm16Html(emp, company, settings, computed, payslips), { headers: { "Content-Type": "text/html; charset=utf-8" } });
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

function monthYear(req: Request): { month: number; year: number } {
  const sp = new URL(req.url).searchParams;
  const month = sp.get("month") ? Number(sp.get("month")) : new Date().getMonth() + 1;
  const year = sp.get("year") ? Number(sp.get("year")) : new Date().getFullYear();
  return { month, year };
}

function decNum(v: unknown, fallback?: number): Prisma.Decimal {
  if (v === undefined || v === null || v === "") {
    if (fallback === undefined) throw badRequest("A numeric value is required.");
    return dec(fallback);
  }
  return dec(Number(v));
}

function csvResponse(rows: Array<Record<string, unknown>>, filename: string): Response {
  return new Response(toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"` },
  });
}