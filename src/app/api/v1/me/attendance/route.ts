import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listMyAttendance, selfPunch } from "@/server/controllers/me";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listMyAttendance(req));
export const POST = (req: NextRequest) => api(() => selfPunch(req));