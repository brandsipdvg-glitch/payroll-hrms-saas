import PermissionGate from "@/components/permission-gate";
import { ReimbursementsPanel } from "@/components/finance/reimbursements-panel";

export const metadata = { title: "Reimbursements" };

export default function FinanceReimbursementsPage() {
  return (
    <PermissionGate permission="reimbursements.read">
      <ReimbursementsPanel />
    </PermissionGate>
  );
}