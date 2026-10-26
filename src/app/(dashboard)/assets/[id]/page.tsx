import PermissionGate from "@/components/permission-gate";
import { AssetDetail } from "@/components/assets/asset-detail";

export const metadata = { title: "Asset" };

export default function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PermissionGate permission="assets.read">
      <AssetDetailSuspense id={params} />
    </PermissionGate>
  );
}

async function AssetDetailSuspense({ id }: { id: Promise<{ id: string }> }) {
  const { id: assetId } = await id;
  return <AssetDetail id={assetId} />;
}