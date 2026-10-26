import PermissionGate from "@/components/permission-gate";
import { ComplianceDashboard } from "@/components/compliance/compliance-dashboard";

export const metadata = { title: "Compliance dashboard" };

export default function CompliancePage() {
  return (
    <PermissionGate permission="compliances.read">
      <ComplianceDashboard />
    </PermissionGate>
  );
}