import { prisma } from "@/lib/prisma";
import { requireCompanyId, requirePermission } from "@/lib/authz";
import { badRequest, notFound } from "@/lib/errors";
import { created, ok } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { statusUpdateSchema } from "@/lib/validations/lifecycle";
import type { AuditAction } from "@/lib/audit";
import { logEmployeeAudit } from "@/server/services/employee";

interface DelegateLike {
  findMany: (args?: unknown) => Promise<unknown[]>;
  findUnique: (args?: unknown) => Promise<unknown>;
  count: (args?: { where?: Record<string, unknown> }) => Promise<number>;
  create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
}

export interface SlaveSpec {
  /** Permission module key. */
  slug: string;
  model: string;
  entityType: string;
  include?: Record<string, unknown>;
  schema?: (data: unknown) => Record<string, unknown>;
  /** Hook that runs after a record transitions to APPROVED. */
  onApprove?: (row: Record<string, unknown>, ctx: { userId: string; companyId: string }) => Promise<void>;
  onReject?: (row: Record<string, unknown>, ctx: { userId: string; companyId: string }) => Promise<void>;
}

export interface SlaveController {
  list: (req: Request, employeeId: string) => Promise<ReturnType<typeof ok>>;
  create: (req: Request, employeeId: string) => Promise<ReturnType<typeof created>>;
  get: (req: Request, employeeId: string, recordId: string) => Promise<ReturnType<typeof ok>>;
  update: (req: Request, employeeId: string, recordId: string) => Promise<ReturnType<typeof ok>>;
  remove: (req: Request, employeeId: string, recordId: string) => Promise<ReturnType<typeof ok>>;
}

export function buildSlaveController(spec: SlaveSpec): SlaveController {
  const delegate = (prisma as unknown as Record<string, DelegateLike>)[spec.model];

  return {
    async list(req, employeeId) {
      const ctx = await requirePermission(`${spec.slug}.read`);
      const companyId = requireCompanyId(ctx.companyId);
      const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId }, select: { id: true } });
      if (!employee) throw notFound("Employee not found.");
      const url = new URL(req.url);
      const page = Math.max(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1);
      const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20, 1), 500);
      const where = { employeeId, companyId };
      const [total, rows] = await Promise.all([
        delegate.count({ where }),
        delegate.findMany({ where, include: spec.include, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      ]);
      return ok(rows as unknown[], { page, pageSize, total, pageCount: Math.ceil(total / pageSize) });
    },

    async create(req, employeeId) {
      const ctx = await requirePermission(`${spec.slug}.create`);
      const companyId = requireCompanyId(ctx.companyId);
      const employee = await prisma.employee.findFirst({
        where: { id: employeeId, companyId },
        select: { id: true, firstName: true, lastName: true },
      });
      if (!employee) throw notFound("Employee not found.");
      const body = await req.json().catch(() => {
        throw badRequest("Invalid JSON body.");
      });
      const data = spec.schema ? spec.schema(body) : (body as Record<string, unknown>);
      const payload: Record<string, unknown> = { ...data, employeeId, companyId };
      const row = (await delegate.create({ data: payload })) as Record<string, unknown>;
      await logEmployeeAudit({
        employeeId,
        companyId,
        userId: ctx.userId,
        module: spec.slug,
        entityType: spec.entityType,
        entityId: row.id as string,
        entityName: `${spec.entityType}`,
        action: "CREATE",
        afterState: row,
      });
      return created(row);
    },

    async get(_req, employeeId, recordId) {
      const ctx = await requirePermission(`${spec.slug}.read`);
      const companyId = requireCompanyId(ctx.companyId);
      const row = (await delegate.findUnique({ where: { id: recordId }, include: spec.include })) as
        | (Record<string, unknown> & { employeeId?: string; companyId?: string })
        | null;
      if (!row || row.employeeId !== employeeId || row.companyId !== companyId) throw notFound(`${spec.entityType} not found.`);
      return ok(row);
    },

    async update(req, employeeId, recordId) {
      const ctx = await requirePermission(`${spec.slug}.update`);
      const companyId = requireCompanyId(ctx.companyId);
      const row = (await delegate.findUnique({ where: { id: recordId } })) as
        | (Record<string, unknown> & { employeeId?: string; companyId?: string; status?: string })
        | null;
      if (!row || row.employeeId !== employeeId || row.companyId !== companyId) throw notFound(`${spec.entityType} not found.`);

      const body = (await req.json().catch(() => {
        throw badRequest("Invalid JSON body.");
      })) as Record<string, unknown>;

      let data: Record<string, unknown>;
      let auditAction: AuditAction = "UPDATE";
      if (body.status) {
        const parsed = statusUpdateSchema.safeParse({ status: body.status, remarks: body.remarks ?? null });
        if (!parsed.success) throw badRequest("Invalid status update.");
        data = { status: parsed.data.status, notes: body.remarks ?? null };
        if (String(parsed.data.status) === "APPROVED") {
          await requirePermission(`${spec.slug}.manage`);
          auditAction = "APPROVE";
        } else if (String(parsed.data.status) === "REJECTED") {
          await requirePermission(`${spec.slug}.manage`);
          auditAction = "REJECT";
        }
      } else {
        data = body;
      }

      const updated = (await delegate.update({ where: { id: recordId }, data })) as Record<string, unknown>;

      if (String(updated.status) === "APPROVED") await spec.onApprove?.(updated, { userId: ctx.userId, companyId });
      if (String(updated.status) === "REJECTED") await spec.onReject?.(updated, { userId: ctx.userId, companyId });

      await logEmployeeAudit({
        employeeId,
        companyId,
        userId: ctx.userId,
        module: spec.slug,
        entityType: spec.entityType,
        entityId: recordId,
        entityName: `${spec.entityType}`,
        action: auditAction,
        beforeState: row,
        afterState: updated,
      });
      return ok(updated);
    },

    async remove(_req, employeeId, recordId) {
      const ctx = await requirePermission(`${spec.slug}.delete`);
      const companyId = requireCompanyId(ctx.companyId);
      const row = (await delegate.findUnique({ where: { id: recordId } })) as
        | (Record<string, unknown> & { employeeId?: string; companyId?: string })
        | null;
      if (!row || row.employeeId !== employeeId || row.companyId !== companyId) throw notFound(`${spec.entityType} not found.`);
      await (delegate as unknown as { delete: (a: { where: Record<string, unknown> }) => Promise<unknown> }).delete({ where: { id: recordId } });
      await logEmployeeAudit({
        employeeId,
        companyId,
        userId: ctx.userId,
        module: spec.slug,
        entityType: spec.entityType,
        entityId: recordId,
        action: "DELETE",
        beforeState: row,
      });
      return ok({ id: recordId, deleted: true });
    },
  };
}