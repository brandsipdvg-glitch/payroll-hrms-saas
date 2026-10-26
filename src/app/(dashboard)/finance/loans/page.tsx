import PermissionGate from "@/components/permission-gate";
import { LoansPanel } from "@/components/finance/loans-panel";

export const metadata = { title: "Loans & advances" };

export default function FinanceLoansPage() {
  return (
    <PermissionGate permission="loans.read">
      <LoansPanel />
    </PermissionGate>
  );
}