import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { getSettlement, deleteSettlement } from "@/server/controllers/finance";

export const runtime = "nodejs";

export const GET = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => api(async () => getSettlement(req, (await params).id));
export const DELETE = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => api(async () => deleteSettlement(req, (await params).id));