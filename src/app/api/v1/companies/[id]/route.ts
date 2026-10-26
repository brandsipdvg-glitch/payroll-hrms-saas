import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { companiesController } from "@/server/setup-controllers";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const GET = (req: NextRequest, { params }: Params) =>
  api(async () => companiesController.get(req, (await params).id));
export const PATCH = (req: NextRequest, { params }: Params) =>
  api(async () => companiesController.update(req, (await params).id));
export const DELETE = (req: NextRequest, { params }: Params) =>
  api(async () => companiesController.remove(req, (await params).id));