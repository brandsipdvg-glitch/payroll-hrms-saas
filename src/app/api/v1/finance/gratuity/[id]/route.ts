import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { deleteGratuity } from "@/server/controllers/finance";

export const runtime = "nodejs";

export const DELETE = (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => api(async () => deleteGratuity(req, (await params).id));