import PermissionGate from "@/components/permission-gate";
import { EmailPayslips } from "@/components/admin/email-payslips";

export const metadata = { title: "Email Payslips" };

export default function EmailPayslipsPage() {
  return (
    <PermissionGate permission="adminTools.read">
      <EmailPayslips />
    </PermissionGate>
  );
}