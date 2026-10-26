import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { updateLwfConfig } from "@/server/controllers/compliance";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const PUT = (req: NextRequest, { params }: Params) => api(async () => updateLwfConfig(req, (await params).id));