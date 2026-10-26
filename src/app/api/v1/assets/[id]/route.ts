import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { getAsset, updateAsset, deleteAsset } from "@/server/controllers/assets";

export const runtime = "nodejs";

export const GET = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) =>
  api(async () => getAsset(req, (await params).id));
export const PATCH = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) =>
  api(async () => updateAsset(req, (await params).id));
export const DELETE = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) =>
  api(async () => deleteAsset(req, (await params).id));