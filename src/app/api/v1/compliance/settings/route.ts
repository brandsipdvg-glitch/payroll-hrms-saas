import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { getSettings, updateSettings } from "@/server/controllers/compliance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(async () => getSettings(req));
export const PUT = (req: NextRequest) => api(async () => updateSettings(req));