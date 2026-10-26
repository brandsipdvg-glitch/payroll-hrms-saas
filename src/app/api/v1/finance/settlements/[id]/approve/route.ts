import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { approveSettlement } from "@/server/controllers/finance";

export const runtime = "nodejs";

export const POST = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => api(async () => approveSettlement(req, (await params).id));