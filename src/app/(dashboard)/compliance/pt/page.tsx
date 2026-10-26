import PermissionGate from "@/components/permission-gate";
import { PtPanel } from "@/components/compliance/pt-panel";

export const metadata = { title: "Professional tax" };

export default function CompliancePtPage() {
  return (
    <PermissionGate permission="professionalTax.read">
      <PtPanel />
    </PermissionGate>
  );
}