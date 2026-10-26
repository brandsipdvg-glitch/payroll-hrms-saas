import { NextRequest } from "next/server";
import { api, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

/** Revokes every active session for the signed-in user (sessionVersion bump). */
export const POST = (_req: NextRequest) =>
  api(async () => {
    const user = await requireAuth();
    await prisma.user.update({
      where: { id: user.id },
      data: { sessionVersion: { increment: 1 } },
    });
    await logAudit({
      action: "REVOKE_SESSIONS",
      module: "auth",
      entityType: "User",
      entityId: user.id,
      userId: user.id,
      companyId: user.companyId,
    });
    return ok({ message: "All sessions have been revoked. Please sign in again." });
  });