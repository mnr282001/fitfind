import { createClient } from "@/lib/supabase/server";
import FitFind from "@/components/FitFind";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let isAdmin = false;
  if (user) {
    const { data } = await supabase.from("admin_users").select("profile_id").eq("profile_id", user.id).maybeSingle();
    isAdmin = Boolean(data);
  }

  return (
    <FitFind
      user={
        user
          ? { id: user.id, email: user.email ?? null }
          : null
      }
      isAdmin={isAdmin}
    />
  );
}