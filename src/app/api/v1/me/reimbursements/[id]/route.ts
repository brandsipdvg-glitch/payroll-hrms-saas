import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { updateMyReimbursement } from "@/server/controllers/me-finance";

export const runtime = "nodejs";

export const PATCH = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => api(async () => updateMyReimbursement(req, (await params).id));