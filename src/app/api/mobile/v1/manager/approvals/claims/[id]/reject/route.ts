import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { managerApproveClaim } from "@/server/controllers/mobile";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const POST = (req: NextRequest, { params }: Params) =>
  api(async () => managerApproveClaim(req, (await params).id, false));