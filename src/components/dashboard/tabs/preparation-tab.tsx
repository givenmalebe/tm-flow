"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ClipboardCheck,
  Loader2,
  RefreshCw,
  CheckCircle2,
  Clock,
  XCircle,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
  Building2,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/lib/api";
import { useDashboardStore, formatDate, daysUntil, deadlineColor, statusColor } from "@/lib/dashboard-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function PreparationTab() {
  const { setTab, selectTender } = useDashboardStore();
  const [tenders, setTenders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listTenders({ sort: "updated_at", order: "desc" });
      setTenders(data.items || []);
    } catch (e: any) {
      setError(e.message || "Failed to load tenders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openTender = (id: number) => {
    setTab("tenders");
    setTimeout(() => selectTender(id), 50);
  };

  // Calculate preparation stats for a tender
  const getPrepStats = (tender: any) => {
    const checklist = tender.checklist_items || [];
    const total = checklist.length;
    const complete = checklist.filter((c: any) => c.status === "Complete").length;
    const outstanding = checklist.filter((c: any) => c.status === "Outstanding").length;
    const expired = checklist.filter((c: any) => c.status === "Expired").length;
    const na = checklist.filter((c: any) => c.status === "Not Applicable").length;
    const eligible = total - na;
    const pct = eligible > 0 ? Math.round((complete / eligible) * 100) : 0;
    return { total, complete, outstanding, expired, na, eligible, pct };
  };

  // Overall stats
  const allStats = tenders.map(getPrepStats);
  const totalItems = allStats.reduce((sum, s) => sum + s.total, 0);
  const totalComplete = allStats.reduce((sum, s) => sum + s.complete, 0);
  const totalOutstanding = allStats.reduce((sum, s) => sum + s.outstanding, 0);
  const totalExpired = allStats.reduce((sum, s) => sum + s.expired, 0);
  const readyCount = allStats.filter(s => s.pct === 100).length;
  const avgPct = tenders.length > 0
    ? Math.round(allStats.reduce((sum, s) => sum + s.pct, 0) / tenders.length)
    : 0;

  // Sort tenders by completion % ascending (least complete first = most urgent)
  const sortedTenders = [...tenders].sort((a, b) => {
    const sa = getPrepStats(a);
    const sb = getPrepStats(b);
    return sa.pct - sb.pct;
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={fetchData}>Retry</Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Tender Preparation
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track what still needs to be completed before submission — clear percentage for each tender
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryStat icon={ClipboardCheck} value={tenders.length} label="Tenders" color="primary" />
        <SummaryStat icon={TrendingUp} value={avgPct} suffix="%" label="Avg complete" color="emerald" />
        <SummaryStat icon={CheckCircle2} value={readyCount} label="Ready (100%)" color="emerald" />
        <SummaryStat icon={Clock} value={totalOutstanding} label="Outstanding" color="amber" />
        <SummaryStat icon={XCircle} value={totalExpired} label="Expired" color="rose" />
        <SummaryStat icon={ClipboardCheck} value={totalItems} label="Total items" color="zinc" />
      </div>

      {/* Tender preparation cards */}
      {tenders.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <ClipboardCheck className="h-7 w-7 text-primary" />
            </div>
            <h3 className="font-semibold">No tenders yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Create a tender and run AI extraction to automatically generate a preparation checklist.
              The preparation tracker will show you exactly what's complete and what's outstanding.
            </p>
            <Button className="mt-4" onClick={() => setTab("tenders")}>
              Go to Tenders
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedTenders.map((tender) => {
            const stats = getPrepStats(tender);
            const days = daysUntil(tender.closing_date);
            return (
              <Card
                key={tender.id}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md",
                  stats.pct === 100 && "border-emerald-300 dark:border-emerald-800",
                  stats.pct < 50 && "border-rose-200 dark:border-rose-900",
                )}
                onClick={() => openTender(tender.id)}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Circular progress */}
                    <div className="relative shrink-0 mx-auto sm:mx-0">
                      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
                        <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/30" />
                        <circle
                          cx="32" cy="32" r="28" fill="none" strokeWidth="6" strokeLinecap="round"
                          className={stats.pct === 100 ? "text-emerald-500" : stats.pct >= 50 ? "text-amber-500" : "text-rose-500"}
                          strokeDasharray={`${2 * Math.PI * 28}`}
                          strokeDashoffset={`${2 * Math.PI * 28 * (1 - stats.pct / 100)}`}
                          style={{ transition: "stroke-dashoffset 0.5s ease" }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={cn(
                          "text-sm font-bold tabular-nums",
                          stats.pct === 100 ? "text-emerald-600" : stats.pct >= 50 ? "text-amber-600" : "text-rose-600"
                        )}>
                          {stats.pct}%
                        </span>
                      </div>
                    </div>

                    {/* Tender info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono text-xs font-semibold text-primary">
                          {tender.reference_number}
                        </span>
                        <Badge variant="outline" className={cn("text-xs", statusColor(tender.status))}>
                          {tender.status}
                        </Badge>
                        {tender.closing_date && (
                          <span className={cn("text-xs", deadlineColor(days))}>
                            {days === null ? formatDate(tender.closing_date) :
                              days < 0 ? `Closed ${formatDate(tender.closing_date)}` :
                              days === 0 ? "Closes today" :
                              `${days}d left`}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-sm line-clamp-1">{tender.title}</h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {tender.client_company}
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 max-w-xs h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full transition-all",
                              stats.pct === 100 ? "bg-emerald-500" : stats.pct >= 50 ? "bg-amber-500" : "bg-rose-500"
                            )}
                            style={{ width: `${stats.pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {stats.complete}/{stats.eligible} items done
                          {stats.outstanding > 0 && ` · ${stats.outstanding} outstanding`}
                          {stats.expired > 0 && ` · ${stats.expired} expired`}
                        </span>
                      </div>
                    </div>

                    {/* Status indicator */}
                    <div className="shrink-0">
                      {stats.pct === 100 ? (
                        <Badge className="bg-emerald-600 text-white">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Ready
                        </Badge>
                      ) : stats.pct >= 50 ? (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          In progress
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Needs work
                        </Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground mt-1 mx-auto" />
                    </div>
                  </div>

                  {/* Category breakdown mini-bars */}
                  {stats.total > 0 && (
                    <div className="mt-3 pt-3 border-t flex items-center gap-3 flex-wrap text-xs">
                      {/* Category breakdown */}
                      {(() => {
                        const checklist = tender.checklist_items || [];
                        const grouped = checklist.reduce((acc: any, c: any) => {
                          const cat = c.category || "Other";
                          if (!acc[cat]) acc[cat] = { total: 0, complete: 0 };
                          acc[cat].total++;
                          if (c.status === "Complete") acc[cat].complete++;
                          return acc;
                        }, {});
                        return Object.entries(grouped).slice(0, 5).map(([cat, data]: [string, any]) => (
                          <div key={cat} className="flex items-center gap-1">
                            <span className="text-muted-foreground">{cat}:</span>
                            <span className={cn(
                              "font-medium",
                              data.complete === data.total ? "text-emerald-600" : "text-amber-600"
                            )}>
                              {data.complete}/{data.total}
                            </span>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Info banner */}
      <Alert>
        <ClipboardCheck className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>How preparation tracking works:</strong> Each tender's checklist items (generated automatically by AI when you upload a tender document)
          are tracked as Complete ✓, Outstanding, Expired, or Not Applicable. The completion percentage excludes N/A items.
          Click any tender to open its Preparation tab and toggle items complete with one click.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function SummaryStat({ icon: Icon, value, suffix, label, color }: {
  icon: any; value: number; suffix?: string; label: string; color: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    zinc: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
  };
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-2">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", colorMap[color])}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-xl font-bold tabular-nums">
            {value}{suffix}
          </div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
