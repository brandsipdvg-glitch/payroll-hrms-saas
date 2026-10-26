"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/client/api";
import { myAssetsApi } from "@/lib/client/api";
import { formatDate } from "@/lib/utils";

type Row = Record<string, unknown>;

export function MyAssets() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Row[]>(myAssetsApi);
      setRows(data ?? []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">My Assets</h1>
        <p className="text-sm text-muted-foreground">Assets currently allocated to you.</p>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {rows.length === 0 && !loading ? <p className="text-sm text-muted-foreground">No assets allocated to you right now.</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((a) => {
          const asset = a.asset as Row | undefined;
          return (
            <Card key={String(a.id)}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Package className="h-5 w-5" />
                  </div>
                  <Badge variant="secondary">{String(asset?.category ?? "")}</Badge>
                </div>
                <p className="mt-3 font-medium">{String(asset?.name ?? "")}</p>
                <p className="text-xs text-muted-foreground">{String(asset?.assetTag ?? "")} · {String(asset?.model ?? "No model")}</p>
                <div className="mt-2 text-xs text-muted-foreground">
                  <p>Serial: {String(asset?.serialNumber ?? "—")}</p>
                  <p>Assigned {formatDate(a.assignedAt as string)}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}