import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listLeaveTypes, createLeaveType } from "@/server/controllers/leave";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listLeaveTypes(req));
export const POST = (req: NextRequest) => api(() => createLeaveType(req));