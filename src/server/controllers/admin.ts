import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireCompanyId } from "@/lib/authz";
import { ok, created } from "@/lib/api";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import { fetchAnalytics } from "@/server/services/analytics";
import {
  bulkCreateEmployees,
  emailPayslips,
  listScheduledReports,
  createScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
  runScheduledReportNow,
  exportTenantData,
  restoreTenantData,
} from "@/server/services/admin";

async function reqCtx(req: Request, permission: string) {
  const session = await auth();
  if (!session?.user) throw forbidden("Please sign in.");
  await requirePermission(permission);
  const companyId = requireCompanyId(session.user.companyId);
  void req;
  return { userId: session.user.id, companyId };
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export async function analyticsEndpoint(_req: Request) {
  const { companyId } = await reqCtx(_req, "analytics.read");
  const data = await fetchAnalytics(companyId);
  return ok(data);
}

// ---------------------------------------------------------------------------
// Bulk upload employees
// ---------------------------------------------------------------------------

export async function bulkUploadEmployees(req: Request) {
  const ctx = await reqCtx(req, "adminTools.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { rows } = body as { rows?: Array<Record<string, unknown>> };
  if (!Array.isArray(rows) || !rows.length) throw badRequest("A 'rows' array is required (max 500).");
  const result = await bulkCreateEmployees(ctx.companyId, ctx.userId, rows as never);
  return ok(result, { created: result.created, errors: result.errors.length });
}

// ---------------------------------------------------------------------------
// Email payslips
// ---------------------------------------------------------------------------

export async function emailPayslipsEndpoint(req: Request) {
  const ctx = await reqCtx(req, "adminTools.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { year, month, employeeIds } = body as { year: number; month: number; employeeIds?: string[] };
  if (!year || !month) throw badRequest("year and month are required.");
  const result = await emailPayslips(ctx.companyId, ctx.userId, { year, month, employeeIds });
  return ok(result);
}

// ---------------------------------------------------------------------------
// Scheduled reports
// ---------------------------------------------------------------------------

export async function listScheduledReportsEndpoint(_req: Request) {
  const { companyId } = await reqCtx(_req, "scheduledReports.read");
  return ok(await listScheduledReports(companyId));
}

export async function createScheduledReportEndpoint(req: Request) {
  const ctx = await reqCtx(req, "scheduledReports.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const row = await createScheduledReport(ctx.companyId, ctx.userId, body);
  return created(row);
}

export async function updateScheduledReportEndpoint(req: Request, id: string) {
  const ctx = await reqCtx(req, "scheduledReports.update");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  return ok(await updateScheduledReport(ctx.companyId, ctx.userId, id, body));
}

export async function deleteScheduledReportEndpoint(_req: Request, id: string) {
  const ctx = await reqCtx(_req, "scheduledReports.delete");
  return ok(await deleteScheduledReport(ctx.companyId, id));
}

export async function runScheduledReportEndpoint(_req: Request, id: string) {
  const ctx = await reqCtx(_req, "scheduledReports.manage");
  const result = await runScheduledReportNow(ctx.companyId, ctx.userId, id);
  return ok(result);
}

// ---------------------------------------------------------------------------
// Backup & restore
// ---------------------------------------------------------------------------

export async function backupTenant(_req: Request) {
  const { companyId } = await reqCtx(_req, "adminTools.manage");
  const data = await exportTenantData(companyId);
  const json = JSON.stringify(data, null, 2);
  return new Response(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="backup-${(data as Record<string, unknown>).company}-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

export async function restoreTenant(req: Request) {
  const ctx = await reqCtx(req, "adminTools.manage");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  if (!body.company || !body.company.id) throw badRequest("Invalid backup: missing company.");
  if (body.company.id !== ctx.companyId) throw badRequest("Backup is for a different tenant.");
  const result = await restoreTenantData(ctx.companyId, body);
  await logAudit({
    action: "CREATE",
    module: "adminTools",
    entityType: "BackupRestore",
    entityId: "restore",
    companyId: ctx.companyId,
    userId: ctx.userId,
    metadata: result,
  });
  return ok(result);
}

// ---------------------------------------------------------------------------
// Email deliveries list
// ---------------------------------------------------------------------------

export async function listEmailDeliveries(_req: Request) {
  const { companyId } = await reqCtx(_req, "emailDeliveries.read");
  const sp = new URL(_req.url).searchParams;
  const status = sp.get("status");
  const rows = await prisma.emailDelivery.findMany({
    where: { companyId, ...(status ? { status: status as never } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return ok(rows);
}

// ---------------------------------------------------------------------------
// System health (lightweight for admin dashboard)
// ---------------------------------------------------------------------------

export async function systemHealth(_req: Request) {
  const { companyId } = await reqCtx(_req, "dashboard.read");
  const [employeeCount, pendingReimbursements, pendingLeave, activeLoans, scheduledReportCount, pendingEmails, assetCount] = await Promise.all([
    prisma.employee.count({ where: { companyId } }),
    prisma.reimbursement.count({ where: { companyId, status: "SUBMITTED" } }),
    prisma.leaveRequest.count({ where: { companyId, status: "PENDING" } }),
    prisma.loan.count({ where: { companyId, status: { in: ["APPROVED", "ACTIVE"] } } }),
    prisma.scheduledReport.count({ where: { companyId, enabled: true } }),
    prisma.emailDelivery.count({ where: { companyId, status: "PENDING" } }),
    prisma.asset.count({ where: { companyId, status: "ALLOCATED" } }),
  ]);

  return ok({
    employeeCount,
    pendingReimbursements,
    pendingLeave,
    activeLoans,
    scheduledReportCount,
    pendingEmails,
    allocatedAssets: assetCount,
  });
}
