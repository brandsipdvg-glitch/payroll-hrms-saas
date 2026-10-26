"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { RefreshCw, ShieldAlert, ShieldCheck, KeyRound, LogOut } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Dialog } from "@/components/ui/dialog";
import { apiFetch, ApiClientError } from "@/lib/client/api";

export function SecurityPanel() {
  const { data: session, update } = useSession();
  const enabled = !!session?.user?.twoFactorEnabled;
  const [setup, setSetup] = useState<{ qrDataUrl: string; secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const startSetup = async () => {
    setBusy(true);
    try {
      const res = (await apiFetch("/api/v1/auth/2fa/setup", { method: "POST" })) as {
        qrDataUrl: string;
        secret: string;
        otpauthUrl: string;
      };
      setSetup(res);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to start 2FA setup.");
    } finally {
      setBusy(false);
    }
  };

  const enable = async () => {
    if (!setup) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/auth/2fa/enable", { method: "POST", body: JSON.stringify({ secret: setup.secret, code }) });
      toast.success("Two-factor authentication enabled.");
      setSetup(null);
      setCode("");
      await update();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    const value = window.prompt("Enter your current 6-digit authenticator code to disable 2FA:");
    if (!value) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/auth/2fa/disable", { method: "POST", body: JSON.stringify({ code: value }) });
      toast.success("Two-factor authentication disabled. Sign in again to continue.");
      await update();
      window.location.href = "/login";
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to disable 2FA.");
    } finally {
      setBusy(false);
    }
  };

  const revokeSessions = async () => {
    if (!window.confirm("Revoke all active sessions? You will be signed out from every device.")) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/auth/sessions/revoke", { method: "POST" });
      toast.success("All sessions revoked.");
      window.location.href = "/login";
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Failed to revoke sessions.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Security & sessions</h1>
        <p className="text-sm text-muted-foreground">Manage two-factor authentication and active sessions for your account.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                {enabled ? <ShieldCheck className="h-4 w-4 text-emerald-500" /> : <ShieldAlert className="h-4 w-4 text-amber-500" />}
                Two-factor authentication
              </CardTitle>
              <CardDescription>
                {enabled
                  ? "Your account is protected by an authenticator app (TOTP)."
                  : "Add an extra layer of security with a one-time passcode from your authenticator app."}
              </CardDescription>
            </div>
            {enabled ? <Badge variant="success">Enabled</Badge> : <Badge variant="warning">Not enabled</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          {!enabled ? (
            <Button onClick={startSetup} disabled={busy}>
              {busy ? <Spinner /> : <KeyRound className="h-4 w-4" />} Set up authenticator app
            </Button>
          ) : (
            <Button variant="outline" className="text-destructive" onClick={disable} disabled={busy}>
              Disable two-factor authentication
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <LogOut className="h-4 w-4" /> Session management
          </CardTitle>
          <CardDescription>
            Revoking sessions signs you out of every device. A signed-out device must authenticate again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={revokeSessions} disabled={busy}>
            {busy ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Revoke all sessions
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={setup !== null}
        onOpenChange={(o) => !o && setSetup(null)}
        title="Set up authenticator"
        description="Scan the QR code with Google Authenticator, Authy, or any TOTP app."
      >
        {setup ? (
          <div className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qrDataUrl} alt="QR code for two-factor authentication" className="mx-auto h-48 w-48 rounded-md border" />
            <div>
              <Label>Secret key (manual entry)</Label>
              <Input readOnly value={setup.secret} className="mt-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="2fa-code">Verification code</Label>
              <Input
                id="2fa-code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                placeholder="000000"
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <Button className="w-full" onClick={enable} disabled={busy || code.length !== 6}>
              {busy ? <Spinner /> : null} Verify & enable
            </Button>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}