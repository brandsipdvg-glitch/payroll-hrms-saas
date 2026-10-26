import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { adjustBalanceAdmin } from "@/server/controllers/leave";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const PATCH = (req: NextRequest, { params }: Params) => api(async () => adjustBalanceAdmin(req, (await params).id));