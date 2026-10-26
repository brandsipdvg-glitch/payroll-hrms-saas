import PermissionGate from "@/components/permission-gate";
import { BackupRestore } from "@/components/admin/backup-restore";

export const metadata = { title: "Backup & Restore" };

export default function BackupPage() {
  return (
    <PermissionGate permission="adminTools.read">
      <BackupRestore />
    </PermissionGate>
  );
}