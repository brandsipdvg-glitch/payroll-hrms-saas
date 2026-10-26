import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listPtRegions, createPtRegion } from "@/server/controllers/compliance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(async () => listPtRegions(req));
export const POST = (req: NextRequest) => api(async () => createPtRegion(req));