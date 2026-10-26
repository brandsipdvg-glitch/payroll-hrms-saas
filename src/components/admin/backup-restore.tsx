"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch, downloadResource } from "@/lib/client/api";
import { backupApi, restoreApi } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";

export function BackupRestore() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const backup = async () => {
    setBusy(true);
    try {
      await downloadResource(backupApi);
      toast.success("Backup downloaded.");
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Backup failed.");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (file: File) => {
    const text = await file.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      toast.error("Selected file is not valid JSON.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const data = await apiFetch<Record<string, unknown>>(restoreApi, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(data);
      toast.success("Tenant restored successfully.");
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Restore failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Backup &amp; Restore</h1>
        <p className="text-sm text-muted-foreground">Export tenant data as JSON and restore it later. Restores are destructive — use with care.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Download backup</CardTitle>
            <CardDescription>Exports employees, departments, payroll, attendance, leave, finance and reports for this tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={backup} disabled={busy}>
              <Download className="mr-1 h-4 w-4" /> {busy ? "Working…" : "Download backup JSON"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Restore from backup</CardTitle>
            <CardDescription>Replace current tenant data with the contents of an uploaded JSON backup file.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void restore(file);
                e.target.value = "";
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="mr-1 h-4 w-4" /> Choose backup file
            </Button>
            {result ? <p className="text-sm text-muted-foreground">{JSON.stringify(result)}</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}