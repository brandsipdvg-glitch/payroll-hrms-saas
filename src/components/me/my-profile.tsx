"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/client/api";
import { myProfileApi, myProfileBankApi } from "@/lib/client/api";
import { ApiClientError } from "@/lib/client/api";
import { formatDate, formatCurrency } from "@/lib/utils";

type Row = Record<string, unknown>;

export function MyProfile() {
  const [profile, setProfile] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [bank, setBank] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Row>(myProfileApi);
      setProfile(data);
      const bankRow = ((data.bankDetails as Row[] | undefined)?.[0] as Row | undefined) ?? {};
      setForm({
        personalEmail: String(data.personalEmail ?? ""),
        mobileNumber: String(data.mobileNumber ?? ""),
        address: String(data.address ?? ""),
        emergencyContactName: String(data.emergencyContactName ?? ""),
        emergencyContactNumber: String(data.emergencyContactNumber ?? ""),
        panNumber: String(data.panNumber ?? ""),
        aadhaarNumber: String(data.aadhaarNumber ?? ""),
      });
      setBank({
        accountHolderName: String(bankRow.accountHolderName ?? ""),
        accountNumber: String(bankRow.accountNumber ?? ""),
        ifscCode: String(bankRow.ifscCode ?? ""),
        bankName: String(bankRow.bankName ?? ""),
        bankBranch: String(bankRow.bankBranch ?? ""),
      });
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    try {
      await apiFetch(myProfileApi, { method: "PATCH", body: JSON.stringify(form) });
      toast.success("Profile updated.");
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const saveBank = async () => {
    setSaving(true);
    try {
      await apiFetch(myProfileBankApi, { method: "PATCH", body: JSON.stringify(bank) });
      toast.success("Bank details updated.");
      void load();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const field = (key: string) => form[key] ?? "";
  const bankField = (key: string) => bank[key] ?? "";
  const manager = profile?.reportingManager as Row | undefined;
  const salary = profile?.salaryStructures as Row[] | undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">My Profile</h1>
          <p className="text-sm text-muted-foreground">Self-service view and edit of your employee record.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1 h-4 w-4" /> Refresh
        </Button>
      </div>

      {loading && !profile ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Summary</CardTitle>
            <CardDescription></CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
              {String(profile?.firstName ?? "").slice(0, 1)}{String(profile?.lastName ?? "").slice(0, 1)}
            </div>
            <p className="font-medium">{String(profile?.firstName ?? "")} {String(profile?.lastName ?? "")}</p>
            <p className="text-muted-foreground">{String(profile?.employeeCode ?? "")}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="secondary">{String(profile?.employmentStatus ?? "")}</Badge>
              <Badge variant="outline">{String((profile?.designation as Row | undefined)?.title ?? "")}</Badge>
            </div>
            <dl className="space-y-1 pt-2">
              <Summary label="Department" value={String((profile?.department as Row | undefined)?.name ?? "—")} />
              <Summary label="Designation" value={String((profile?.designation as Row | undefined)?.title ?? "—")} />
              <Summary label="Grade" value={String((profile?.grade as Row | undefined)?.name ?? "—")} />
              <Summary label="Branch" value={String((profile?.branch as Row | undefined)?.name ?? "—")} />
              <Summary label="Date of joining" value={profile?.doj ? formatDate(profile.doj as string) : "—"} />
              <Summary label="Reporting manager" value={manager ? `${String(manager.firstName)} ${String(manager.lastName)}` : "—"} />
              <Summary label="Company email" value={String(profile?.companyEmail ?? "—")} />
            </dl>
            {salary?.[0] ? (
              <p className="pt-1 text-xs text-muted-foreground">
                Current gross: <strong>{formatCurrency(Number((salary[0] as Row).grossSalary))}</strong>
                {salary[0].effectiveFrom ? ` since ${formatDate((salary[0] as Row).effectiveFrom as string)}` : ""}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Personal details</CardTitle>
            <CardDescription>Update contact and identification fields.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <FieldSet label="Personal email">
              <Input value={field("personalEmail")} onChange={(e) => setForm({ ...form, personalEmail: e.target.value })} />
            </FieldSet>
            <FieldSet label="Mobile number">
              <Input value={field("mobileNumber")} onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })} />
            </FieldSet>
            <FieldSet label="Address" className="sm:col-span-2">
              <Input value={field("address")} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </FieldSet>
            <FieldSet label="Emergency contact">
              <Input value={field("emergencyContactName")} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} />
            </FieldSet>
            <FieldSet label="Emergency number">
              <Input value={field("emergencyContactNumber")} onChange={(e) => setForm({ ...form, emergencyContactNumber: e.target.value })} />
            </FieldSet>
            <FieldSet label="PAN number">
              <Input value={field("panNumber")} onChange={(e) => setForm({ ...form, panNumber: e.target.value })} />
            </FieldSet>
            <FieldSet label="Aadhaar number">
              <Input value={field("aadhaarNumber")} onChange={(e) => setForm({ ...form, aadhaarNumber: e.target.value })} />
            </FieldSet>
            <div className="sm:col-span-2">
              <Button onClick={saveProfile} disabled={saving}>
                <Save className="mr-1 h-4 w-4" /> Save personal details
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Bank details</CardTitle>
            <CardDescription>Update account information used for salary disbursal.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <FieldSet label="Account holder" className="sm:col-span-2">
              <Input value={bankField("accountHolderName")} onChange={(e) => setBank({ ...bank, accountHolderName: e.target.value })} />
            </FieldSet>
            <FieldSet label="Account number">
              <Input value={bankField("accountNumber")} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} />
            </FieldSet>
            <FieldSet label="IFSC code">
              <Input value={bankField("ifscCode")} onChange={(e) => setBank({ ...bank, ifscCode: e.target.value })} />
            </FieldSet>
            <FieldSet label="Bank name">
              <Input value={bankField("bankName")} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} />
            </FieldSet>
            <FieldSet label="Branch">
              <Input value={bankField("bankBranch")} onChange={(e) => setBank({ ...bank, bankBranch: e.target.value })} />
            </FieldSet>
            <div className="sm:col-span-2">
              <Button onClick={saveBank} disabled={saving}>
                <Save className="mr-1 h-4 w-4" /> Save bank details
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function FieldSet({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}