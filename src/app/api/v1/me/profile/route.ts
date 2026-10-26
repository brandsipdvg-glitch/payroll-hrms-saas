import { NextRequest } from "next/server";
import { api } from "@/lib/api";
import { myProfile, updateProfile } from "@/server/controllers/me-profile";

export const runtime = "nodejs";

export const GET = (_req: NextRequest) => api(myProfile);
export const PATCH = (req: NextRequest) => api(() => updateProfile(req));