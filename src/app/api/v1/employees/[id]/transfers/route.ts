import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { transfersController } from "@/server/services/lifecycle";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const GET = (req: NextRequest, { params }: Params) =>
  api(async () => transfersController.list(req, (await params).id));
export const POST = (req: NextRequest, { params }: Params) =>
  api(async () => transfersController.create(req, (await params).id));