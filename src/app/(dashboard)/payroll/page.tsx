import PermissionGate from "@/components/permission-gate";
import { PayrollDashboard } from "@/components/payroll/payroll-dashboard";

export const metadata = { title: "Payroll dashboard" };

export default function PayrollPage() {
  return (
    <PermissionGate permission="payrollRuns.read">
      <PayrollDashboard />
    </PermissionGate>
  );
}