import PermissionGate from "@/components/permission-gate";
import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard";

export const metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <PermissionGate permission="analytics.read">
      <AnalyticsDashboard />
    </PermissionGate>
  );
}