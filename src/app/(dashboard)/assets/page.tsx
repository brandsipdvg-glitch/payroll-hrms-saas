import PermissionGate from "@/components/permission-gate";
import { AssetList } from "@/components/assets/asset-list";

export const metadata = { title: "Assets" };

export default function AssetsPage() {
  return (
    <PermissionGate permission="assets.read">
      <AssetList />
    </PermissionGate>
  );
}