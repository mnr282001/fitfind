import Link from "next/link";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

type AnalysisRunRow = {
  id: string;
  storage_path: string | null;
  created_at: string;
};

type SearchRequestRow = {
  id: string;
  analysis_run_id: string | null;
  search_query: string;
  response: {
    product_name?: string;
    brand?: string;
    price?: string | null;
    url?: string;
    retailer?: string;
    match_confidence?: "high" | "medium" | "low";
    thumbnail?: string | null;
  } | null;
};

const PAGE_SIZE = 3;

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type HistoryPageProps = {
  searchParams?: Promise<{ page?: string }>;
};

export default async function HistoryPage({ searchParams }: HistoryPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const params = searchParams ? await searchParams : {};
  const parsedPage = Number.parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const pageFrom = (currentPage - 1) * PAGE_SIZE;
  const pageTo = pageFrom + PAGE_SIZE - 1;

  const { count: totalRunsCount } = await supabase
    .from("analysis_runs")
    .select("id", { count: "exact", head: true })
    .eq("status", "ok");

  const { data: runRows } = await supabase
    .from("analysis_runs")
    .select("id,storage_path,created_at")
    .eq("status", "ok")
    .order("created_at", { ascending: false })
    .range(pageFrom, pageTo);

  const runs = (runRows ?? []) as AnalysisRunRow[];
  const totalRuns = totalRunsCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRuns / PAGE_SIZE));
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;
  const runIds = runs.map((row) => row.id);

  let searches: SearchRequestRow[] = [];
  if (runIds.length > 0) {
    const { data: searchRows } = await supabase
      .from("search_requests")
      .select("id,analysis_run_id,search_query,response")
      .in("analysis_run_id", runIds)
      .order("created_at", { ascending: false });
    searches = (searchRows ?? []) as SearchRequestRow[];
  }

  const searchesByRunId = searches.reduce((map, row) => {
    if (!row.analysis_run_id) return map;
    const current = map.get(row.analysis_run_id) ?? [];
    current.push(row);
    map.set(row.analysis_run_id, current);
    return map;
  }, new Map<string, SearchRequestRow[]>());

  const svc = createServiceClient();
  const imageUrlByRunId = new Map<string, string>();
  if (svc) {
    for (const row of runs) {
      if (!row.storage_path) continue;
      const { data } = await svc.storage.from("uploads").createSignedUrl(row.storage_path, 60 * 60);
      if (data?.signedUrl) imageUrlByRunId.set(row.id, data.signedUrl);
    }
  }

  return (
    <main
      style={{
        maxWidth: 980,
        margin: "28px auto 64px",
        padding: "0 16px",
        color: "#f1ede7",
        fontFamily: "'Outfit','Helvetica Neue',sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 30, letterSpacing: "-0.02em" }}>Your Previous Uploads & Results</h1>
        <Link href="/" style={{ color: "#d1a38b", textDecoration: "none", fontWeight: 600 }}>
          Back to FitFind
        </Link>
      </div>

      {runs.length === 0 && (
        <div style={{ border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: 18, color: "#c5bfb8" }}>
          {currentPage === 1
            ? "No history yet. Upload your first outfit from the home page."
            : "No history on this page."}
        </div>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        {runs.map((run) => {
          const runSearches = searchesByRunId.get(run.id) ?? [];
          const signedUrl = imageUrlByRunId.get(run.id) ?? null;
          return (
            <section
              key={run.id}
              style={{
                border: "1px solid rgba(255,255,255,.12)",
                borderRadius: 16,
                background: "rgba(255,255,255,.02)",
                padding: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#a9a199" }}>{formatWhen(run.created_at)}</div>
                </div>
              </div>

              {signedUrl && (
                <img
                  src={signedUrl}
                  alt="Uploaded outfit"
                  style={{
                    width: "100%",
                    maxWidth: 220,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,.12)",
                    objectFit: "cover",
                    marginBottom: 12,
                  }}
                />
              )}

              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Shopping Results</div>
                {runSearches.length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {runSearches.map((search) => {
                      const response = search.response ?? null;
                      const href = response?.url ?? "";
                      return (
                        <div
                          key={search.id}
                          style={{
                            border: "1px solid rgba(255,255,255,.09)",
                            borderRadius: 10,
                            padding: "10px 12px",
                            background: "rgba(255,255,255,.01)",
                          }}
                        >
                          <div style={{ fontSize: 12, color: "#9f968d", marginBottom: 2 }}>{search.search_query}</div>
                          <div style={{ fontSize: 14, color: "#ece6dd", marginBottom: 4 }}>
                            {response?.product_name ?? "Suggested match"}
                          </div>
                          <div style={{ fontSize: 12, color: "#b7aea4" }}>
                            {response?.brand ?? "Unknown brand"} {response?.price ? `- ${response.price}` : ""}
                            {response?.retailer ? ` - ${response.retailer}` : ""}
                          </div>
                          {href && (
                            <a href={href} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6, fontSize: 12, color: "#d1a38b", textDecoration: "none" }}>
                              Open match
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "#9f968d", fontSize: 13 }}>No linked search results found for this run.</div>
                )}
              </div>

            </section>
          );
        })}
      </div>
      {totalRuns > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <Link
            href={hasPreviousPage ? `/history?page=${currentPage - 1}` : "#"}
            aria-disabled={!hasPreviousPage}
            style={{
              pointerEvents: hasPreviousPage ? "auto" : "none",
              opacity: hasPreviousPage ? 1 : 0.45,
              color: "#d1a38b",
              border: "1px solid rgba(209,163,139,.35)",
              borderRadius: 999,
              padding: "6px 12px",
              textDecoration: "none",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Previous
          </Link>
          <div style={{ fontSize: 12, color: "#a9a199" }}>
            Page {currentPage} of {totalPages}
          </div>
          <Link
            href={hasNextPage ? `/history?page=${currentPage + 1}` : "#"}
            aria-disabled={!hasNextPage}
            style={{
              pointerEvents: hasNextPage ? "auto" : "none",
              opacity: hasNextPage ? 1 : 0.45,
              color: "#d1a38b",
              border: "1px solid rgba(209,163,139,.35)",
              borderRadius: 999,
              padding: "6px 12px",
              textDecoration: "none",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Next
          </Link>
        </div>
      )}
    </main>
  );
}
