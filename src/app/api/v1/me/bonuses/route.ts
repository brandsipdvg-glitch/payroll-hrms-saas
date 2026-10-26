import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listMyBonuses } from "@/server/controllers/me-finance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listMyBonuses(req));