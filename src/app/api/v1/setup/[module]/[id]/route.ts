import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { getSetupController } from "@/server/setup-controllers";

export const runtime = "nodejs";

type Params = { params: Promise<{ module: string; id: string }> };

export const GET = (req: NextRequest, { params }: Params) =>
  api(async () => {
    const { module, id } = await params;
    const c = getSetupController(module);
    if (!c) throw notFound(`Unknown setup module "${module}".`);
    return c.get(req, id);
  });

export const PATCH = (req: NextRequest, { params }: Params) =>
  api(async () => {
    const { module, id } = await params;
    const c = getSetupController(module);
    if (!c) throw notFound(`Unknown setup module "${module}".`);
    return c.update(req, id);
  });

export const DELETE = (req: NextRequest, { params }: Params) =>
  api(async () => {
    const { module, id } = await params;
    const c = getSetupController(module);
    if (!c) throw notFound(`Unknown setup module "${module}".`);
    return c.remove(req, id);
  });