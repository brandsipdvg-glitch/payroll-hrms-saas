import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { resignationsController } from "@/server/services/lifecycle";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; recordId: string }> };

export const GET = (req: NextRequest, { params }: Params) =>
  api(async () => {
    const { id, recordId } = await params;
    return resignationsController.get(req, id, recordId);
  });
export const PATCH = (req: NextRequest, { params }: Params) =>
  api(async () => {
    const { id, recordId } = await params;
    return resignationsController.update(req, id, recordId);
  });
export const DELETE = (req: NextRequest, { params }: Params) =>
  api(async () => {
    const { id, recordId } = await params;
    return resignationsController.remove(req, id, recordId);
  });