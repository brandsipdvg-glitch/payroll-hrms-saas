import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { mobilePayslipDetail } from "@/server/controllers/mobile";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const GET = (req: NextRequest, { params }: Params) => api(async () => mobilePayslipDetail(req, (await params).id));