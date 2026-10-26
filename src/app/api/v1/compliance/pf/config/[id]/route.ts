import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { updatePfConfig } from "@/server/controllers/compliance";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const PUT = (req: NextRequest, { params }: Params) => api(async () => updatePfConfig(req, (await params).id));