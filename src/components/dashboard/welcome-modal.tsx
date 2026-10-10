"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Banknote,
  Bot,
  CalendarClock,
  FileStack,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type AIBriefing, type AINewsItem } from "@/lib/api";
import { runResearchShared } from "@/lib/ai-research";
import { consumeFreshLogin } from "@/lib/welcome";
import { useDashboardStore, deadlineColor } from "@/lib/dashboard-store";
import { cn } from "@/lib/utils";

function NewsRow({
  item,
  onOpen,
}: {
  item: AINewsItem;
  onOpen: (item: AINewsItem) => void;
}) {
  const icon =
    item.kind === "deadline" ? (
      <CalendarClock className="h-4 w-4 text-amber-600" />
    ) : item.kind === "tender" ? (
      <FileStack className="h-4 w-4 text-emerald-600" />
    ) : (
      <Banknote className="h-4 w-4 text-emerald-600" />
    );

  return (
    <button
      onClick={() => onOpen(item)}
      className="flex w-full items-start gap-3 rounded-lg border border-border bg-background p-2.5 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/20"
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium text-foreground">
            {item.title}
          </span>
          {typeof item.match_score === "number" && (
            <Badge
              variant="outline"
              className="shrink-0 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              {item.match_score}% match
            </Badge>
          )}
          {item.days_left !== null && item.kind === "deadline" && (
            <Badge
              variant="outline"
              className={cn("shrink-0 text-[10px]", deadlineColor(item.days_left))}
            >
              {item.days_left === 0 ? "today" : `${item.days_left}d`}
            </Badge>
          )}
        </span>
        {item.body && (
          <span className="mt-0.5 block line-clamp-2 text-xs leading-snug text-muted-foreground">
            {item.body}
          </span>
        )}
      </span>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

export function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const [briefing, setBriefing] = useState<AIBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [researching, setResearching] = useState(false);
  const startedRef = useRef(false);

  const setTab = useDashboardStore((s) => s.setTab);
  const selectTender = useDashboardStore((s) => s.selectTender);
  const refresh = useDashboardStore((s) => s.refresh);

  const load = useCallback(async () => {
    try {
      setBriefing(await api.getBriefing());
    } catch {
      /* leave the last snapshot in place */
    }
  }, []);

  // Runs once per mount. Only opens when the login flag is present.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!consumeFreshLogin()) return;

    setOpen(true);
    setLoading(true);
    (async () => {
      const data = await api.getBriefing().catch(() => null);
      if (!data) {
        setLoading(false);
        return;
      }
      setBriefing(data);
      setLoading(false);
      // If the AI has no fresh research yet, run one proactive pass so the
      // popout shows real findings rather than an empty feed.
      if (data.research_stale) {
        setResearching(true);
        try {
          await runResearchShared();
          await load();
          refresh();
        } catch {
          /* the popout still shows the cached snapshot */
        } finally {
          setResearching(false);
        }
      }
    })();
  }, [load, refresh]);

  const openAssistant = (item?: AINewsItem) => {
    setOpen(false);
    setTab("assistant");
    if (item?.tender_id) selectTender(item.tender_id);
    refresh();
  };

  if (!open) return null;

  const news: AINewsItem[] = briefing?.news ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b bg-gradient-to-br from-emerald-50 via-card to-card p-5 dark:from-emerald-950/30">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm">
              <Bot className="h-6 w-6" />
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white shadow dark:bg-zinc-900">
                <Sparkles className="h-3 w-3 text-emerald-600" />
              </span>
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-left text-base">
                {briefing?.user_name
                  ? `Welcome back, ${briefing.user_name}`
                  : "Welcome back"}
              </DialogTitle>
              <DialogDescription className="text-left text-xs">
                Your procurement success AI has news for you
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto scrollbar-thin p-5">
          {loading && !briefing ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <>
              {briefing?.narrative && (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {briefing.narrative}
                </p>
              )}

              {researching && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200/70 bg-emerald-50/60 p-2.5 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  I'm researching fresh tenders and funding for you right now…
                </div>
              )}

              {news.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                    What's new for your company
                    <Badge
                      variant="secondary"
                      className="ml-1 h-4 px-1.5 text-[10px]"
                    >
                      {news.length}
                    </Badge>
                  </div>
                  <div className="space-y-1.5">
                    {news.map((item, idx) => (
                      <NewsRow
                        key={`${item.kind}-${item.opportunity_id ?? item.tender_id ?? idx}`}
                        item={item}
                        onOpen={openAssistant}
                      />
                    ))}
                  </div>
                </div>
              )}

              {!researching && news.length === 0 && (
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  Nothing urgent right now. I'm continuously watching for tenders
                  and funding that match your company — new matches will appear
                  here and in your AI Assistant tab.
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t bg-muted/30 p-4 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setOpen(false)}
          >
            Maybe later
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => openAssistant()}
          >
            Open AI Assistant
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
