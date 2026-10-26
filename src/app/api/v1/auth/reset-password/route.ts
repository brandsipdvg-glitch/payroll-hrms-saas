import { NextRequest } from "next/server";
import { api, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { logAudit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

export const POST = (req: NextRequest) =>
  api(async () => {
    const body = await req.json();
    const parsed = resetPasswordSchema.parse(body);
    const tokenHash = createHash("sha256").update(parsed.token).digest("hex");

    const tokenRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!tokenRecord || tokenRecord.usedAt || tokenRecord.expiresAt < new Date()) {
      throw badRequest("This reset link is invalid or has expired.");
    }

    await prisma.$transaction([
      prisma.passwordResetToken.update({ where: { id: tokenRecord.id }, data: { usedAt: new Date() } }),
      prisma.user.update({
        where: { id: tokenRecord.userId },
        data: {
          passwordHash: bcrypt.hashSync(parsed.password, 10),
          passwordChangedAt: new Date(),
          sessionVersion: { increment: 1 },
        },
      }),
    ]);

    await logAudit({
      action: "PASSWORD_RESET",
      module: "auth",
      entityType: "User",
      entityId: tokenRecord.userId,
      userId: tokenRecord.userId,
      companyId: tokenRecord.user.companyId,
    });

    return ok({ message: "Password updated. You can now sign in with your new password." });
  });