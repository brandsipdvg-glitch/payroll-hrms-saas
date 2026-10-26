import PermissionGate from "@/components/permission-gate";
import { BulkUpload } from "@/components/admin/bulk-upload";

export const metadata = { title: "Bulk Upload" };

export default function BulkUploadPage() {
  return (
    <PermissionGate permission="adminTools.read">
      <BulkUpload />
    </PermissionGate>
  );
}