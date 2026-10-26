import { requirePermission } from "@/lib/authz";

/**
 * Server-side permission probe. Returns true when the current session holds
 * the given permission (or is a super admin).
 */
export async function hasPermission(permission: string): Promise<boolean> {
  try {
    await requirePermission(permission);
    return true;
  } catch {
    return false;
  }
}