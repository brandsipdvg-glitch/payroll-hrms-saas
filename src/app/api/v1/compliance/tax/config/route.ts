import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listItConfigs, createItConfig } from "@/server/controllers/compliance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(async () => listItConfigs(req));
export const POST = (req: NextRequest) => api(async () => createItConfig(req));