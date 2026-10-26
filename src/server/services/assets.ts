import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/errors";
import { AssetCategory, AssetStatus } from "@prisma/client";

export interface AssetInput {
  category: AssetCategory;
  assetTag: string;
  name: string;
  serialNumber?: string | null;
  model?: string | null;
  purchaseDate?: string | null;
  purchaseValue?: number | null;
  warrantyUntil?: string | null;
  condition?: string | null;
  notes?: string | null;
}

export async function ensureUniqueTag(companyId: string, assetTag: string, excludeId?: string): Promise<void> {
  const existing = await prisma.asset.findFirst({
    where: { companyId, assetTag, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  if (existing) throw badRequest(`Asset tag ${assetTag} already exists.`);
}

export async function nextAssetTag(companyId: string): Promise<string> {
  const last = await prisma.asset.findFirst({
    where: { companyId },
    orderBy: { assetTag: "desc" },
  });
  const prefix = "AST";
  const seq = last ? Number(last.assetTag.replace(/^\D+/g, "")) + 1 : 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

export async function validateAssetCategory(value: string): Promise<AssetCategory> {
  const categories = Object.values(AssetCategory) as string[];
  if (!categories.includes(value)) throw badRequest(`Invalid category. Choose one of: ${categories.join(", ")}.`);
  return value as AssetCategory;
}

export async function allocatableForEmployee(companyId: string, employeeId: string): Promise<boolean> {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId } });
  if (!employee) throw notFound("Employee not found.");
  return true;
}

export async function assignAsset(
  companyId: string,
  assetId: string,
  employeeId: string,
  userId: string,
  assignedAt?: string,
  expectedReturnAt?: string | null,
  notes?: string | null
) {
  const asset = await prisma.asset.findFirst({ where: { id: assetId, companyId } });
  if (!asset) throw notFound("Asset not found.");
  if (asset.status === "RETIRED") throw badRequest("Retired assets cannot be allocated.");
  if (asset.status === "MAINTENANCE") throw badRequest("Assets under maintenance cannot be allocated.");

  await allocatableForEmployee(companyId, employeeId);

  const active = await prisma.assetAssignment.findFirst({ where: { companyId, assetId, employeeId, status: "ACTIVE" } });
  if (active) throw badRequest("This asset is already assigned to this employee.");

  const alreadyAllocated = await prisma.assetAssignment.findFirst({ where: { companyId, assetId, status: "ACTIVE" } });
  if (alreadyAllocated && alreadyAllocated.employeeId !== employeeId) {
    throw badRequest("Asset is currently allocated to another employee.");
  }

  const assignment = await prisma.$transaction(async (tx) => {
    const row = await tx.assetAssignment.create({
      data: {
        companyId,
        assetId,
        employeeId,
        assignedBy: userId,
        assignedAt: new Date(assignedAt ?? new Date().toISOString().slice(0, 10)),
        expectedReturnAt: expectedReturnAt ? new Date(expectedReturnAt) : null,
        notes: notes ?? null,
        status: "ACTIVE",
      },
    });
    await tx.asset.update({ where: { id: assetId }, data: { status: "ALLOCATED" } });
    return row;
  });

  return assignment;
}

export async function returnAsset(
  companyId: string,
  assignmentId: string,
  userId: string,
  returnedAt?: string,
  conditionOnReturn?: string | null,
  notes?: string | null
) {
  const assignment = await prisma.assetAssignment.findFirst({
    where: { id: assignmentId, companyId, status: "ACTIVE" },
  });
  if (!assignment) throw notFound("Active assignment not found.");

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.assetAssignment.update({
      where: { id: assignmentId },
      data: {
        status: "RETURNED",
        returnedBy: userId,
        returnedAt: new Date(returnedAt ?? new Date().toISOString().slice(0, 10)),
        conditionOnReturn: conditionOnReturn ?? null,
        notes: notes ?? null,
      },
    });
    const otherActive = await tx.assetAssignment.findFirst({
      where: { companyId, assetId: assignment.assetId, status: "ACTIVE" },
    });
    if (!otherActive) {
      await tx.asset.update({ where: { id: assignment.assetId }, data: { status: "AVAILABLE" } });
    }
    return updated;
  });

  return row;
}

export async function listEmployeeAssets(companyId: string, employeeId: string) {
  const assignments = await prisma.assetAssignment.findMany({
    where: { companyId, employeeId },
    include: {
      asset: {
        select: {
          id: true,
          category: true,
          assetTag: true,
          name: true,
          model: true,
          serialNumber: true,
          status: true,
        },
      },
    },
    orderBy: { assignedAt: "desc" },
  });
  return assignments;
}