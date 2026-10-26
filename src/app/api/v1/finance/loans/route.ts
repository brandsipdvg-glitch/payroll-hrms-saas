import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { listLoans, createLoan } from "@/server/controllers/finance";

export const runtime = "nodejs";

export const GET = (req: NextRequest) => api(() => listLoans(req));
export const POST = (req: NextRequest) => api(() => createLoan(req));