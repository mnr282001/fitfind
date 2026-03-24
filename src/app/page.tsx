import { createClient } from "@/lib/supabase/server";
import FitFind from "@/components/FitFind";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <FitFind
      user={
        user
          ? { id: user.id, email: user.email ?? null }
          : null
      }
    />
  );
}