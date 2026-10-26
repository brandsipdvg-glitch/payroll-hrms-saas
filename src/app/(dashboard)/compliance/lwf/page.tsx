import PermissionGate from "@/components/permission-gate";
import { LwfPanel } from "@/components/compliance/lwf-panel";

export const metadata = { title: "Labour welfare fund" };

export default function ComplianceLwfPage() {
  return (
    <PermissionGate permission="labourWelfareFund.read">
      <LwfPanel />
    </PermissionGate>
  );
}