"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Bot,
  CalendarClock,
  ExternalLink,
  FileWarning,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type AIBriefing, type AIOpportunity } from "@/lib/api";
import { runResearchShared } from "@/lib/ai-research";
import { useDashboardStore, deadlineColor } from "@/lib/dashboard-store";
import { cn } from "@/lib/utils";

function scoreBadgeClass(score: number | null): string {
  if (score === null) return "border-border bg-muted text-muted-foreground";
  if (score >= 75)
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (score >= 50)
    return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300";
  return "border-border bg-muted text-muted-foreground";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "not yet";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "recently";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function OpportunityRow({
  opp,
  onImported,
  onDismissed,
}: {
  opp: AIOpportunity;
  onImported: (tenderId: number) => void;
  onDismissed: (id: number) => void;
}) {
  const [busy, setBusy] = useState<"import" | "dismiss" | null>(null);

  const handleImport = async () => {
    setBusy("import");
    try {
      const res = await api.importOpportunity(opp.id);
      toast.success("Added to your tenders", {
        description: opp.title,
      });
      onImported(res.tender_id);
    } catch (e: any) {
      toast.error("Couldn't import", { description: e?.message });
    } finally {
      setBusy(null);
    }
  };

  const handleDismiss = async () => {
    setBusy("dismiss");
    try {
      await api.dismissOpportunity(opp.id);
      onDismissed(opp.id);
    } catch (e: any) {
      toast.error("Couldn't dismiss", { description: e?.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium text-foreground">
              {opp.title}
            </span>
            {opp.type === "finance" && (
              <Badge variant="outline" className="text-[10px]">
                Tender finance
              </Badge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {opp.provider && <span>{opp.provider}</span>}
            {opp.location && <span>· {opp.location}</span>}
            {opp.closing_date && (
              <span className={cn("inline-flex items-center gap-0.5", deadlineColor(opp.days_left))}>
                · <CalendarClock className="h-3 w-3" />
                {opp.days_left === null
                  ? opp.closing_date
                  : opp.days_left <= 0
                    ? "closing today"
                    : `${opp.days_left}d left`}
              </span>
            )}
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn("shrink-0 text-[11px]", scoreBadgeClass(opp.match_score))}
        >
          {opp.match_score === null ? "—" : `${opp.match_score}%`}
        </Badge>
      </div>

      {opp.match_reason && (
        <p className="text-xs leading-snug text-muted-foreground">
          {opp.match_reason}
        </p>
      )}

      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        {opp.type === "tender" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            onClick={handleImport}
            disabled={busy !== null}
          >
            {busy === "import" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <BadgeCheck className="h-3 w-3" />
            )}
            Add to tenders
          </Button>
        )}
        {opp.url && (
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" asChild>
            <a href={opp.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3" />
              Open
            </a>
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-xs text-muted-foreground hover:text-rose-600"
          onClick={handleDismiss}
          disabled={busy !== null}
        >
          {busy === "dismiss" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <X className="h-3 w-3" />
          )}
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  items,
  emptyText,
  onImported,
  onDismissed,
}: {
  icon: ReactNode;
  title: string;
  items: AIOpportunity[];
  emptyText: string;
  onImported: (tenderId: number) => void;
  onDismissed: (id: number) => void;
}) {
  const [open, setOpen] = useState(true);
  if (items.length === 0 && !emptyText) return null;
  return (
    <div className="space-y-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 text-xs font-semibold text-foreground"
      >
        {icon}
        {title}
        <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
          {items.length}
        </Badge>
        <ArrowRight
          className={cn(
            "ml-auto h-3 w-3 text-muted-foreground transition-transform",
            open && "rotate-90"
          )}
        />
      </button>
      {open &&
        (items.length === 0 ? (
          <p className="pl-5 text-[11px] text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="space-y-1.5">
            {items.map((o) => (
              <OpportunityRow
                key={o.id}
                opp={o}
                onImported={onImported}
                onDismissed={onDismissed}
              />
            ))}
          </div>
        ))}
    </div>
  );
}

export function BriefingCard({
  onFocusTender,
}: {
  onFocusTender?: (id: number, label: string) => void;
}) {
  const [briefing, setBriefing] = useState<AIBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [researching, setResearching] = useState(false);
  const [error, setError] = useState(false);
  const autoResearchRef = useRef(false);

  const setTab = useDashboardStore((s) => s.setTab);
  const selectTender = useDashboardStore((s) => s.selectTender);
  const refresh = useDashboardStore((s) => s.refresh);

  const load = useCallback(async () => {
    try {
      const data = await api.getBriefing();
      setBriefing(data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runResearch = useCallback(
    async (proactive: boolean) => {
      setResearching(true);
      const t = proactive
        ? toast.loading("Finding fresh tenders and funding for you…", {
            description: "You didn't have to ask — I'm already on it.",
          })
        : toast.loading("Researching tenders and funding for you…", {
            description: "This can take up to a minute.",
          });
      try {
        const res = await runResearchShared();
        await load();
        refresh();
        toast.success(proactive ? "Fresh opportunities ready" : "Research complete", {
          id: t,
          description: `${res.tenders_found} tenders and ${res.funding_found + res.finance_found} funding options found.`,
        });
      } catch (e: any) {
        toast.error("Research failed", { id: t, description: e?.message });
      } finally {
        setResearching(false);
      }
    },
    [load, refresh]
  );

  // Proactive: when the briefing says research is stale (or has never run),
  // run one pass automatically so the user is greeted with fresh findings
  // without having to prompt the AI.
  useEffect(() => {
    if (!briefing || autoResearchRef.current) return;
    if (!briefing.research_stale) return;
    autoResearchRef.current = true;
    runResearch(true);
  }, [briefing, runResearch]);

  const handleResearch = () => runResearch(false);

  const openTender = (tenderId: number) => {
    setTab("tenders");
    selectTender(tenderId);
    refresh();
  };

  const removeOpportunity = (id: number) => {
    setBriefing((prev) => {
      if (!prev) return prev;
      const filter = (arr: AIOpportunity[]) => arr.filter((o) => o.id !== id);
      return {
        ...prev,
        opportunities: {
          tenders: filter(prev.opportunities.tenders),
          funding: filter(prev.opportunities.funding),
        },
      };
    });
  };

  if (loading) {
    return (
      <div className="space-y-2 rounded-xl border border-emerald-200/60 bg-emerald-50/40 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }

  if (error || !briefing) return null;

  const { closing_soon, opportunities } = briefing;
  const showEmpty =
    closing_soon.length === 0 &&
    opportunities.tenders.length === 0 &&
    opportunities.funding.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3 rounded-xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 via-card to-card p-4 shadow-sm dark:border-emerald-900/60 dark:from-emerald-950/20"
    >
      {/* Narrative header */}
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm">
          <Bot className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              {briefing.user_name ? `Hi ${briefing.user_name}, ` : ""}
              {briefing.scope.company_name
                ? `your briefing for ${briefing.scope.company_name}`
                : "your daily briefing"}
            </span>
          </div>
          {briefing.narrative && (
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {briefing.narrative}
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <RefreshCw
              className={cn("h-3 w-3", researching && "animate-spin")}
            />
            {researching
              ? "Researching fresh tenders and funding…"
              : `Last researched ${relativeTime(briefing.last_research_at)}`}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 shrink-0 gap-1.5 border-emerald-300 bg-background text-xs text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
          onClick={handleResearch}
          disabled={researching}
        >
          {researching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">
            {researching ? "Researching…" : "Research now"}
          </span>
        </Button>
      </div>

      {/* Closing soon */}
      {closing_soon.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <CalendarClock className="h-3.5 w-3.5 text-amber-600" />
            Closing soon
            <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
              {closing_soon.length}
            </Badge>
          </div>
          <div className="space-y-1.5">
            {closing_soon.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  if (onFocusTender) onFocusTender(t.id, `${t.reference_number} — ${t.title}`);
                }}
                className="flex w-full flex-col gap-1 rounded-lg border border-border bg-background p-2.5 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/40 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {t.reference_number} — {t.title}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0 text-[11px]", deadlineColor(t.days_left))}
                  >
                    {t.days_left === 0 ? "today" : `${t.days_left}d`}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {t.readiness_pct !== null ? (
                    <span className="inline-flex items-center gap-1">
                      <Target className="h-3 w-3" />
                      {t.readiness_pct}% checklist ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Target className="h-3 w-3" />
                      no checklist yet
                    </span>
                  )}
                  {t.expiring_docs.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <FileWarning className="h-3 w-3" />
                      {t.expiring_docs.length} doc(s) expiring: {t.expiring_docs.slice(0, 2).join(", ")}
                      {t.expiring_docs.length > 2 ? "…" : ""}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Opportunities */}
      {(opportunities.tenders.length > 0 || opportunities.funding.length > 0) && (
        <div className="space-y-2.5">
          <Section
            icon={<Sparkles className="h-3.5 w-3.5 text-emerald-600" />}
            title="Tender matches"
            items={opportunities.tenders}
            emptyText=""
            onImported={openTender}
            onDismissed={removeOpportunity}
          />
          <Section
            icon={<Banknote className="h-3.5 w-3.5 text-emerald-600" />}
            title="Funding & finance for you"
            items={opportunities.funding}
            emptyText=""
            onImported={openTender}
            onDismissed={removeOpportunity}
          />
        </div>
      )}

      {showEmpty && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-background/60 p-3 text-xs text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <span>
            No tracked tenders closing soon and nothing found yet. Tap
            <span className="font-medium text-foreground"> Research now</span> and I'll hunt
            open tenders and funding for you.
          </span>
        </div>
      )}
    </motion.div>
  );
}
