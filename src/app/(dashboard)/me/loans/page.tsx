import PermissionGate from "@/components/permission-gate";
import { MyLoansPanel } from "@/components/finance/my-loans-panel";

export const metadata = { title: "My loans" };

export default function MeLoansPage() {
  return (
    <PermissionGate permission="loans.read">
      <MyLoansPanel />
    </PermissionGate>
  );
}