import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireCompanyId } from "@/lib/authz";
import { ok, created } from "@/lib/api";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import {
  REPORT_OBJECTS,
  fetchReportRows,
  runReportType,
  selectColumns,
  serializeReport,
  reportTypeFromParam,
  reportObjectFromParam,
  type ReportRow,
} from "@/server/services/reporting";
import { ReportFormat, ReportObject, ReportType, Prisma } from "@prisma/client";

async function reqCtx(req: Request, permission: string) {
  const session = await auth();
  if (!session?.user) throw forbidden("Please sign in.");
  await requirePermission(permission);
  const companyId = requireCompanyId(session.user.companyId);
  void req;
  return { userId: session.user.id, companyId };
}

function buildFilterMap(sp: URLSearchParams): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  for (const [key, value] of sp.entries()) {
    if (["object", "columns", "format", "type"].includes(key)) continue;
    filters[key] = value;
  }
  if (sp.has("periodFrom") || sp.has("periodTo")) {
    filters.period = {
      ...(sp.get("periodFrom") ? { from: sp.get("periodFrom") } : {}),
      ...(sp.get("periodTo") ? { to: sp.get("periodTo") } : {}),
    };
    delete filters.periodFrom;
    delete filters.periodTo;
  }
  return filters;
}

function download(rows: ReportRow[], format: ReportFormat, sheetName: string) {
  const out = serializeReport(rows, format, sheetName);
  return new Response(out.body, {
    headers: {
      "Content-Type": out.mime,
      "Content-Disposition": `attachment; filename="${sheetName.replace(/[^\w -]/g, "").slice(0, 40)}.${out.ext}"`,
    },
  });
}

// ---------------------------------------------------------------------------
// Standard reports (PAYROLL / COMPLIANCE / HR)
// ---------------------------------------------------------------------------

export async function runReport(req: Request, typeParam: string) {
  const { companyId } = await reqCtx(req, "reports.read");
  const type = reportTypeFromParam(typeParam);
  const sp = new URL(req.url).searchParams;
  const filters = buildFilterMap(sp);
  const format = sp.get("format");

  const result = await runReportType(companyId, type, filters);
  const { rows, summary } = result;

  if (format) {
    const f = Object.values(ReportFormat).includes(format as ReportFormat) ? (format as ReportFormat) : undefined;
    if (f) {
      return download(selectColumns(rows, rows[0] ? Object.keys(rows[0]) : []), f, `${type} Report`);
    }
  }

  return ok({ rows, summary, type });
}

// ---------------------------------------------------------------------------
// Query builder — generic object query
// ---------------------------------------------------------------------------

export async function queryBuilder(req: Request) {
  const { companyId } = await reqCtx(req, "adminTools.read");
  const sp = new URL(req.url).searchParams;
  const object = reportObjectFromParam(sp.get("object") ?? "employees");
  const filters = buildFilterMap(sp);
  const columns = sp.get("columns");

  const allRows = await fetchReportRows(companyId, object, filters);
  const keys = columns
    ? columns.split(",").map((c) => c.trim()).filter(Boolean)
    : Object.keys(allRows[0] ?? {});

  const schemaColumns = REPORT_OBJECTS[object].columns;
  const selected = keys.filter((k) => schemaColumns.some((c) => c.key === k));

  const rows = selectColumns(allRows, selected);
  return ok({ object, rows, columns: selected.length ? selected : keys, total: rows.length });
}

export async function getQuerySchema(req: Request) {
  await reqCtx(req, "adminTools.read");
  return ok(REPORT_OBJECTS);
}

// ---------------------------------------------------------------------------
// Saved reports (report designer)
// ---------------------------------------------------------------------------

export async function listSavedReports(req: Request) {
  const { companyId } = await reqCtx(req, "savedReports.read");
  const rows = await prisma.savedReport.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 200 });
  return ok(rows);
}

export async function createSavedReport(req: Request) {
  const ctx = await reqCtx(req, "savedReports.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { name, description, reportType, object, columns, filters, groupBy, sortBy, sortOrder } = body as Record<string, unknown>;
  if (!name || !reportType || !object) throw badRequest("name, reportType and object are required.");
  const type = reportTypeFromParam(String(reportType));
  const obj = reportObjectFromParam(String(object));
  if (!Array.isArray(columns) || columns.length === 0) throw badRequest("At least one column is required.");

  const row = await prisma.savedReport.create({
    data: {
      companyId: ctx.companyId,
      name: String(name),
      description: description ? String(description) : null,
      reportType: type,
      object: obj,
      columns: columns as string[],
      filters: (filters ?? {}) as Prisma.InputJsonValue,
      groupBy: groupBy ? String(groupBy) : null,
      sortBy: sortBy ? String(sortBy) : null,
      sortOrder: sortOrder ? String(sortOrder) : "asc",
      createdBy: ctx.userId,
    },
  });
  await logAudit({ action: "CREATE", module: "savedReports", entityType: "SavedReport", entityId: row.id, companyId: ctx.companyId, userId: ctx.userId });
  return created(row);
}

export async function getSavedReport(req: Request, id: string) {
  const { companyId } = await reqCtx(req, "savedReports.read");
  const row = await prisma.savedReport.findFirst({ where: { id, companyId } });
  if (!row) throw notFound("Saved report not found.");
  return ok(row);
}

export async function updateSavedReport(req: Request, id: string) {
  const ctx = await reqCtx(req, "savedReports.update");
  const row = await prisma.savedReport.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!row) throw notFound("Saved report not found.");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { name, description, columns, filters, groupBy, sortBy, sortOrder } = body as Record<string, unknown>;
  const updated = await prisma.savedReport.update({
    where: { id },
    data: {
      ...(name ? { name: String(name) } : {}),
      description: description !== undefined ? (description ? String(description) : null) : undefined,
      ...(Array.isArray(columns) && columns.length ? { columns: columns as string[] } : {}),
      ...(filters !== undefined ? { filters: filters as Prisma.InputJsonValue } : {}),
      groupBy: groupBy !== undefined ? (groupBy ? String(groupBy) : null) : undefined,
      sortBy: sortBy !== undefined ? (sortBy ? String(sortBy) : null) : undefined,
      ...(sortOrder ? { sortOrder: String(sortOrder) } : {}),
    },
  });
  await logAudit({ action: "UPDATE", module: "savedReports", entityType: "SavedReport", entityId: id, companyId: ctx.companyId, userId: ctx.userId });
  return ok(updated);
}

export async function deleteSavedReport(req: Request, id: string) {
  const ctx = await reqCtx(req, "savedReports.delete");
  const row = await prisma.savedReport.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!row) throw notFound("Saved report not found.");
  await prisma.savedReport.delete({ where: { id } });
  await logAudit({ action: "DELETE", module: "savedReports", entityType: "SavedReport", entityId: id, companyId: ctx.companyId, userId: ctx.userId });
  return ok({ id, deleted: true });
}

export async function runSavedReport(req: Request, id: string) {
  const { companyId } = await reqCtx(req, "savedReports.read");
  const sp = new URL(req.url).searchParams;
  const format = sp.get("format");
  const row = await prisma.savedReport.findFirst({ where: { id, companyId } });
  if (!row) throw notFound("Saved report not found.");

  const overrides = buildFilterMap(sp);
  const filters = { ...(row.filters as Record<string, unknown>), ...overrides };

  const raw = await fetchReportRows(companyId, row.object, filters);
  const selected = selectColumns(raw, row.columns as string[]);

  if (format) {
    const f = Object.values(ReportFormat).includes(format as ReportFormat) ? (format as ReportFormat) : undefined;
    if (f) return download(selected, f, row.name);
  }
  return ok({ rows: selected, columns: row.columns, filters, object: row.object, reportType: row.reportType });
}

// ---------------------------------------------------------------------------
// Exports for saved report definitions / datasets
// ---------------------------------------------------------------------------

export async function exportReport(req: Request, typeParam: string) {
  const { companyId } = await reqCtx(req, "reports.read");
  const type = reportTypeFromParam(typeParam);
  const sp = new URL(req.url).searchParams;
  const filters = buildFilterMap(sp);
  const format = (sp.get("format") ?? "EXCEL") as ReportFormat;
  if (!Object.values(ReportFormat).includes(format)) throw badRequest("Invalid format.");

  const result = await runReportType(companyId, type, filters);
  const keys = result.rows[0] ? Object.keys(result.rows[0]) : [];
  return download(selectColumns(result.rows, keys), format, `${type} Report`);
}

export async function exportObject(req: Request) {
  const { companyId } = await reqCtx(req, "adminTools.read");
  const sp = new URL(req.url).searchParams;
  const object = reportObjectFromParam(sp.get("object") ?? "employees");
  const filters = buildFilterMap(sp);
  const format = (sp.get("format") ?? "EXCEL") as ReportFormat;
  const name = sp.get("name") ?? String(object);
  if (!Object.values(ReportFormat).includes(format)) throw badRequest("Invalid format.");

  const raw = await fetchReportRows(companyId, object, filters);
  const keys = raw[0] ? Object.keys(raw[0]) : [];
  const selected = selectColumns(raw, keys);
  return download(selected, format, name);
}

export type { ReportObject, ReportType };