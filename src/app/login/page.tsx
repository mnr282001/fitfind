import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

async function ensureGuest() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");
}

export default async function LoginPage() {
  await ensureGuest();
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100dvh", background: "#08080a" }} aria-hidden />
      }
    >
      <LoginForm />
    </Suspense>
  );
}
