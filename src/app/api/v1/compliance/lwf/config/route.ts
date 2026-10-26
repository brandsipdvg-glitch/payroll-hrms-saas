import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listLwfConfigs, createLwfConfig } from "@/server/controllers/compliance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(async () => listLwfConfigs(req));
export const POST = (req: NextRequest) => api(async () => createLwfConfig(req));