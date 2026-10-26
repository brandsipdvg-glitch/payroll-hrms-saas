import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "next-auth";
import { AppError, badRequest } from "./errors";

export function ok<T>(data: T, meta?: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json({ success: true, data, meta } as { success: true; data: T; meta?: unknown }, {
    status,
  });
}

export const created = <T>(data: T) => ok(data, undefined, 201);

export function fail(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status }
    );
  }
  if (error instanceof ZodError) {
    const details = error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return NextResponse.json(
      {
        success: false,
        error: { code: "VALIDATION_ERROR", message: details[0]?.message ?? "Validation failed", details },
      },
      { status: 400 }
    );
  }
  if (error instanceof AuthError) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "Authentication failed." } },
      { status: 401 }
    );
  }
  console.error("[api:unhandled]", error);
  return NextResponse.json(
    { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error." } },
    { status: 500 }
  );
}

/** Wraps a route handler with unified error handling. */
export async function api(fn: () => Promise<NextResponse | Response>): Promise<NextResponse | Response> {
  try {
    return await fn();
  } catch (error) {
    return fail(error);
  }
}

export async function parseJson(req: Request): Promise<unknown> {
  return req.json().catch(() => {
    throw badRequest("Invalid JSON body.");
  });
}

export function getSearchParams(req: Request) {
  return new URL(req.url).searchParams;
}