"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileStack,
  CalendarClock,
  FolderClock,
  Trophy,
  RefreshCw,
  Plus,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Upload,
  CalendarDays,
  Bot,
  Sparkles,
  Clock,
  ExternalLink,
  FileWarning,
  Hourglass,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import {
  useDashboardStore,
  formatDate,
  formatCurrency,
  statusColor,
  deadlineColor,
  type DashboardTab as DashboardTabId,
} from "@/lib/dashboard-store";
import { cn } from "@/lib/utils";

// ---- Types ----
interface DashboardData {
  active_count: number;
  preparing_count: number;
  ready_count: number;
  submitted_count: number;
  closing_this_week: number;
  closing_this_month: number;
  next_deadline: {
    id: number;
    reference_number: string;
    title: string;
    closing_date: string;
    days_remaining: number;
  } | null;
  docs_missing: number;
  docs_expiring_soon: number;
  docs_expired: number;
  awarded_this_year: number;
  unsuccessful_count: number;
  total_tenders: number;
  status_counts: Record<string, number>;
  closing_this_week_list: Array<{
    id: number;
    reference_number: string;
    title: string;
    client_company: string;
    closing_date: string;
    status: string;
    days_remaining: number;
  }>;
  docs_expiring_list: Array<{
    id: number;
    name: string;
    category: string;
    expiry_date: string;
    days_to_expiry: number;
  }>;
  awarded_this_year_list: Array<{
    id: number;
    reference_number: string;
    title: string;
    client_company: string;
    estimated_value: number;
  }>;
}

// ---- Helpers ----
function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-ZA").format(n);
}

function deadlineBadgeClass(days: number): string {
  if (days < 0 || days <= 1)
    return "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-900";
  if (days <= 3)
    return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900";
}

function deadlineLabel(days: number): string {
  if (days < 0) return `Overdue by ${Math.abs(days)}d`;
  if (days === 0) return "Due today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

function docExpiryLabel(days: number): string {
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `In ${days}d`;
}

// Solid bar colors for the status breakdown chart
function statusBarColor(status: string): string {
  const map: Record<string, string> = {
    "New Opportunity": "bg-sky-500",
    "Under Review": "bg-sky-500",
    "Interested": "bg-emerald-500",
    "Not Interested": "bg-zinc-400",
    "Preparing": "bg-amber-500",
    "Documents Outstanding": "bg-amber-500",
    "Pricing in Progress": "bg-amber-500",
    "Awaiting Information": "bg-orange-500",
    "Ready for Submission": "bg-violet-500",
    "Submitted": "bg-teal-500",
    "Clarification Requested": "bg-orange-500",
    "Clarification Submitted": "bg-orange-500",
    "Shortlisted": "bg-cyan-500",
    "Interview/Presentation": "bg-cyan-500",
    "Negotiation": "bg-fuchsia-500",
    "Awarded": "bg-emerald-600",
    "Unsuccessful": "bg-rose-500",
    "Cancelled": "bg-zinc-400",
    "Withdrawn": "bg-zinc-400",
    "Expired": "bg-rose-500",
  };
  return map[status] || "bg-zinc-400";
}

// ---- KPI Card ----
interface KpiCardProps {
  icon: LucideIcon;
  iconClass: string;
  value: number;
  label: string;
  subtitle: string;
  onClick?: () => void;
  hint?: string;
}

function KpiCard({ icon: Icon, iconClass, value, label, subtitle, onClick, hint }: KpiCardProps) {
  const clickable = !!onClick;
  const CardTag = clickable ? "button" : "div";
  return (
    <Card
      asChild={clickable}
      className={cn(
        "text-left transition-all",
        clickable
          ? "cursor-pointer hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          : ""
      )}
    >
      <CardTag onClick={onClick} type={clickable ? "button" : undefined}>
        <CardContent className="flex items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <div className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
              {formatNumber(value)}
            </div>
            <div className="mt-1 text-sm font-medium text-foreground">{label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
            {clickable && (
              <div className="mt-2 inline-flex items-center gap-0.5 text-[11px] font-medium text-primary">
                {hint || "Click to view"}
                <ChevronRight className="h-3 w-3" />
              </div>
            )}
          </div>
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
              iconClass
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </CardContent>
      </CardTag>
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-11 w-11 rounded-xl" />
      </CardContent>
    </Card>
  );
}

// ---- Empty state ----
function EmptyState({
  icon: Icon,
  message,
  iconClass,
}: {
  icon: LucideIcon;
  message: string;
  iconClass?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full",
          iconClass || "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
    </div>
  );
}

// ---- Main Component ----
export function DashboardTab() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClosingWeek, setShowClosingWeek] = useState(false);
  const [showAwarded, setShowAwarded] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const d = (await api.dashboard()) as DashboardData;
      setData(d);
    } catch (e: any) {
      setError(e?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openTender = (id: number) => {
    useDashboardStore.getState().setTab("tenders");
    setTimeout(() => useDashboardStore.getState().selectTender(id), 50);
  };

  const goToTab = (tab: DashboardTabId) =>
    useDashboardStore.getState().setTab(tab);

  // Top 8 statuses by count, for the breakdown chart
  const statusRows = useMemo(() => {
    if (!data?.status_counts) return [];
    return Object.entries(data.status_counts)
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [data]);

  const statusMax = useMemo(
    () => statusRows.reduce((m, [, c]) => Math.max(m, c), 0) || 1,
    [statusRows]
  );

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-40" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Tender activity at a glance
            </p>
          </div>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn&apos;t load your dashboard</AlertTitle>
          <AlertDescription>
            <p className="mb-3">{error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchData()}
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!data) return null;

  const docsExpiringTotal = data.docs_expiring_soon + data.docs_expired;

  return (
    <div className="space-y-6">
      {/* ---- Page header ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Tender activity at a glance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => fetchData(true)}
            disabled={refreshing}
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
            />
            Refresh
          </Button>
          <Button onClick={() => goToTab("tenders")}>
            <Plus className="h-4 w-4" />
            New Tender
          </Button>
        </div>
      </div>

      {/* ---- KPI cards ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={FileStack}
          iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
          value={data.active_count}
          label="Active Tenders"
          subtitle="In progress"
          onClick={() => goToTab("tenders")}
          hint="View all tenders"
        />
        <KpiCard
          icon={CalendarClock}
          iconClass="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
          value={data.closing_this_week}
          label="Closing This Week"
          subtitle="Urgent"
          onClick={() => setShowClosingWeek(true)}
          hint="See which tenders"
        />
        <KpiCard
          icon={FolderClock}
          iconClass="bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
          value={docsExpiringTotal}
          label="Documents Expiring"
          subtitle="Need attention"
          onClick={() => goToTab("library")}
          hint="Open compliance library"
        />
        <KpiCard
          icon={Trophy}
          iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
          value={data.awarded_this_year}
          label="Awarded This Year"
          subtitle="Wins"
          onClick={() => setShowAwarded(true)}
          hint="See awarded tenders"
        />
      </div>

      {/* ---- Three-column section ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left column (span 2) */}
        <div className="space-y-4 lg:col-span-2">
          {/* Tender Status Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileStack className="h-4 w-4 text-primary" />
                Tender Status Breakdown
              </CardTitle>
              <CardDescription>
                Distribution across {formatNumber(data.total_tenders)} tender
                {data.total_tenders === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {statusRows.length === 0 ? (
                <EmptyState
                  icon={FileStack}
                  message="No tenders yet. Create your first tender to see a status breakdown here."
                />
              ) : (
                statusRows.map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center gap-3 text-sm"
                  >
                    <div className="w-40 shrink-0 truncate font-medium text-foreground">
                      {status}
                    </div>
                    <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-md transition-all",
                          statusBarColor(status)
                        )}
                        style={{
                          width: `${Math.max(
                            6,
                            Math.round((count / statusMax) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="w-10 shrink-0 text-right tabular-nums font-medium text-foreground">
                      {formatNumber(count)}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Tenders Closing This Week */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                Tenders Closing This Week
              </CardTitle>
              <CardDescription>
                {data.closing_this_week > 0
                  ? `${formatNumber(data.closing_this_week)} tender${
                      data.closing_this_week === 1 ? "" : "s"
                    } need attention`
                  : "All clear for this week"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.closing_this_week_list.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  message="No tenders closing this week — you're on top of things."
                  iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                />
              ) : (
                <div className="max-h-80 space-y-1 overflow-y-auto scrollbar-thin pr-1">
                  {data.closing_this_week_list.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => openTender(t.id)}
                      className="group w-full rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-accent/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-primary">
                              {t.reference_number}
                            </span>
                            <span
                              className={cn(
                                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                                statusColor(t.status)
                              )}
                            >
                              {t.status}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-sm font-medium text-foreground">
                            {t.title}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {t.client_company || "—"} · Closes{" "}
                            {formatDate(t.closing_date)}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 tabular-nums",
                            deadlineBadgeClass(t.days_remaining)
                          )}
                        >
                          <Clock className="h-3 w-3" />
                          {deadlineLabel(t.days_remaining)}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Awarded This Year */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Awarded This Year
              </CardTitle>
              <CardDescription>
                {data.awarded_this_year > 0
                  ? `${formatNumber(data.awarded_this_year)} win${
                      data.awarded_this_year === 1 ? "" : "s"
                    } this year`
                  : "Submit tenders to start winning"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.awarded_this_year_list.length === 0 ? (
                <EmptyState
                  icon={Trophy}
                  message="No awards yet this year. Keep submitting!"
                  iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                />
              ) : (
                <div className="space-y-1">
                  {data.awarded_this_year_list.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => openTender(t.id)}
                      className="group flex w-full items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-accent/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-primary">
                            {t.reference_number}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-sm font-medium text-foreground">
                          {t.title}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {t.client_company || "—"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(t.estimated_value)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          est. value
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column (span 1) */}
        <div className="space-y-4">
          {/* Next Deadline */}
          <Card
            className={cn(
              data.next_deadline &&
                "border-emerald-500/60 dark:border-emerald-700/60 shadow-emerald-500/5"
            )}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hourglass className="h-4 w-4 text-primary" />
                Next Deadline
              </CardTitle>
              <CardDescription>
                {data.next_deadline
                  ? "Your most urgent tender"
                  : "Nothing on the horizon"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.next_deadline ? (
                <div className="space-y-4">
                  <div className="rounded-xl bg-emerald-50 p-4 dark:bg-emerald-950/40">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                        {data.next_deadline.reference_number}
                      </span>
                      <span
                        className={cn(
                          "text-3xl font-bold tabular-nums",
                          deadlineColor(data.next_deadline.days_remaining)
                        )}
                      >
                        {data.next_deadline.days_remaining < 0
                          ? Math.abs(data.next_deadline.days_remaining)
                          : data.next_deadline.days_remaining}
                      </span>
                    </div>
                    <div className="mt-1 text-sm font-medium text-foreground line-clamp-2">
                      {data.next_deadline.title}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Closes {formatDate(data.next_deadline.closing_date)} ·{" "}
                      <span
                        className={cn(
                          "font-medium",
                          deadlineColor(data.next_deadline.days_remaining)
                        )}
                      >
                        {deadlineLabel(data.next_deadline.days_remaining)}
                      </span>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => openTender(data.next_deadline!.id)}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open tender
                  </Button>
                </div>
              ) : (
                <EmptyState
                  icon={CheckCircle2}
                  message="No upcoming deadlines. You're all caught up."
                />
              )}
            </CardContent>
          </Card>

          {/* Document Alerts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileWarning className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                Document Alerts
              </CardTitle>
              <CardDescription>
                {docsExpiringTotal > 0
                  ? `${formatNumber(docsExpiringTotal)} document${
                      docsExpiringTotal === 1 ? "" : "s"
                    } need attention`
                  : "All documents current"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.docs_expiring_list.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  message="No documents expiring soon. Your compliance library is up to date."
                />
              ) : (
                <>
                  <div className="max-h-64 space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
                    {data.docs_expiring_list.map((d) => (
                      <div
                        key={d.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-transparent px-2.5 py-2 hover:bg-accent/50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">
                            {d.name}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className="px-1.5 py-0 text-[10px] font-medium"
                            >
                              {d.category}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {formatDate(d.expiry_date)}
                            </span>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 tabular-nums",
                            d.days_to_expiry < 0
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-900"
                              : d.days_to_expiry <= 30
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
                          )}
                        >
                          {docExpiryLabel(d.days_to_expiry)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => goToTab("library")}
                  >
                    Manage library
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Quick Actions
              </CardTitle>
              <CardDescription>Jump straight to a workflow</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-auto flex-col gap-1.5 py-3"
                onClick={() => goToTab("tenders")}
              >
                <Plus className="h-4 w-4 text-primary" />
                <span className="text-xs">New Tender</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto flex-col gap-1.5 py-3"
                onClick={() => goToTab("library")}
              >
                <Upload className="h-4 w-4 text-primary" />
                <span className="text-xs">Upload Document</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto flex-col gap-1.5 py-3"
                onClick={() => goToTab("briefings")}
              >
                <CalendarDays className="h-4 w-4 text-primary" />
                <span className="text-xs">Upcoming Briefings</span>
              </Button>
              <Button
                variant="outline"
                className="h-auto flex-col gap-1.5 py-3"
                onClick={() => goToTab("assistant")}
              >
                <Bot className="h-4 w-4 text-primary" />
                <span className="text-xs">Ask AI</span>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ---- Recent Activity placeholder ---- */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-start gap-3 sm:items-center">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="max-w-xl">
              <div className="text-sm font-semibold text-foreground">
                Activity feed coming soon
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Activity feed coming soon. Use the AI Assistant to ask about
                your tenders.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => goToTab("assistant")}
          >
            <Bot className="h-4 w-4" />
            Ask AI Assistant
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* ---- Closing This Week dialog ---- */}
      <Dialog open={showClosingWeek} onOpenChange={setShowClosingWeek}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              Tenders Closing This Week
            </DialogTitle>
            <DialogDescription>
              {data.closing_this_week > 0
                ? `${formatNumber(data.closing_this_week)} tender${
                    data.closing_this_week === 1 ? "" : "s"
                  } closing within the next 7 days. Click any tender to open it.`
                : "No tenders are closing this week. You're on top of things."}
            </DialogDescription>
          </DialogHeader>
          {data.closing_this_week_list.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={CheckCircle2}
                message="No tenders closing this week — you're on top of things."
                iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
              />
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh] pr-2">
              <div className="space-y-1">
                {data.closing_this_week_list.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setShowClosingWeek(false);
                      openTender(t.id);
                    }}
                    className="group w-full rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-accent/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-primary">
                            {t.reference_number}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                              statusColor(t.status)
                            )}
                          >
                            {t.status}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-sm font-medium text-foreground">
                          {t.title}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {t.client_company || "—"} · Closes{" "}
                          {formatDate(t.closing_date)}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 tabular-nums",
                          deadlineBadgeClass(t.days_remaining)
                        )}
                      >
                        <Clock className="h-3 w-3" />
                        {deadlineLabel(t.days_remaining)}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* ---- Awarded This Year dialog ---- */}
      <Dialog open={showAwarded} onOpenChange={setShowAwarded}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Tenders Awarded This Year
            </DialogTitle>
            <DialogDescription>
              {data.awarded_this_year > 0
                ? `${formatNumber(data.awarded_this_year)} tender${
                    data.awarded_this_year === 1 ? "" : "s"
                  } awarded this year. Click any tender to open it.`
                : "No tenders have been awarded yet this year. Keep submitting!"}
            </DialogDescription>
          </DialogHeader>
          {data.awarded_this_year_list.length === 0 ? (
            <div className="py-8">
              <EmptyState
                icon={Trophy}
                message="No awards yet this year. Keep submitting!"
                iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
              />
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh] pr-2">
              <div className="space-y-1">
                {data.awarded_this_year_list.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setShowAwarded(false);
                      openTender(t.id);
                    }}
                    className="group flex w-full items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-accent/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">
                          {t.reference_number}
                        </span>
                        <Trophy className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="mt-0.5 truncate text-sm font-medium text-foreground">
                        {t.title}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {t.client_company || "—"}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(t.estimated_value)}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        est. value
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
