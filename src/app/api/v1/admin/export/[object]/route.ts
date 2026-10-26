import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { exportObject } from "@/server/controllers/reporting";

export const runtime = "nodejs";

type Params = { params: Promise<{ object: string }> };

export const GET = (req: NextRequest, { params }: Params) =>
  api(async () => { (await params); return exportObject(req); });