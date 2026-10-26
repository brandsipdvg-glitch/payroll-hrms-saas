import PermissionGate from "@/components/permission-gate";
import { PfPanel } from "@/components/compliance/pf-panel";

export const metadata = { title: "PF / EPS compliance" };

export default function CompliancePfPage() {
  return (
    <PermissionGate permission="pf.read">
      <PfPanel />
    </PermissionGate>
  );
}