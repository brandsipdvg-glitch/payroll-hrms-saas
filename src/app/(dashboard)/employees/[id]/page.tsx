import PermissionGate from "@/components/permission-gate";
import { EmployeeProfile } from "@/components/employee/employee-profile";
import { hasPermission } from "@/lib/perm";

export const metadata = { title: "Employee profile" };

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PermissionGate permission="employees.read">
      <EmployeeProfile
        employeeId={id}
        canEdit={await hasPermission("employees.update")}
        canDelete={await hasPermission("employees.delete")}
        canDoc={await hasPermission("employeeDocuments.read")}
        canLifecycle={await hasPermission("lifecycle.read")}
      />
    </PermissionGate>
  );
}