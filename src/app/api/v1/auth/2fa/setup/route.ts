import { NextRequest } from "next/server";
import { api, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { authenticator } from "otplib";
import QRCode from "qrcode";

export const runtime = "nodejs";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "PayrollHRM";

export const POST = (_req: NextRequest) =>
  api(async () => {
    const user = await requireAuth();
    const secret = authenticator.generateSecret();
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret },
    });
    const otpauthUrl = authenticator.keyuri(user.email, APP_NAME, secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    await logAudit({
      action: "ENABLE_2FA",
      module: "auth",
      entityType: "User",
      entityId: user.id,
      userId: user.id,
      companyId: user.companyId,
      metadata: { state: "secret_generated" },
    });
    return ok({ secret, otpauthUrl, qrDataUrl });
  });