import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { processReimbursement } from "@/server/controllers/finance";

export const runtime = "nodejs";

export const POST = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => api(async () => processReimbursement(req, (await params).id));