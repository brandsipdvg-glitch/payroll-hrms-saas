import PermissionGate from "@/components/permission-gate";
import { MyClaimsPanel } from "@/components/finance/my-claims-panel";

export const metadata = { title: "My claims" };

export default function MeClaimsPage() {
  return (
    <PermissionGate permission="reimbursements.read">
      <MyClaimsPanel />
    </PermissionGate>
  );
}