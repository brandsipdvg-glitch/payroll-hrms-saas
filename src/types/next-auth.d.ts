import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: {
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
    } | null;
    mfaPending?: boolean;
    mfaUserId?: string;
  }

  interface User {
    mfaPending?: boolean;
    mfaUserId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    mfaPending?: boolean;
    mfaUserId?: string;
    companyId?: string | null;
    employeeId?: string | null;
    sessionVersion?: number;
    roleCodes?: string[];
    permissions?: string[];
    twoFactorEnabled?: boolean;
  }
}

export type { Session };
export type { DefaultSession as _DefaultSession };