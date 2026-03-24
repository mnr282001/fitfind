import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export async function requireUser(): Promise<
  { user: User; unauthorized: null } | { user: null; unauthorized: Response }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      unauthorized: Response.json({ error: "Sign in required" }, { status: 401 }),
    };
  }

  return { user, unauthorized: null };
}
