import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { runAnnualCredit } from "@/server/controllers/leave";

export const runtime = "nodejs";

export const POST = (req: NextRequest) => api(() => runAnnualCredit(req));