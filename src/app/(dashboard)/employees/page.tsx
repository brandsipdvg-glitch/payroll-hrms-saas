import PermissionGate from "@/components/permission-gate";
import { EmployeeList } from "@/components/employee/employee-list";
import { hasPermission } from "@/lib/perm";

export const metadata = { title: "Employees" };

export default async function EmployeesPage() {
  return (
    <PermissionGate permission="employees.read">
      <EmployeeList canCreate={await hasPermission("employees.create")} />
    </PermissionGate>
  );
}