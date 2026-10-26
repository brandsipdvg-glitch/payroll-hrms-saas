import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { transfersController } from "@/server/services/lifecycle";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; recordId: string }> };

export const GET = (req: NextRequest, { params }: Params) =>
  api(async () => {
    const { id, recordId } = await params;
    return transfersController.get(req, id, recordId);
  });
export const PATCH = (req: NextRequest, { params }: Params) =>
  api(async () => {
    const { id, recordId } = await params;
    return transfersController.update(req, id, recordId);
  });
export const DELETE = (req: NextRequest, { params }: Params) =>
  api(async () => {
    const { id, recordId } = await params;
    return transfersController.remove(req, id, recordId);
  });