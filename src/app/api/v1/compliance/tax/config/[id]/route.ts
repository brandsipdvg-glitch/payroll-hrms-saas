import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { updateItConfig } from "@/server/controllers/compliance";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const PUT = (req: NextRequest, { params }: Params) => api(async () => updateItConfig(req, (await params).id));