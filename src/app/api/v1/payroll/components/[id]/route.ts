import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { updatePayComponent, archivePayComponent } from "@/server/controllers/payroll";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const PATCH = (req: NextRequest, { params }: Params) => api(async () => updatePayComponent(req, (await params).id));
export const DELETE = (req: NextRequest, { params }: Params) => api(async () => archivePayComponent(req, (await params).id));