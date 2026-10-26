import { prisma } from "@/lib/prisma";
import { requireCompanyId, requirePermission } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { badRequest, notFound } from "@/lib/errors";
import { created, ok } from "@/lib/api";
import { getModule, type ModuleDef } from "@/config/modules";
import { buildModuleSchema } from "@/lib/validations/setup";
import type { Prisma } from "@prisma/client";

interface DelegateLike {
  findMany: (args?: unknown) => Promise<unknown[]>;
  findUnique: (args?: unknown) => Promise<unknown>;
  count: (args?: { where?: Record<string, unknown> }) => Promise<number>;
  create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  delete: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown>>;
}

export interface ResourceSpec {
  /** URL slug + permission module key. */
  slug: string;
  /** Key of the model on the Prisma client, e.g. `branch`. */
  model: string;
  /** `false` for platform-level resources (companies) that are not tenant-scoped. */
  tenantScoped?: boolean;
  /** DELETE performs a soft archive (isActive=false) instead of a hard delete. */
  archivable?: boolean;
}

export interface ResourceController {
  list: (req: Request) => Promise<ReturnType<typeof ok>>;
  create: (req: Request) => Promise<ReturnType<typeof created>>;
  get: (req: Request, id: string) => Promise<ReturnType<typeof ok>>;
  update: (req: Request, id: string) => Promise<ReturnType<typeof ok>>;
  remove: (req: Request, id: string) => Promise<ReturnType<typeof ok>>;
}

interface JsonRow {
  id?: string;
  [key: string]: unknown;
}

export function buildResourceController(spec: ResourceSpec): ResourceController {
  const module = getModule(spec.slug);
  if (!module) throw new Error(`No module definition found for "${spec.slug}"`);
  const tenantScoped = spec.tenantScoped ?? true;

  const delegate = (prisma as unknown as Record<string, DelegateLike>)[spec.model];
  const mod: ModuleDef = module;
  const createSchema = buildModuleSchema(module.fields, "create");
  const updateSchema = buildModuleSchema(module.fields, "update");
  const include = buildIncludes(module);

  function rowLabel(row: JsonRow): string | null {
    const t = row[mod.titleField];
    return typeof t === "string" ? t : row.name ? `${row.name}` : row.id ?? null;
  }

  return {
    async list(req) {
      const ctx = await requirePermission(`${spec.slug}.read`);
      const companyId = tenantScoped ? requireCompanyId(ctx.companyId) : "unscoped";

      const url = new URL(req.url);
      const page = Math.max(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1);
      const pageSize = Math.min(Math.max(parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20, 1), 500);
      const search = url.searchParams.get("search")?.trim() ?? "";

      const where: Record<string, unknown> = tenantScoped ? { companyId } : {};
      if (spec.archivable) where.isActive = true;
      if (search) {
        where.OR = module.searchFields.map((f) => ({ [f]: { contains: search, mode: "insensitive" } }));
      }

      const [total, rows] = await Promise.all([
        delegate.count({ where }),
        delegate.findMany({ where, include, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      ]);

      const pageCount = Math.ceil(total / pageSize);
      return ok(rows as unknown[], { page, pageSize, total, pageCount });
    },

    async create(req) {
      const ctx = await requirePermission(`${spec.slug}.create`);
      const companyId = tenantScoped ? requireCompanyId(ctx.companyId) : null;
      const body = await req.json().catch(() => {
        throw badRequest("Invalid JSON body.");
      });
      const data = createSchema.parse(body) as Record<string, unknown>;
      if (tenantScoped) data.companyId = companyId;
      const row = (await delegate.create({ data })) as JsonRow;
      await logAudit({
        action: "CREATE",
        module: spec.slug,
        entityType: module.singular,
        entityId: row.id,
        entityName: rowLabel(row),
        companyId: companyId ?? ctx.companyId,
        userId: ctx.userId,
        afterState: row as Prisma.InputJsonValue,
      });
      return created(row as Record<string, unknown>);
    },

    async get(_req, id) {
      const ctx = await requirePermission(`${spec.slug}.read`);
      const companyId = tenantScoped ? requireCompanyId(ctx.companyId) : null;
      const row = (await delegate.findUnique({ where: { id }, include })) as JsonRow | null;
      if (!row || (tenantScoped && row.companyId !== companyId)) throw notFound(`${module.singular} not found.`);
      return ok(row as Record<string, unknown>);
    },

    async update(req, id) {
      const ctx = await requirePermission(`${spec.slug}.update`);
      const companyId = tenantScoped ? requireCompanyId(ctx.companyId) : null;
      const existing = (await delegate.findUnique({ where: { id } })) as JsonRow | null;
      if (!existing || (tenantScoped && existing.companyId !== companyId)) throw notFound(`${module.singular} not found.`);
      const body = await req.json().catch(() => {
        throw badRequest("Invalid JSON body.");
      });
      const data = updateSchema.parse(body) as Record<string, unknown>;
      const patches: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        patches[k] = v === "" ? null : v;
      }
      const row = (await delegate.update({ where: { id }, data: patches })) as JsonRow;
      await logAudit({
        action: "UPDATE",
        module: spec.slug,
        entityType: module.singular,
        entityId: row.id,
        entityName: rowLabel(row),
        companyId: companyId ?? ctx.companyId,
        userId: ctx.userId,
        beforeState: existing as Prisma.InputJsonValue,
        afterState: row as Prisma.InputJsonValue,
      });
      return ok(row as Record<string, unknown>);
    },

    async remove(_req, id) {
      const ctx = await requirePermission(`${spec.slug}.delete`);
      const companyId = tenantScoped ? requireCompanyId(ctx.companyId) : null;
      const existing = (await delegate.findUnique({ where: { id } })) as JsonRow | null;
      if (!existing || (tenantScoped && existing.companyId !== companyId)) throw notFound(`${module.singular} not found.`);

      if (spec.archivable) {
        const row = (await delegate.update({ where: { id }, data: { isActive: false, archivedAt: new Date() } as unknown as Record<string, never> })) as JsonRow;
        await logAudit({
          action: "UPDATE",
          module: spec.slug,
          entityType: module.singular,
          entityId: row.id,
          entityName: rowLabel(row),
          companyId: companyId ?? ctx.companyId,
          userId: ctx.userId,
          metadata: { archived: true },
        });
        return ok({ id, archived: true } as unknown as Record<string, unknown>);
      }

      const row = (await delegate.delete({ where: { id } })) as JsonRow;
      await logAudit({
        action: "DELETE",
        module: spec.slug,
        entityType: module.singular,
        entityId: row.id,
        entityName: rowLabel(row),
        companyId: companyId ?? ctx.companyId,
        userId: ctx.userId,
        beforeState: row as Prisma.InputJsonValue,
      });
      return ok({ id, deleted: true } as unknown as Record<string, unknown>);
    },
  };
}

function buildIncludes(module: ModuleDef) {
  const include: Record<string, unknown> = {};
  for (const f of module.fields) {
    if (!f.resource) continue;
    const rel = f.name.replace(/Id$/, "");
    const target = getModule(f.resource);
    const select: Record<string, boolean> = { id: true };
    if (target) select[target.titleField] = true;
    include[rel] = { select };
  }
  return Object.keys(include).length ? include : undefined;
}