"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { DataTable, Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiFetch, ApiClientError, downloadResource, downloadCsv } from "@/lib/client/api";
import { formatCurrency } from "@/lib/utils";
import { Period } from "@/components/compliance/period-picker";

type Row = Record<string, unknown>;

export function RegisterTable({
  url,
  csvBaseUrl,
  title,
  description,
  period,
  moneyKeys = [],
  refreshKey,
}: {
  url: string;
  csvBaseUrl?: string;
  title: string;
  description: string;
  period: Period;
  moneyKeys?: string[];
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState<Column<Row>[]>([]);

  const humanize = (k: string) =>
    k
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ rows: Row[] }>(`${url}?month=${period.month}&year=${period.year}`);
      const data = result.rows ?? [];
      setRows(data);
      const keys = data.length > 0 ? Object.keys(data[0]) : [];
      setColumns(
        keys.map((k, i) => ({
          key: k,
          title: humanize(k).replace(/Id$/, "ID"),
          className: i === 0 ? "" : i === keys.length - 1 ? "text-right" : "text-right",
          render: (row) => (moneyKeys.includes(k) ? formatCurrency(Number(row[k] ?? 0)) : String(row[k] ?? "—")),
        }))
      );
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : `Failed to load ${title}.`);
    } finally {
      setLoading(false);
    }
  }, [url, period.month, period.year, title, moneyKeys.join(",")]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshKey]);

  const download = async () => {
    if (!csvBaseUrl) return;
    try {
      await downloadCsv(csvBaseUrl, period.month, period.year);
      toast.success("Download started.");
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Download failed.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-sm">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
          {csvBaseUrl ? (
            <Button variant="outline" size="sm" onClick={() => void download()}>
              <Download className="mr-1.5 h-4 w-4" /> CSV
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          total={rows?.length ?? 0}
          page={1}
          pageSize={Math.max(rows?.length ?? 1, 1)}
          onPageChange={() => undefined}
          empty={<>No payslips generated for this period. Run payroll first.</>}
        />
      </CardContent>
    </Card>
  );
}

// Export helpers reused by specialized downloads (Form 16 etc.)
export { downloadResource };