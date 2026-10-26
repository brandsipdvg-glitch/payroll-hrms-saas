import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listMyAssets } from "@/server/controllers/me";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listMyAssets(req));
