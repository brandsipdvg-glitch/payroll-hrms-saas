import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { analyticsEndpoint, systemHealth } from "@/server/controllers/admin";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => analyticsEndpoint(req));
export const POST = (req: NextRequest) => api(() => systemHealth(req));