import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { cancelMyReimbursement } from "@/server/controllers/me-finance";

export const runtime = "nodejs";

export const POST = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => api(async () => cancelMyReimbursement(req, (await params).id));