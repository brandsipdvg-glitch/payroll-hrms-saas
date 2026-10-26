import { NextRequest } from "next/server";
import { api, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireCompanyId, requirePermission } from "@/lib/authz";
import { notFound } from "@/lib/errors";
import { readStoredFile, removeStoredFile } from "@/server/services/documents";
import { logAudit } from "@/lib/audit";
import type { DocumentStatus } from "@prisma/client";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; docId: string }> };

async function ownedDoc(companyId: string, employeeId: string, docId: string) {
  const doc = await prisma.employeeDocument.findFirst({
    where: { id: docId, employeeId, companyId },
  });
  if (!doc) throw notFound("Document not found.");
  return doc;
}

export const GET = (_req: NextRequest, { params }: Params) =>
  api(async () => {
    const ctx = await requirePermission("employeeDocuments.read");
    const companyId = requireCompanyId(ctx.companyId);
    const { id, docId } = await params;
    const doc = await ownedDoc(companyId, id, docId);

    const buffer = await readStoredFile(doc.filePath);
    if (!buffer) throw notFound("File is missing from storage.");

    await logAudit({
      action: "DOWNLOAD",
      module: "employeeDocuments",
      entityType: "EmployeeDocument",
      entityId: doc.id,
      entityName: doc.name,
      companyId,
      userId: ctx.userId,
    });

    const disposition = doc.category === "PHOTO" ? "inline" : "attachment";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": doc.mimeType ?? "application/octet-stream",
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(doc.fileName ?? doc.name)}"`,
        "Content-Length": String(buffer.length),
      },
    });
  });

export const PATCH = (req: NextRequest, { params }: Params) =>
  api(async () => {
    const companyId = requireCompanyId((await requirePermission("employeeDocuments.update")).companyId);
    const { id, docId } = await params;
    const doc = await ownedDoc(companyId, id, docId);

    const body = (await req.json().catch(() => {
      throw notFound("Invalid JSON body.");
    })) as { status?: string; notes?: string; name?: string; category?: string };

    let data: Record<string, unknown> = {};
    let auditAction: "UPDATE" | "APPROVE" | "REJECT" = "UPDATE";

    if (body.status && (body.status === "APPROVED" || body.status === "REJECTED")) {
      await requirePermission("employeeDocuments.manage");
      auditAction = body.status === "APPROVED" ? "APPROVE" : "REJECT";
      data = {
        status: body.status as DocumentStatus,
        verifiedBy: (await requirePermission("employeeDocuments.manage")).userId,
        verifiedAt: new Date(),
        ...(body.notes ? { notes: body.notes } : {}),
      };
    } else {
      if (body.name) data.name = body.name;
      if (body.category) data.category = body.category;
      if (body.notes !== undefined) data.notes = body.notes;
    }

    const updated = await prisma.employeeDocument.update({ where: { id: doc.id }, data });
    await logAudit({
      action: auditAction,
      module: "employeeDocuments",
      entityType: "EmployeeDocument",
      entityId: doc.id,
      entityName: updated.name,
      companyId,
      userId: (await requirePermission("employeeDocuments.update")).userId,
      beforeState: doc as never,
      afterState: updated as never,
    });
    return ok(updated);
  });

export const DELETE = (_req: NextRequest, { params }: Params) =>
  api(async () => {
    const ctx = await requirePermission("employeeDocuments.delete");
    const companyId = requireCompanyId(ctx.companyId);
    const { id, docId } = await params;
    const doc = await ownedDoc(companyId, id, docId);
    await removeStoredFile(doc.filePath);
    await prisma.employeeDocument.delete({ where: { id: doc.id } });
    await logAudit({
      action: "DELETE",
      module: "employeeDocuments",
      entityType: "EmployeeDocument",
      entityId: doc.id,
      entityName: doc.name,
      companyId,
      userId: ctx.userId,
    });
    return ok({ id: doc.id, deleted: true });
  });