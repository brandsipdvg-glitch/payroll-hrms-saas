import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listLeavePolicies, upsertLeavePolicy } from "@/server/controllers/leave";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listLeavePolicies(req));
export const POST = (req: NextRequest) => api(() => upsertLeavePolicy(req));