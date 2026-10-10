import { api, type AIResearchResult } from "@/lib/api";

/**
 * De-duplicates on-demand research across components. The login popout and the
 * assistant tab can both decide a research pass is due at the same time; they
 * share this one in-flight promise instead of firing two passes.
 */
let inFlight: Promise<AIResearchResult> | null = null;

export function runResearchShared(): Promise<AIResearchResult> {
  if (inFlight) return inFlight;
  inFlight = api.runResearch().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
