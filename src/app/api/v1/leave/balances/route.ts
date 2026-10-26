import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listBalances } from "@/server/controllers/leave";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listBalances(req));