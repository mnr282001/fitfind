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

function confidenceStyle(confidence?: "high" | "medium" | "low") {
  if (confidence === "high") {
    return { label: "High match", color: "#9ce6b8", border: "rgba(156,230,184,.45)", bg: "rgba(34,89,58,.35)" };
  }
  if (confidence === "medium") {
    return { label: "Medium match", color: "#f3db99", border: "rgba(243,219,153,.45)", bg: "rgba(97,79,22,.35)" };
  }
  return { label: "Suggested", color: "#d9cfc4", border: "rgba(217,207,196,.35)", bg: "rgba(255,255,255,.06)" };
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
  const showingFrom = totalRuns === 0 ? 0 : pageFrom + 1;
  const showingTo = Math.min(pageFrom + runs.length, totalRuns);

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
      <div
        style={{
          border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 18,
          background: "linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.015))",
          padding: "18px 16px",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 29, letterSpacing: "-0.02em" }}>Your Style History</h1>
            <div style={{ marginTop: 5, color: "#c5bfb8", fontSize: 14 }}>
              Revisit past uploads and jump back to products you liked.
            </div>
          </div>
          <Link
            href="/"
            style={{
              color: "#d1a38b",
              textDecoration: "none",
              fontWeight: 600,
              border: "1px solid rgba(209,163,139,.35)",
              borderRadius: 999,
              padding: "8px 12px",
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            New upload
          </Link>
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ border: "1px solid rgba(255,255,255,.1)", borderRadius: 999, padding: "6px 10px", fontSize: 12, color: "#ded7ce" }}>
            {totalRuns} total uploads
          </div>
          <div style={{ border: "1px solid rgba(255,255,255,.1)", borderRadius: 999, padding: "6px 10px", fontSize: 12, color: "#ded7ce" }}>
            Showing {showingFrom}-{showingTo}
          </div>
        </div>
      </div>

      {runs.length === 0 && (
        <div
          style={{
            border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 16,
            padding: 20,
            color: "#c5bfb8",
            background: "rgba(255,255,255,.02)",
          }}
        >
          <div style={{ fontSize: 18, color: "#ebe4da", marginBottom: 6 }}>No uploads yet</div>
          <div style={{ fontSize: 14, marginBottom: 12 }}>
            {currentPage === 1
              ? "Upload an outfit to start building your personalized style history."
              : "This page is empty. Try the previous page to view earlier uploads."}
          </div>
          {currentPage === 1 && (
            <Link
              href="/"
              style={{
                display: "inline-block",
                color: "#1f1714",
                background: "#d1a38b",
                textDecoration: "none",
                borderRadius: 999,
                padding: "8px 12px",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              Upload your first outfit
            </Link>
          )}
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
                background: "rgba(255,255,255,.025)",
                padding: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#a9a199" }}>{formatWhen(run.created_at)}</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: "#ddd6cc" }}>
                    {runSearches.length} {runSearches.length === 1 ? "result" : "results"}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
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
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Shopping Results</div>
                {runSearches.length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {runSearches.map((search) => {
                      const response = search.response ?? null;
                      const href = response?.url ?? "";
                      const confidence = confidenceStyle(response?.match_confidence);
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
                          <div
                            style={{
                              display: "inline-block",
                              marginBottom: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              letterSpacing: ".02em",
                              borderRadius: 999,
                              padding: "3px 8px",
                              border: `1px solid ${confidence.border}`,
                              color: confidence.color,
                              background: confidence.bg,
                            }}
                          >
                            {confidence.label}
                          </div>
                          <div style={{ fontSize: 12, color: "#b7aea4" }}>
                            {response?.brand ?? "Unknown brand"} {response?.price ? `- ${response.price}` : ""}
                            {response?.retailer ? ` - ${response.retailer}` : ""}
                          </div>
                          {href && (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: "inline-block",
                                marginTop: 8,
                                fontSize: 12,
                                color: "#1f1714",
                                background: "#d1a38b",
                                textDecoration: "none",
                                fontWeight: 700,
                                borderRadius: 999,
                                padding: "6px 10px",
                              }}
                            >
                              View product
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "#9f968d", fontSize: 13 }}>
                    No linked shopping results were saved for this upload.
                  </div>
                )}
              </div>
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
