import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { runYearEnd } from "@/server/controllers/leave";

export const runtime = "nodejs";

export const POST = (req: NextRequest) => api(() => runYearEnd(req));