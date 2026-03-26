import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdminUser } from "@/lib/auth/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

type UsageRow = {
  user_id: string;
  endpoint: string;
  provider: string;
  model: string;
  total_tokens: number;
  estimated_cost_usd: number;
  created_at: string;
};

type ErrorRow = {
  user_id: string;
  endpoint: string;
  provider: string;
  model: string | null;
  http_status: number | null;
  error_code: string | null;
  message: string;
  created_at: string;
};

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!(await isAdminUser(user.id))) redirect("/");

  const svc = createServiceClient();
  if (!svc) {
    return (
      <main style={{ maxWidth: 980, margin: "40px auto", padding: "0 16px", color: "#eee" }}>
        <h1 style={{ fontSize: 28, marginBottom: 12 }}>Admin Monitoring</h1>
        <p>Monitoring unavailable. Configure `SUPABASE_SERVICE_ROLE_KEY`.</p>
      </main>
    );
  }

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: usageRows }, { data: errorRows }] = await Promise.all([
    svc
      .from("token_usage_events")
      .select("user_id,endpoint,provider,model,total_tokens,estimated_cost_usd,created_at")
      .gte("created_at", since30d)
      .order("created_at", { ascending: false })
      .limit(150),
    svc
      .from("api_error_events")
      .select("user_id,endpoint,provider,model,http_status,error_code,message,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const usage = (usageRows ?? []) as UsageRow[];
  const errors = (errorRows ?? []) as ErrorRow[];
  const totals = usage.reduce(
    (acc, row) => {
      acc.cost += Number(row.estimated_cost_usd ?? 0);
      acc.tokens += Number(row.total_tokens ?? 0);
      return acc;
    },
    { cost: 0, tokens: 0 }
  );

  const topUsers = Array.from(
    usage.reduce((map, row) => {
      const current = map.get(row.user_id) ?? { user_id: row.user_id, user_email: null as string | null, cost: 0, tokens: 0, calls: 0 };
      current.cost += Number(row.estimated_cost_usd ?? 0);
      current.tokens += Number(row.total_tokens ?? 0);
      current.calls += 1;
      map.set(row.user_id, current);
      return map;
    }, new Map<string, { user_id: string; user_email: string | null; cost: number; tokens: number; calls: number }>())
  )
    .map(([, value]) => value)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 20);

  const topUserIds = topUsers.map((row) => row.user_id);
  let emailByUserId = new Map<string, string>();
  if (topUserIds.length > 0) {
    const { data: profileRows } = await svc.from("profiles").select("id,email").in("id", topUserIds);
    emailByUserId = new Map(
      (profileRows ?? [])
        .filter((row) => typeof row.id === "string" && typeof row.email === "string" && row.email.length > 0)
        .map((row) => [row.id as string, row.email as string])
    );
  }
  const topUsersWithEmail = topUsers.map((row) => ({
    ...row,
    user_email: emailByUserId.get(row.user_id) ?? null,
  }));

  return (
    <main style={{ maxWidth: 1080, margin: "28px auto 60px", padding: "0 16px", color: "#e7e7ea", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>Admin Monitoring</h1>
        <Link href="/" style={{ color: "#d1a38b", textDecoration: "none" }}>Back to FitFind</Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, marginBottom: 20 }}>
        <div style={{ border: "1px solid #2c2c31", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Estimated spend (30d)</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>${totals.cost.toFixed(2)}</div>
        </div>
        <div style={{ border: "1px solid #2c2c31", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Token usage (30d)</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{totals.tokens.toLocaleString()}</div>
        </div>
        <div style={{ border: "1px solid #2c2c31", borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Recent errors</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{errors.length}</div>
        </div>
      </div>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Top Users By Spend (30d)</h2>
        <div style={{ border: "1px solid #2c2c31", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#15151a", textAlign: "left" }}>
                <th style={{ padding: 10 }}>User ID</th>
                <th style={{ padding: 10 }}>User Email</th>
                <th style={{ padding: 10 }}>Spend</th>
                <th style={{ padding: 10 }}>Tokens</th>
                <th style={{ padding: 10 }}>Calls</th>
              </tr>
            </thead>
            <tbody>
              {topUsersWithEmail.map((row) => (
                <tr key={row.user_id} style={{ borderTop: "1px solid #2c2c31" }}>
                  <td style={{ padding: 10, fontFamily: "monospace" }}>{row.user_id}</td>
                  <td style={{ padding: 10 }}>{row.user_email ?? "-"}</td>
                  <td style={{ padding: 10 }}>${row.cost.toFixed(4)}</td>
                  <td style={{ padding: 10 }}>{row.tokens.toLocaleString()}</td>
                  <td style={{ padding: 10 }}>{row.calls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Recent API Errors</h2>
        <div style={{ border: "1px solid #2c2c31", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#15151a", textAlign: "left" }}>
                <th style={{ padding: 10 }}>When</th>
                <th style={{ padding: 10 }}>User</th>
                <th style={{ padding: 10 }}>Endpoint</th>
                <th style={{ padding: 10 }}>Status</th>
                <th style={{ padding: 10 }}>Message</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((row, idx) => (
                <tr key={`${row.created_at}-${idx}`} style={{ borderTop: "1px solid #2c2c31" }}>
                  <td style={{ padding: 10 }}>{new Date(row.created_at).toLocaleString()}</td>
                  <td style={{ padding: 10, fontFamily: "monospace" }}>{row.user_id}</td>
                  <td style={{ padding: 10 }}>{row.endpoint}</td>
                  <td style={{ padding: 10 }}>{row.http_status ?? "-"}</td>
                  <td style={{ padding: 10 }}>{row.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
