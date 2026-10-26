import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listMyLeave, applyMyLeave } from "@/server/controllers/me";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listMyLeave(req));
export const POST = (req: NextRequest) => api(() => applyMyLeave(req));