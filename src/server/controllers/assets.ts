import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireCompanyId } from "@/lib/authz";
import { ok, created } from "@/lib/api";
import { badRequest, forbidden, notFound } from "@/lib/errors";
import { logAudit } from "@/lib/audit";
import {
  ensureUniqueTag,
  nextAssetTag,
  validateAssetCategory,
  assignAsset,
  returnAsset,
} from "@/server/services/assets";
import { Prisma } from "@prisma/client";

async function reqCtx(req: Request, permission: string) {
  const session = await auth();
  if (!session?.user) throw forbidden("Please sign in.");
  await requirePermission(permission);
  const companyId = requireCompanyId(session.user.companyId);
  void req;
  return { userId: session.user.id, companyId };
}

const employeeSelect = { id: true, firstName: true, lastName: true, employeeCode: true } as const;

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export async function listAssets(req: Request) {
  const { companyId } = await reqCtx(req, "assets.read");
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const category = sp.get("category");
  const q = sp.get("q");
  const rows = await prisma.asset.findMany({
    where: {
      companyId,
      ...(status ? { status: status as never } : {}),
      ...(category ? { category: category as never } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { assetTag: { contains: q, mode: "insensitive" } },
              { serialNumber: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      assignments: {
        where: { status: "ACTIVE" },
        include: { employee: { select: employeeSelect } },
        take: 1,
      },
      _count: { select: { assignments: true } },
    },
    orderBy: { assetTag: "asc" },
    take: 500,
  });
  return ok(rows);
}

export async function getAsset(req: Request, id: string) {
  const { companyId } = await reqCtx(req, "assets.read");
  const asset = await prisma.asset.findFirst({
    where: { id, companyId },
    include: {
      assignments: {
        include: {
          employee: { select: { ...employeeSelect, department: { select: { name: true } } } },
        },
        orderBy: { assignedAt: "desc" },
      },
    },
  });
  if (!asset) throw notFound("Asset not found.");
  return ok(asset);
}

export async function createAsset(req: Request) {
  const ctx = await reqCtx(req, "assets.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { category, assetTag, name, serialNumber, model, purchaseDate, purchaseValue, warrantyUntil, condition, notes } =
    body as Record<string, unknown>;
  if (!category || !name) throw badRequest("category and name are required.");

  const normalizedTag = assetTag ? String(assetTag) : await nextAssetTag(ctx.companyId);
  await ensureUniqueTag(ctx.companyId, normalizedTag);

  const row = await prisma.asset.create({
    data: {
      companyId: ctx.companyId,
      category: await validateAssetCategory(String(category)),
      assetTag: normalizedTag,
      name: String(name),
      serialNumber: serialNumber ? String(serialNumber) : null,
      model: model ? String(model) : null,
      purchaseDate: purchaseDate ? new Date(String(purchaseDate)) : null,
      purchaseValue: purchaseValue ? new Prisma.Decimal(Number(purchaseValue)) : null,
      warrantyUntil: warrantyUntil ? new Date(String(warrantyUntil)) : null,
      condition: condition ? String(condition) : null,
      notes: notes ? String(notes) : null,
      createdBy: ctx.userId,
    },
  });
  await logAudit({ action: "CREATE", module: "assets", entityType: "Asset", entityId: row.id, companyId: ctx.companyId, userId: ctx.userId });
  return created(row);
}

export async function updateAsset(req: Request, id: string) {
  const ctx = await reqCtx(req, "assets.update");
  const asset = await prisma.asset.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!asset) throw notFound("Asset not found.");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { assetTag, category, name, serialNumber, model, purchaseDate, purchaseValue, warrantyUntil, condition, notes, status } =
    body as Record<string, unknown>;

  if (assetTag) {
    await ensureUniqueTag(ctx.companyId, String(assetTag), id);
  }

  const row = await prisma.asset.update({
    where: { id },
    data: {
      ...(assetTag ? { assetTag: String(assetTag) } : {}),
      ...(category ? { category: await validateAssetCategory(String(category)) } : {}),
      ...(name ? { name: String(name) } : {}),
      serialNumber: serialNumber !== undefined ? (serialNumber ? String(serialNumber) : null) : undefined,
      model: model !== undefined ? (model ? String(model) : null) : undefined,
      purchaseDate: purchaseDate !== undefined ? (purchaseDate ? new Date(String(purchaseDate)) : null) : undefined,
      purchaseValue: purchaseValue !== undefined ? new Prisma.Decimal(Number(purchaseValue)) : undefined,
      warrantyUntil: warrantyUntil !== undefined ? (warrantyUntil ? new Date(String(warrantyUntil)) : null) : undefined,
      condition: condition !== undefined ? (condition ? String(condition) : null) : undefined,
      notes: notes !== undefined ? (notes ? String(notes) : null) : undefined,
      ...(status ? { status: status as never } : {}),
    },
  });
  await logAudit({ action: "UPDATE", module: "assets", entityType: "Asset", entityId: id, companyId: ctx.companyId, userId: ctx.userId });
  return ok(row);
}

export async function deleteAsset(req: Request, id: string) {
  const ctx = await reqCtx(req, "assets.delete");
  const asset = await prisma.asset.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!asset) throw notFound("Asset not found.");
  const active = await prisma.assetAssignment.count({ where: { assetId: id, status: "ACTIVE" } });
  if (active > 0) throw badRequest("Return/retire the asset before deleting it.");
  await prisma.asset.delete({ where: { id } });
  await logAudit({ action: "DELETE", module: "assets", entityType: "Asset", entityId: id, companyId: ctx.companyId, userId: ctx.userId });
  return ok({ id, deleted: true });
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export async function listAssignments(req: Request) {
  const { companyId } = await reqCtx(req, "assetAssignments.read");
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const employeeId = sp.get("employeeId");
  const rows = await prisma.assetAssignment.findMany({
    where: {
      companyId,
      ...(status ? { status: status as never } : {}),
      ...(employeeId ? { employeeId } : {}),
    },
    include: {
      asset: { select: { id: true, category: true, assetTag: true, name: true } },
      employee: { select: employeeSelect },
    },
    orderBy: { assignedAt: "desc" },
    take: 500,
  });
  return ok(rows);
}

export async function createAssignment(req: Request) {
  const ctx = await reqCtx(req, "assetAssignments.create");
  const body = await req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
  const { assetId, employeeId, assignedAt, expectedReturnAt, notes } = body as Record<string, unknown>;
  if (!assetId || !employeeId) throw badRequest("assetId and employeeId are required.");
  const assignment = await assignAsset(
    ctx.companyId,
    String(assetId),
    String(employeeId),
    ctx.userId,
    assignedAt ? String(assignedAt) : undefined,
    expectedReturnAt ? String(expectedReturnAt) : null,
    notes ? String(notes) : null
  );
  await logAudit({
    action: "CREATE",
    module: "assetAssignments",
    entityType: "AssetAssignment",
    entityId: assignment.id,
    companyId: ctx.companyId,
    userId: ctx.userId,
    metadata: { assetId: String(assetId), employeeId: String(employeeId) },
  });
  return created(assignment);
}

export async function returnAssignment(req: Request, id: string) {
  const ctx = await reqCtx(req, "assetAssignments.manage");
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const assignment = await returnAsset(
    ctx.companyId,
    id,
    ctx.userId,
    body.returnedAt ? String(body.returnedAt) : undefined,
    body.conditionOnReturn ? String(body.conditionOnReturn) : null,
    body.notes ? String(body.notes) : null
  );
  await logAudit({
    action: "UPDATE",
    module: "assetAssignments",
    entityType: "AssetAssignment",
    entityId: id,
    companyId: ctx.companyId,
    userId: ctx.userId,
    metadata: { returned: true },
  });
  return ok(assignment);
}

export async function listAssetsForEmployee(employeeId: string) {
  const session = await auth();
  if (!session?.user) throw forbidden("Please sign in.");
  const companyId = requireCompanyId(session.user.companyId);
  void employeeId;
  const rows = await prisma.assetAssignment.findMany({
    where: { companyId, employeeId: session.user.employeeId ?? "" },
    include: { asset: { select: { id: true, category: true, assetTag: true, name: true, model: true, status: true } } },
    orderBy: { assignedAt: "desc" },
  });
  return ok(rows);
}