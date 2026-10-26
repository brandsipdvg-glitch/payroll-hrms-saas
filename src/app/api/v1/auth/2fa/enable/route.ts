import { NextRequest } from "next/server";
import { api, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { enable2FaSchema } from "@/lib/validations/auth";
import { authenticator } from "otplib";

export const runtime = "nodejs";

export const POST = (req: NextRequest) =>
  api(async () => {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = enable2FaSchema.parse(body);

    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { twoFactorSecret: true } });
    if (!dbUser?.twoFactorSecret || dbUser.twoFactorSecret !== parsed.secret) {
      throw badRequest("Setup mismatch. Please regenerate the QR code and try again.");
    }
    const valid = authenticator.check(parsed.code, parsed.secret);
    if (!valid) throw badRequest("Invalid authenticator code.");

    await prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: true } });
    await logAudit({
      action: "ENABLE_2FA",
      module: "auth",
      entityType: "User",
      entityId: user.id,
      userId: user.id,
      companyId: user.companyId,
    });
    return ok({ message: "Two-factor authentication enabled." });
  });