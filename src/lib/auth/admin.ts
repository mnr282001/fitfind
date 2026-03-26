import type { User } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

export async function isAdminUser(userId: string): Promise<boolean> {
  const svc = createServiceClient();
  if (!svc) return false;
  const { data, error } = await svc.from("admin_users").select("profile_id").eq("profile_id", userId).maybeSingle();
  if (error) {
    console.error("[FitFind admin] admin lookup failed:", error.message);
    return false;
  }
  return Boolean(data);
}

export async function requireAdmin(user: User | null): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (!user) return { ok: false, response: Response.json({ error: "Sign in required" }, { status: 401 }) };
  const isAdmin = await isAdminUser(user.id);
  if (!isAdmin) {
    return { ok: false, response: Response.json({ error: "Admin access required" }, { status: 403 }) };
  }
  return { ok: true };
}
