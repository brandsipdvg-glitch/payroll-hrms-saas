import { COMPANIES_MODULE } from "@/config/modules";
import { ModuleCrud } from "@/components/module-crud";
import PermissionGate from "@/components/permission-gate";
import { companiesApi } from "@/lib/client/api";

export const metadata = { title: "Companies" };

export default function CompaniesPage() {
  return (
    <PermissionGate permission="companies.read">
      <ModuleCrud module={COMPANIES_MODULE} apiBase={companiesApi} archiveLabel="Company archived." />
    </PermissionGate>
  );
}