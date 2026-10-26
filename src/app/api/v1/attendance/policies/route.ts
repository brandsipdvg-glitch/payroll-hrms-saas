import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listPolicies, createPolicy } from "@/server/controllers/attendance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listPolicies(req));
export const POST = (req: NextRequest) => api(() => createPolicy(req));