import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listAssets, createAsset } from "@/server/controllers/assets";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listAssets(req));
export const POST = (req: NextRequest) => api(() => createAsset(req));