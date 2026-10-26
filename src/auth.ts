import NextAuth, { CredentialsSignin, type NextAuthConfig, type Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compareSync } from "bcryptjs";
import { authenticator } from "otplib";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { badRequest } from "@/lib/errors";

authenticator.options = { window: 1, step: 30 };

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const credentialsSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(1).optional(),
  twoFactorCode: z.string().min(1).optional(),
  pendingUserId: z.string().optional(),
});

export class InvalidCredentialsError extends CredentialsSignin {
  code = "invalid_credentials";
}
export class AccountLockedError extends CredentialsSignin {
  code = "account_locked";
}

async function touchFailure(user: { id: string; failedLoginAttempts: number }, message: string) {
  const attempts = user.failedLoginAttempts + 1;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: attempts,
      lockedUntil: attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
    },
  });
  await logAudit({
    action: "LOGIN_FAILED",
    module: "auth",
    entityType: "User",
    entityId: user.id,
    metadata: { reason: message, failedAttempts: attempts },
  });
}

const config = {
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        pendingUserId: { label: "Pending", type: "text" },
        twoFactorCode: { label: "2FA Code", type: "text" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw ?? {});
        if (!parsed.success) throw new InvalidCredentialsError();
        const { email, password, pendingUserId, twoFactorCode } = parsed.data;

        // -- Stage 2: verify 2FA TOTP for a user that already supplied a password
        if (pendingUserId) {
          if (!twoFactorCode) throw new InvalidCredentialsError();
          const user = await prisma.user.findUnique({ where: { id: pendingUserId } });
          if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
            throw new InvalidCredentialsError();
          }
          const ok = authenticator.check(twoFactorCode, user.twoFactorSecret);
          if (!ok) {
            await touchFailure(user, "invalid_2fa_code");
            return null;
          }
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
          });
          await logAudit({
            action: "LOGIN_2FA_SUCCESS",
            module: "auth",
            entityType: "User",
            entityId: user.id,
          });
          return { id: user.id, email: user.email, name: user.name };
        }

        // -- Stage 1: email + password
        if (!email || !password) throw new InvalidCredentialsError();
        const emailAddress = email.trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email: emailAddress } });
        if (!user) {
          await logAudit({
            action: "LOGIN_FAILED",
            module: "auth",
            entityType: "User",
            metadata: { email: emailAddress, reason: "unknown_user" },
          });
          throw new InvalidCredentialsError();
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new AccountLockedError();
        }
        if (!compareSync(password, user.passwordHash)) {
          await touchFailure(user, "wrong_password");
          throw new InvalidCredentialsError();
        }

        // password correct — reset failure counter unless 2FA still required
        if (user.twoFactorEnabled) {
          await logAudit({
            action: "LOGIN_2FA_PENDING",
            module: "auth",
            entityType: "User",
            entityId: user.id,
            userId: user.id,
          });
          return { id: user.id, email: user.email, name: user.name, mfaPending: true, mfaUserId: user.id };
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
        });
        await logAudit({
          action: "LOGIN",
          module: "auth",
          entityType: "User",
          entityId: user.id,
          userId: user.id,
        });
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        const u = user as typeof user & { mfaPending?: boolean; mfaUserId?: string };
        if (u.mfaPending) {
          token.mfaPending = true;
          token.mfaUserId = u.mfaUserId;
          return token;
        }
        token.mfaPending = false;
        token.mfaUserId = undefined;

        const db = await prisma.user.findUnique({
          where: { id: u.id },
          include: {
            employee: { select: { id: true } },
            roles: {
              include: {
                role: { include: { permissions: { include: { permission: true } } } },
              },
            },
          },
        });
        if (!db) return token;

        const roleCodes = db.roles.map((r) => r.role.code);
        const isSuper = roleCodes.includes("SUPER_ADMIN");
        const permissions = Array.from(
          new Set(db.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code)))
        );

        token.name = db.name;
        token.email = db.email;
        token.picture = db.avatarUrl;
        token.companyId = db.companyId;
        token.sessionVersion = db.sessionVersion;
        token.employeeId = db.employee?.id ?? null;
        token.roleCodes = roleCodes;
        token.permissions = isSuper ? ["*"] : permissions;
        token.twoFactorEnabled = db.twoFactorEnabled;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as unknown as {
        sub?: string;
        mfaPending?: boolean;
        mfaUserId?: string;
        email?: string;
        name?: string | null;
        picture?: string | null;
        companyId?: string | null;
        employeeId?: string | null;
        sessionVersion?: number;
        roleCodes?: string[];
        permissions?: string[];
        twoFactorEnabled?: boolean;
      };
      if (t.mfaPending) {
        session.mfaPending = true;
        session.mfaUserId = t.mfaUserId;
        session.user = null as any;
        return session;
      }
      session.user = {
        id: t.sub ?? "",
        email: t.email ?? "",
        name: t.name,
        image: t.picture,
        companyId: t.companyId ?? null,
        employeeId: t.employeeId ?? null,
        sessionVersion: t.sessionVersion ?? 0,
        roleCodes: t.roleCodes ?? [],
        permissions: t.permissions ?? [],
        twoFactorEnabled: t.twoFactorEnabled ?? false,
      } as any;
      session.mfaPending = false;
      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(config);
export type AuthConfig = typeof config;