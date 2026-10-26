import PermissionGate from "@/components/permission-gate";
import { ScheduledReports } from "@/components/admin/scheduled-reports";

export const metadata = { title: "Scheduled Reports" };

export default function ScheduledReportsPage() {
  return (
    <PermissionGate permission="scheduledReports.read">
      <ScheduledReports />
    </PermissionGate>
  );
}