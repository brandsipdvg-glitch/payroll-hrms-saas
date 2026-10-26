import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { promotionsController } from "@/server/services/lifecycle";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const GET = (req: NextRequest, { params }: Params) =>
  api(async () => promotionsController.list(req, (await params).id));
export const POST = (req: NextRequest, { params }: Params) =>
  api(async () => promotionsController.create(req, (await params).id));