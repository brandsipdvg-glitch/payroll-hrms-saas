import { requirePermission } from "@/lib/authz";
import { Bug } from "lucide-react";

export default async function PermissionGate({
  permission,
  children,
}: {
  permission: string;
  children: React.ReactNode;
}) {
  try {
    await requirePermission(permission);
    return <>{children}</>;
  } catch {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border bg-card p-12 text-center">
        <Bug className="mb-3 h-8 w-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Access denied</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          You do not have permission to view this area. Contact your administrator if you believe this is a mistake.
        </p>
      </div>
    );
  }
}