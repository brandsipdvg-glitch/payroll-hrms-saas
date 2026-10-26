import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { updateDevice, deleteDevice, syncDevice } from "@/server/controllers/attendance";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export const PATCH = (req: NextRequest, { params }: Params) => api(async () => updateDevice(req, (await params).id));
export const DELETE = (req: NextRequest, { params }: Params) => api(async () => deleteDevice(req, (await params).id));
export const POST = (req: NextRequest, { params }: Params) => api(async () => syncDevice(req, (await params).id));