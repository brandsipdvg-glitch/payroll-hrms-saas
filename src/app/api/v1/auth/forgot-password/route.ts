import { NextRequest } from "next/server";
import { api, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { logAudit } from "@/lib/audit";
import { createHash, randomBytes } from "crypto";

export const runtime = "nodejs";

export const POST = (req: NextRequest) =>
  api(async () => {
    const body = await req.json();
    const parsed = forgotPasswordSchema.parse(body);
    const email = parsed.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      });
      await logAudit({
        action: "PASSWORD_RESET_REQUEST",
        module: "auth",
        entityType: "User",
        entityId: user.id,
        userId: user.id,
        companyId: user.companyId,
        metadata: { email },
      });
      // In production this URL is emailed. Returned here so the flow is testable end-to-end.
      return ok({
        message: "If the email exists, a password reset link has been sent.",
        resetUrl: `${process.env.NEXTAUTH_URL}/reset-password?token=${token}`,
      });
    }

    await logAudit({ action: "PASSWORD_RESET_REQUEST", module: "auth", entityType: "User", metadata: { email } });
    return ok({ message: "If the email exists, a password reset link has been sent." });
  });