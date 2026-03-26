import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_GEMINI_INPUT_USD_PER_1M = 0.3;
const DEFAULT_GEMINI_OUTPUT_USD_PER_1M = 2.5;

type TokenUsageInput = {
  userId: string;
  endpoint: string;
  provider: string;
  model: string;
  analysisRunId?: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  status: "ok" | "error";
  metadata?: Record<string, unknown>;
};

type ApiErrorInput = {
  userId: string;
  endpoint: string;
  provider: string;
  model?: string | null;
  analysisRunId?: string | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  message: string;
  details?: string | null;
  metadata?: Record<string, unknown>;
};

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function estimateGeminiCostUsd(promptTokens: number, completionTokens: number): number {
  const inputPer1m = envFloat("GEMINI_INPUT_USD_PER_1M", DEFAULT_GEMINI_INPUT_USD_PER_1M);
  const outputPer1m = envFloat("GEMINI_OUTPUT_USD_PER_1M", DEFAULT_GEMINI_OUTPUT_USD_PER_1M);
  const inputCost = (Math.max(0, promptTokens) / 1_000_000) * inputPer1m;
  const outputCost = (Math.max(0, completionTokens) / 1_000_000) * outputPer1m;
  return Number((inputCost + outputCost).toFixed(8));
}

export async function logTokenUsage(svc: SupabaseClient | null, input: TokenUsageInput): Promise<void> {
  if (!svc) return;
  const { error } = await svc.from("token_usage_events").insert({
    user_id: input.userId,
    endpoint: input.endpoint,
    provider: input.provider,
    model: input.model,
    analysis_run_id: input.analysisRunId ?? null,
    prompt_tokens: Math.max(0, input.promptTokens),
    completion_tokens: Math.max(0, input.completionTokens),
    total_tokens: Math.max(0, input.totalTokens),
    estimated_cost_usd: estimateGeminiCostUsd(input.promptTokens, input.completionTokens),
    status: input.status,
    metadata: input.metadata ?? {},
  });
  if (error) {
    console.error("[FitFind monitoring] token_usage_events insert failed:", error.message);
  }
}

export async function logApiError(svc: SupabaseClient | null, input: ApiErrorInput): Promise<void> {
  if (!svc) return;
  const { error } = await svc.from("api_error_events").insert({
    user_id: input.userId,
    endpoint: input.endpoint,
    provider: input.provider,
    model: input.model ?? null,
    analysis_run_id: input.analysisRunId ?? null,
    http_status: input.httpStatus ?? null,
    error_code: input.errorCode ?? null,
    message: input.message.slice(0, 500),
    details: input.details ? input.details.slice(0, 8000) : null,
    metadata: input.metadata ?? {},
  });
  if (error) {
    console.error("[FitFind monitoring] api_error_events insert failed:", error.message);
  }
}
