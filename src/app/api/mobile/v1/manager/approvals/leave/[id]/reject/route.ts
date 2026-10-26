import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { managerApproveLeave } from "@/server/controllers/mobile";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const POST = (req: NextRequest, { params }: Params) =>
  api(async () => managerApproveLeave(req, (await params).id, false));