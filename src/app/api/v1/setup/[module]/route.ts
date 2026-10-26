import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { getSetupController } from "@/server/setup-controllers";

export const runtime = "nodejs";

type Params = { params: Promise<{ module: string }> };

export const GET = (req: NextRequest, { params }: Params) =>
  api(async () => {
    const { module } = await params;
    const c = getSetupController(module);
    if (!c) throw notFound(`Unknown setup module "${module}".`);
    return c.list(req);
  });

export const POST = (req: NextRequest, { params }: Params) =>
  api(async () => {
    const { module } = await params;
    const c = getSetupController(module);
    if (!c) throw notFound(`Unknown setup module "${module}".`);
    return c.create(req);
  });