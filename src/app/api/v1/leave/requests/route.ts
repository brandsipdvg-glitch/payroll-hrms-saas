import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listLeaveRequests, applyLeaveAdmin } from "@/server/controllers/leave";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listLeaveRequests(req));
export const POST = (req: NextRequest) => api(() => applyLeaveAdmin(req));