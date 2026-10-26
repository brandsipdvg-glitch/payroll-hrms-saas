"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiClientError, complianceSettingsApi } from "@/lib/client/api";

type Row = Record<string, unknown>;

const FIELDS: Array<{ key: string; label: string; placeholder: string }> = [
  { key: "pfNumber", label: "EPFO establishment number", placeholder: "BLR/12345/ABC" },
  { key: "pfEstablishmentName", label: "Establishment name (EPFO)", placeholder: "Legal name as registered" },
  { key: "pfBankName", label: "PF remittance bank", placeholder: "HDFC Bank" },
  { key: "pfBankAccount", label: "PF remittance account", placeholder: "Current account no." },
  { key: "pfBankBranch", label: "PF remittance branch", placeholder: "Bank branch" },
  { key: "esiNumber", label: "ESI code number", placeholder: "56000123456780" },
  { key: "esiLocalOffice", label: "ESI local office", placeholder: "Local office / branch" },
  { key: "esiReturnOffice", label: "ESI return office", placeholder: "Where returns are filed" },
  { key: "tan", label: "TAN (income tax)", placeholder: "BLRA12345C" },
  { key: "itTdsCircle", label: "TDS ward / circle", placeholder: "Bangalore" },
  { key: "itAssessingOfficer", label: "Assessing officer", placeholder: "ITO Ward 4(1)" },
];

export function StatutorySettingsForm() {
  const [values, setValues] = useState<Row>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await apiFetch<Row>(complianceSettingsApi);
      setValues(row);
    } catch {
      setValues({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const body: Row = {};
      for (const f of FIELDS) body[f.key] = String(values[f.key] ?? "");
      await apiFetch(complianceSettingsApi, { method: "PUT", body: JSON.stringify(body) });
      toast.success("Statutory settings saved.");
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Company statutory identifiers</CardTitle>
        <CardDescription>EPFO / ESIC / TDS numbers used on returns, ECR and challans.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <Skeleton key={f.key} className="h-9" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`st-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`st-${f.key}`}
                    value={String(values[f.key] ?? "")}
                    placeholder={f.placeholder}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={() => void save()} disabled={saving}>
                <Save className="mr-1.5 h-4 w-4" /> {saving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}