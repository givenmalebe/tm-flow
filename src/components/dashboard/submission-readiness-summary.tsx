"use client";

/**
 * Submission readiness across every live tender, for the AI assistant view.
 * Surfaces bids that are ready to send and the exact reason each other bid is
 * not, so the assistant can answer "what can I submit today?" instantly.
 */
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Lock, Send, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { useDashboardStore } from "@/lib/dashboard-store";
import { cn } from "@/lib/utils";

type Row = {
  tender_id: number;
  reference_number: string;
  title: string;
  client_company: string | null;
  days_left: number | null;
  score: number;
  ready_to_submit: boolean;
  already_submitted: boolean;
  source: "system" | "external";
  issuer_company: string | null;
  blocking_issues: string[];
};

export function SubmissionReadinessSummary({ onFocusTender }: { onFocusTender?: (id: number) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [readyCount, setReadyCount] = useState(0);
  const [attentionCount, setAttentionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const setTab = useDashboardStore((s) => s.setTab);
  const selectTender = useDashboardStore((s) => s.selectTender);
  const refresh = useDashboardStore((s) => s.refresh);

  const load = useCallback(async () => {
    try {
      const data = await api.getSubmissionReadinessOverview();
      setRows(data.items || []);
      setReadyCount(data.ready_count || 0);
      setAttentionCount(data.attention_count || 0);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = (id: number) => {
    if (onFocusTender) {
      onFocusTender(id);
      return;
    }
    setTab("tenders");
    selectTender(id);
    refresh();
  };

  if (loading || rows.length === 0) return null;

  return (
    <Card className="border-2 border-amber-300/70 bg-amber-50/20 dark:border-amber-800/60 dark:bg-amber-950/10">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Submission readiness</h3>
          <Badge variant="outline" className="border-emerald-300 text-[11px] text-emerald-700 dark:border-emerald-800 dark:text-emerald-300">
            {readyCount} ready to send
          </Badge>
          {attentionCount > 0 && (
            <Badge variant="outline" className="border-rose-300 text-[11px] text-rose-700 dark:border-rose-800 dark:text-rose-300">
              {attentionCount} need attention
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Every bid is checked against its required documents, certificate expiry dates, checklist and
          closing date.
        </p>

        <ul className="mt-3 space-y-2">
          {rows.slice(0, 8).map((r) => {
            const isReady = r.ready_to_submit && !r.already_submitted;
            return (
              <li
                key={r.tender_id}
                className="rounded-lg border border-border bg-background/70 p-2.5"
              >
                <div className="flex items-start gap-2">
                  {r.already_submitted ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : isReady ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold">{r.reference_number}</span>
                      <span className="truncate text-xs text-muted-foreground">{r.title}</span>
                      {r.source === "system" && (
                        <Badge variant="outline" className="text-[10px]">
                          On platform{r.issuer_company ? ` · ${r.issuer_company}` : ""}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <Progress
                        value={r.score}
                        className={cn("h-1", isReady ? "[&>div]:bg-emerald-600" : "")}
                      />
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {r.score}%
                      </span>
                    </div>
                    {!isReady && !r.already_submitted && r.blocking_issues.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                        {r.blocking_issues.slice(0, 3).map((issue, i) => (
                          <li key={i} className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
                            {issue}
                          </li>
                        ))}
                        {r.blocking_issues.length > 3 && (
                          <li className="list-disc pl-4">
                            …and {r.blocking_issues.length - 3} more
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                  <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => open(r.tender_id)}>
                    {isReady ? <Send className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    {isReady ? "Open" : "Fix"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}