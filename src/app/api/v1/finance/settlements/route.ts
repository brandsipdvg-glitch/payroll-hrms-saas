import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listSettlements, createSettlement } from "@/server/controllers/finance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listSettlements(req));
export const POST = (req: NextRequest) => api(() => createSettlement(req));