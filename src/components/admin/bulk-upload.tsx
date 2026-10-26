"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client/api";
import { bulkUploadEmployeesApi } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";

interface UploadResult {
  created: number;
  skipped: number;
  errors: Array<{ index: number; message: string; firstName?: string; lastName?: string }>;
}

export function BulkUpload() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const parseText = (): Array<Record<string, string>> => {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const headers = lines[0].split(",").map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = values[i] ?? "";
      });
      return row;
    });
  };

  const submit = async () => {
    const rows = parseText();
    if (!rows.length) {
      toast.error("Add at least one data row. First line must be the header row.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const data = await apiFetch<UploadResult>(bulkUploadEmployeesApi, {
        method: "POST",
        body: JSON.stringify({ rows }),
      });
      setResult(data as UploadResult);
      toast.success(`Created ${data.created} employee(s).`);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Bulk Upload Employees</h1>
        <p className="text-sm text-muted-foreground">
          Paste CSV with a header row. Supported fields: <code className="rounded bg-muted px-1">firstName, lastName, email, personalEmail, mobileNumber, gender, employmentType, departmentId, designationId, gradeId</code>
        </p>
      </div>
      <Card>
        <CardContent className="space-y-3 p-5">
          <textarea
            className="min-h-[220px] w-full rounded-md border bg-background p-3 font-mono text-xs"
            placeholder={"firstName,lastName,email,mobileNumber,gender,employmentType\nttt,,test@gmail.com,,,\n" + "Jane,Smith,,+919999999999,OTHER,PERMANENT"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button onClick={submit} disabled={busy}>
            <Upload className="mr-1 h-4 w-4" /> {busy ? "Uploading…" : "Upload batch"}
          </Button>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Upload results</CardTitle>
            <CardDescription>Batch summary</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Created: <strong>{result.created}</strong> · Skipped: <strong>{result.skipped}</strong> · Errors: <strong>{result.errors.length}</strong></p>
            {result.errors.length > 0 ? (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <p key={i} className="rounded-md bg-destructive/10 px-3 py-1.5 text-xs">
                    Row {e.index}: {e.message}
                  </p>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}