import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { mobileLeaveList, mobileLeaveApply } from "@/server/controllers/mobile";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => mobileLeaveList(req));
export const POST = (req: NextRequest) => api(() => mobileLeaveApply(req));