import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { forbidden, unauthorized } from "@/lib/errors";

export interface SessionUserClaims {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  companyId: string | null;
  employeeId: string | null;
  sessionVersion: number;
  roleCodes: string[];
  permissions: string[];
  twoFactorEnabled: boolean;
}

export async function getCurrentUser(): Promise<SessionUserClaims> {
  const session = await auth();
  if (!session?.user) throw unauthorized("Please sign in to continue.");
  return session.user;
}

export const requireAuth = getCurrentUser;

export interface AuthContext {
  userId: string;
  companyId: string | null;
  isSuperAdmin: boolean;
  sessionVersion: number;
}

interface DbUserWithPerms {
  id: string;
  companyId: string | null;
  sessionVersion: number;
  status: string;
  roles: { role: { code: string; permissions: { permission: { code: string } }[] } }[];
}

/**
 * Authoritative RBAC check. Reads the live role -> permission graph from the
 * database (rather than trusting the JWT claim) so that role changes take
 * effect immediately. Also enforces session revocation via `sessionVersion`.
 */
export async function requirePermission(...codes: string[]): Promise<AuthContext> {
  const claims = await getCurrentUser();

  const dbUser = await prisma.user.findUnique({
    where: { id: claims.id },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    },
  });

  if (!dbUser) throw unauthorized("Account not found.");
  if (dbUser.sessionVersion !== claims.sessionVersion) {
    throw unauthorized("Your session has been revoked. Please sign in again.");
  }
  if (dbUser.status !== "ACTIVE") throw forbidden("Your account is not active.");

  const user = dbUser as unknown as DbUserWithPerms;
  const isSuperAdmin = user.roles.some((r) => r.role.code === "SUPER_ADMIN");
  const owned = new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code)));
  const missing = codes.filter((c) => !isSuperAdmin && !owned.has(c));
  if (missing.length > 0) {
    throw forbidden(`Missing required permission: ${missing.join(", ")}`);
  }

  return {
    userId: user.id,
    companyId: user.companyId,
    isSuperAdmin,
    sessionVersion: user.sessionVersion,
  };
}

/** Ensures the caller operates inside a tenant context. */
export function requireCompanyId(companyId: string | null | undefined): string {
  if (!companyId) throw forbidden("Your account is not associated with a company.");
  return companyId;
}

export function hasRole(roleCodes: string[], ...codes: string[]): boolean {
  return codes.some((c) => roleCodes.includes(c));
}