import { NextRequest } from "next/server";
import { api, created, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireCompanyId, requirePermission } from "@/lib/authz";
import { notFound } from "@/lib/errors";
import { storeUpload } from "@/server/services/documents";
import { logAudit } from "@/lib/audit";
import type { DocumentCategory } from "@prisma/client";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const CATEGORIES = new Set([
  "PAN",
  "AADHAAR",
  "OFFER_LETTER",
  "APPOINTMENT_LETTER",
  "CONTRACT",
  "CERTIFICATE",
  "PROMOTION_LETTER",
  "TRANSFER_LETTER",
  "RESIGNATION_ACCEPTANCE",
  "TRAINING_CERTIFICATE",
  "PHOTO",
  "RESUME",
  "OTHER",
]);

export const GET = (_req: NextRequest, { params }: Params) =>
  api(async () => {
    const ctx = await requirePermission("employeeDocuments.read");
    const companyId = requireCompanyId(ctx.companyId);
    const employeeId = (await params).id;
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: { id: true },
    });
    if (!employee) throw notFound("Employee not found.");
    const rows = await prisma.employeeDocument.findMany({
      where: { employeeId, companyId },
      orderBy: { createdAt: "desc" },
    });
    return ok(rows);
  });

export const POST = (req: NextRequest, { params }: Params) =>
  api(async () => {
    const ctx = await requirePermission("employeeDocuments.create");
    const companyId = requireCompanyId(ctx.companyId);
    const employeeId = (await params).id;
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, companyId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!employee) throw notFound("Employee not found.");

    const form = await req.formData().catch(() => {
      throw notFound("Expected multipart form data.");
    });
    const category = String(form.get("category") ?? "OTHER").toUpperCase();
    if (!CATEGORIES.has(category)) throw notFound("Unknown document category.");
    const name = String(form.get("name") ?? "").trim() || "Untitled";
    const notes = form.get("notes") ? String(form.get("notes")).trim() : null;
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw notFound("No file provided.");

    const stored = await storeUpload(employeeId, file);
    const doc = await prisma.employeeDocument.create({
      data: {
        employeeId,
        companyId,
        category: category as DocumentCategory,
        name,
        notes,
        fileName: file.name,
        filePath: stored.relativePath,
        fileSize: stored.fileSize,
        mimeType: stored.mimeType,
        uploadedBy: ctx.userId,
      },
    });

    await logAudit({
      action: "UPLOAD",
      module: "employeeDocuments",
      entityType: "EmployeeDocument",
      entityId: doc.id,
      entityName: doc.name,
      companyId,
      userId: ctx.userId,
    });
    return created(doc);
  });