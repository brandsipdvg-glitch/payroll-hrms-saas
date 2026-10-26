import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listReimbursements, createReimbursement } from "@/server/controllers/finance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listReimbursements(req));
export const POST = (req: NextRequest) => api(() => createReimbursement(req));