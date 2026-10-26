"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function TwoFactorForm() {
  const router = useRouter();
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((s) => {
        if (s?.mfaPending && s?.mfaUserId) setPendingUserId(s.mfaUserId);
      })
      .catch(() => undefined);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUserId) {
      setError("No pending login found. Please sign in again.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", { redirect: false, pendingUserId, twoFactorCode: code });
      if (res?.error) {
        setError("Invalid authenticator code.");
        return;
      }
      toast.success("Verified! Welcome back.");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to verify the code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border bg-card p-6 shadow-sm">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">Two-factor authentication</h2>
        <p className="text-sm text-muted-foreground">
          Enter the 6-digit code from your authenticator app to complete sign in.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="code">Authenticator code</Label>
        <Input
          id="code"
          inputMode="numeric"
          maxLength={6}
          pattern="\d{6}"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          className="text-center text-lg tracking-[0.5em]"
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading || !code}>
        {loading ? (
          <>
            <Spinner /> Verifying…
          </>
        ) : (
          "Verify & continue"
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Lost your device?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in again
        </Link>
      </p>
    </form>
  );
}