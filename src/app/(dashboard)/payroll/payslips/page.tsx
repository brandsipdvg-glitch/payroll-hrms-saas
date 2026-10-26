import PermissionGate from "@/components/permission-gate";
import { PayslipsPanel } from "@/components/payroll/payslips-panel";

export const metadata = { title: "Payslips" };

export default function PayslipsPage() {
  return (
    <PermissionGate permission="payrollRuns.read">
      <PayslipsPanel />
    </PermissionGate>
  );
}