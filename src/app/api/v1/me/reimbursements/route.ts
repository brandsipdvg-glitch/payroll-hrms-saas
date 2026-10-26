import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listMyReimbursements, createMyReimbursement } from "@/server/controllers/me-finance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listMyReimbursements(req));
export const POST = (req: NextRequest) => api(() => createMyReimbursement(req));