import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { notFound } from "next/navigation";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) notFound();
  return (
    <Suspense>
      <ResetPasswordForm token={token} />
    </Suspense>
  );
}