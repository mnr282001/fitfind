import { requireAdmin } from "@/lib/auth/admin";
import { requireUser } from "@/lib/auth/require-user";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const { user, unauthorized } = await requireUser();
  if (!user) return unauthorized;
  const adminGate = await requireAdmin(user);
  if (!adminGate.ok) return adminGate.response;

  const svc = createServiceClient();
  if (!svc) {
    return Response.json(
      { error: "Monitoring unavailable. Configure SUPABASE_SERVICE_ROLE_KEY first." },
      { status: 503 }
    );
  }

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: usageRows, error: usageErr },
    { data: errorRows, error: errErr },
    { data: byUserRows, error: byUserErr },
  ] = await Promise.all([
    svc
      .from("token_usage_events")
      .select("user_id,estimated_cost_usd,total_tokens,prompt_tokens,completion_tokens,created_at,provider,model,status")
      .gte("created_at", since30d)
      .order("created_at", { ascending: false }),
    svc
      .from("api_error_events")
      .select("endpoint,provider,model,http_status,error_code,message,created_at,user_id")
      .order("created_at", { ascending: false })
      .limit(25),
    svc
      .from("token_usage_events")
      .select("user_id,estimated_cost_usd,total_tokens")
      .gte("created_at", since30d),
  ]);

  if (usageErr || errErr || byUserErr) {
    const detail = usageErr?.message ?? errErr?.message ?? byUserErr?.message ?? "Unknown database error";
    return Response.json({ error: "Failed to load monitoring data", detail }, { status: 500 });
  }

  const usage = usageRows ?? [];
  const errors = errorRows ?? [];
  const perUserMap = new Map<string, { estimated_cost_usd: number; total_tokens: number }>();
  for (const row of byUserRows ?? []) {
    const uid = row.user_id;
    const curr = perUserMap.get(uid) ?? { estimated_cost_usd: 0, total_tokens: 0 };
    curr.estimated_cost_usd += Number(row.estimated_cost_usd ?? 0);
    curr.total_tokens += Number(row.total_tokens ?? 0);
    perUserMap.set(uid, curr);
  }
  const top_users_last_30d = Array.from(perUserMap.entries())
    .map(([user_id, totals]) => ({
      user_id,
      estimated_cost_usd: Number(totals.estimated_cost_usd.toFixed(6)),
      total_tokens: totals.total_tokens,
    }))
    .sort((a, b) => b.estimated_cost_usd - a.estimated_cost_usd)
    .slice(0, 10);
  const totals = usage.reduce(
    (acc, row) => {
      acc.estimated_cost_usd += Number(row.estimated_cost_usd ?? 0);
      acc.total_tokens += Number(row.total_tokens ?? 0);
      acc.prompt_tokens += Number(row.prompt_tokens ?? 0);
      acc.completion_tokens += Number(row.completion_tokens ?? 0);
      acc.requests += 1;
      if (row.status === "error") acc.error_requests += 1;
      return acc;
    },
    {
      estimated_cost_usd: 0,
      total_tokens: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      requests: 0,
      error_requests: 0,
    }
  );

  return Response.json({
    last_30d: {
      ...totals,
      estimated_cost_usd: Number(totals.estimated_cost_usd.toFixed(6)),
    },
    recent_token_usage: usage.slice(0, 25),
    recent_errors: errors,
    top_users_last_30d,
  });
}
