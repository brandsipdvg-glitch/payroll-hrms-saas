import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { deleteAdjustment } from "@/server/controllers/payroll";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const DELETE = (req: NextRequest, { params }: Params) => api(async () => deleteAdjustment(req, (await params).id));