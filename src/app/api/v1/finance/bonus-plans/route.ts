import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listBonusPlans, createBonusPlan } from "@/server/controllers/finance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listBonusPlans(req));
export const POST = (req: NextRequest) => api(() => createBonusPlan(req));