import { NextRequest } from "next/server";
import { api, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { disable2FaSchema } from "@/lib/validations/auth";
import { authenticator } from "otplib";

export const runtime = "nodejs";

export const POST = (req: NextRequest) =>
  api(async () => {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = disable2FaSchema.parse(body);

    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { twoFactorEnabled: true, twoFactorSecret: true } });
    if (!dbUser?.twoFactorEnabled || !dbUser.twoFactorSecret) throw badRequest("Two-factor auth is not enabled.");
    const valid = authenticator.check(parsed.code, dbUser.twoFactorSecret);
    if (!valid) throw badRequest("Invalid authenticator code.");

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false, twoFactorSecret: null, sessionVersion: { increment: 1 } },
    });
    await logAudit({
      action: "DISABLE_2FA",
      module: "auth",
      entityType: "User",
      entityId: user.id,
      userId: user.id,
      companyId: user.companyId,
    });
    return ok({ message: "Two-factor authentication disabled. Re-login required." });
  });