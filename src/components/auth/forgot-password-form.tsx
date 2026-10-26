"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { apiFetch, ApiClientError } from "@/lib/client/api";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = (await apiFetch<{ message: string; resetUrl?: string }>("/api/v1/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      })) as { message: string; resetUrl?: string };
      setResult(res.message);
      setResetUrl(res.resetUrl ?? null);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Failed to request reset.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border bg-card p-6 shadow-sm">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">Reset your password</h2>
        <p className="text-sm text-muted-foreground">
          Enter your account email and we will create a reset link for you.
        </p>
      </div>

      {result ? (
        <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <p>{result}</p>
          {resetUrl ? (
            <>
              <p className="text-xs">Development only – reset link:</p>
              <Link href={resetUrl} className="text-xs font-medium text-primary underline">
                Open reset page
              </Link>
            </>
          ) : null}
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <>
                <Spinner /> Sending…
              </>
            ) : (
              "Send reset link"
            )}
          </Button>
        </>
      )}

      <p className="text-center text-sm">
        <Link href="/login" className="inline-flex items-center gap-1 text-primary hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
      </p>
    </form>
  );
}