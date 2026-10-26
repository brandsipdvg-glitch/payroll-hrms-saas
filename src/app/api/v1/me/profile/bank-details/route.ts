import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { updateBankDetails } from "@/server/controllers/me-profile";

export const runtime = "nodejs";

export const PATCH = (req: NextRequest) => api(() => updateBankDetails(req));