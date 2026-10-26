import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listEncashments, createEncashment } from "@/server/controllers/leave";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listEncashments(req));
export const POST = (req: NextRequest) => api(() => createEncashment(req));