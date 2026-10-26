import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listPfConfigs, createPfConfig } from "@/server/controllers/compliance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(async () => listPfConfigs(req));
export const POST = (req: NextRequest) => api(async () => createPfConfig(req));