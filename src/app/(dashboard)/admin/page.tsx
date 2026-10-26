import PermissionGate from "@/components/permission-gate";
import { AdminHub } from "@/components/admin/admin-hub";

export const metadata = { title: "Admin Tools" };

export default function AdminPage() {
  return (
    <PermissionGate permission="adminTools.read">
      <AdminHub />
    </PermissionGate>
  );
}