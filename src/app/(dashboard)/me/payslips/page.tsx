import PermissionGate from "@/components/permission-gate";
import { MyPayslips } from "@/components/payroll/my-payslips";

export const metadata = { title: "My payslips" };

export default function MyPayslipsPage() {
  return (
    <PermissionGate permission="payslips.read">
      <MyPayslips />
    </PermissionGate>
  );
}