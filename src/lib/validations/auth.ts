import { z } from "zod";

export const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid email address."),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const enable2FaSchema = z.object({
  secret: z.string().min(1, "Secret is required. Re-generate a new setup."),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator."),
});

export const disable2FaSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator."),
});

export const verify2FaApiSchema = z.object({
  pendingUserId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator."),
});