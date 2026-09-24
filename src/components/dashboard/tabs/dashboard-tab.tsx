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
  Bot,
  Sparkles,
  Clock,
  ExternalLink,
  FileWarning,
  Hourglass,
  ChevronRight,
  Send,
  TrendingUp,
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

// Deadline badge color (rose if ≤1 day or overdue, amber if ≤3, emerald otherwise)
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

// Prominent Next-Deadline urgency coloring:
// rose if ≤3 days (or overdue), amber if ≤7 days, emerald otherwise
function nextDeadlineUrgency(
  days: number
): { text: string; bg: string; ring: string; label: string } {
  if (days < 0) {
    return {
      text: "text-rose-700 dark:text-rose-300",
      bg: "bg-rose-50 dark:bg-rose-950/40",
      ring: "border-rose-300 dark:border-rose-800",
      label: "Overdue",
    };
  }
  if (days <= 3) {
    return {
      text: "text-rose-700 dark:text-rose-300",
      bg: "bg-rose-50 dark:bg-rose-950/40",
      ring: "border-rose-300 dark:border-rose-800",
      label: "Critical",
    };
  }
  if (days <= 7) {
    return {
      text: "text-amber-700 dark:text-amber-300",
      bg: "bg-amber-50 dark:bg-amber-950/40",
      ring: "border-amber-300 dark:border-amber-800",
      label: "Urgent",
    };
  }
  return {
    text: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    ring: "border-emerald-300 dark:border-emerald-800",
    label: "On Track",
  };
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
    Interested: "bg-emerald-500",
    "Not Interested": "bg-zinc-400",
    Preparing: "bg-amber-500",
    "Documents Outstanding": "bg-amber-500",
    "Pricing in Progress": "bg-amber-500",
    "Awaiting Information": "bg-orange-500",
    "Ready for Submission": "bg-violet-500",
    Submitted: "bg-teal-500",
    "Clarification Requested": "bg-orange-500",
    "Clarification Submitted": "bg-orange-500",
    Shortlisted: "bg-cyan-500",
    "Interview/Presentation": "bg-cyan-500",
    Negotiation: "bg-fuchsia-500",
    Awarded: "bg-emerald-600",
    Unsuccessful: "bg-rose-500",
    Cancelled: "bg-zinc-400",
    Withdrawn: "bg-zinc-400",
    Expired: "bg-rose-500",
  };
  return map[status] || "bg-zinc-400";
}

// ---- Section Heading ----
function SectionHeading({
  icon: Icon,
  title,
  description,
  accentClass,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  accentClass: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          accentClass
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          {title}
        </h2>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );
}

// ---- Stat Card (clickable, with hover lift + border highlight) ----
interface StatCardProps {
  icon: LucideIcon;
  iconClass: string;
  value: number | string;
  label: string;
  hint?: string;
  onClick?: () => void;
}

function StatCard({
  icon: Icon,
  iconClass,
  value,
  label,
  hint,
  onClick,
}: StatCardProps) {
  const clickable = !!onClick;
  return (
    <Card
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "transition-all",
        clickable &&
          "cursor-pointer hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      )}
    >
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {value}
          </div>
          <div className="mt-0.5 text-xs font-medium text-foreground line-clamp-1">
            {label}
          </div>
          {clickable && (
            <div className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-medium text-primary">
              {hint || "View"}
              <ChevronRight className="h-3 w-3" />
            </div>
          )}
        </div>
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            iconClass
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-9 w-9 rounded-lg" />
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
          iconClass ||
            "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
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

        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />

        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />

        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <Skeleton className="h-48 w-full" />
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

  const nextUrgency = data.next_deadline
    ? nextDeadlineUrgency(data.next_deadline.days_remaining)
    : null;

  return (
    <div className="space-y-8">
      {/* ============ PAGE HEADER ============ */}
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

      {/* ============ SECTION 1: ACTIVE TENDERS ============ */}
      <section className="space-y-4">
        <SectionHeading
          icon={FileStack}
          title="Active Tenders"
          description={`${formatNumber(data.active_count)} tender${
            data.active_count === 1 ? "" : "s"
          } currently in progress`}
          accentClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            icon={FileStack}
            iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
            value={formatNumber(data.active_count)}
            label="Total Active"
            hint="View tenders"
            onClick={() => goToTab("tenders")}
          />
          <StatCard
            icon={Clock}
            iconClass="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
            value={formatNumber(data.preparing_count)}
            label="Being Prepared"
            hint="View tenders"
            onClick={() => goToTab("tenders")}
          />
          <StatCard
            icon={CheckCircle2}
            iconClass="bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400"
            value={formatNumber(data.ready_count)}
            label="Ready for Submission"
            hint="View tenders"
            onClick={() => goToTab("tenders")}
          />
          <StatCard
            icon={Send}
            iconClass="bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400"
            value={formatNumber(data.submitted_count)}
            label="Submitted"
            hint="View submissions"
            onClick={() => goToTab("submissions")}
          />
          <StatCard
            icon={CalendarClock}
            iconClass="bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
            value={formatNumber(data.closing_this_week)}
            label="Closing Soon (≤7d)"
            hint="See list"
            onClick={() => setShowClosingWeek(true)}
          />
        </div>

        {/* Tender Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
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
      </section>

      {/* ============ SECTION 2: UPCOMING DEADLINES ============ */}
      <section className="space-y-4">
        <SectionHeading
          icon={CalendarClock}
          title="Upcoming Deadlines"
          description="Track what's closing soon and what needs your attention"
          accentClass="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            icon={CalendarClock}
            iconClass="bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
            value={formatNumber(data.closing_this_week)}
            label="Closing This Week"
            hint="See list"
            onClick={() => setShowClosingWeek(true)}
          />
          <StatCard
            icon={Hourglass}
            iconClass="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
            value={formatNumber(data.closing_this_month)}
            label="Closing This Month"
            hint="Open deadlines"
            onClick={() => goToTab("deadlines")}
          />
          <StatCard
            icon={Clock}
            iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
            value={data.next_deadline?.reference_number ?? "—"}
            label="Next Deadline"
            hint={data.next_deadline ? "Open tender" : undefined}
            onClick={
              data.next_deadline
                ? () => openTender(data.next_deadline!.id)
                : undefined
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Prominent Next Deadline Card */}
          <Card
            className={cn(
              "lg:col-span-1 border-2",
              nextUrgency?.ring || "border-border"
            )}
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Hourglass className="h-4 w-4 text-primary" />
                  Next Deadline
                </span>
                {nextUrgency && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wide",
                      nextUrgency.text
                    )}
                  >
                    {nextUrgency.label}
                  </Badge>
                )}
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
                  <div className={cn("rounded-xl p-4", nextUrgency?.bg)}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-xs font-semibold uppercase tracking-wide text-foreground/80">
                        {data.next_deadline.reference_number}
                      </span>
                      <span
                        className={cn(
                          "text-4xl font-bold tabular-nums leading-none",
                          nextUrgency?.text
                        )}
                      >
                        {data.next_deadline.days_remaining < 0
                          ? Math.abs(data.next_deadline.days_remaining)
                          : data.next_deadline.days_remaining}
                        <span className="text-sm font-medium ml-1">
                          {data.next_deadline.days_remaining < 0
                            ? "d overdue"
                            : "d left"}
                        </span>
                      </span>
                    </div>
                    <div className="mt-2 text-sm font-medium text-foreground line-clamp-2">
                      {data.next_deadline.title}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Closes {formatDate(data.next_deadline.closing_date)}
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => openTender(data.next_deadline!.id)}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Tender
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

          {/* Tenders Closing This Week list */}
          <Card className="lg:col-span-2">
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
                <div className="max-h-72 space-y-1 overflow-y-auto scrollbar-thin pr-1">
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
              {data.closing_this_week_list.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3"
                  onClick={() => setShowClosingWeek(true)}
                >
                  View all {formatNumber(data.closing_this_week)} tenders
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ============ SECTION 3: DOCUMENTS ============ */}
      <section className="space-y-4">
        <SectionHeading
          icon={FolderClock}
          title="Documents"
          description="Compliance library health and document gaps"
          accentClass="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            icon={FileWarning}
            iconClass="bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
            value={formatNumber(data.docs_missing)}
            label="Documents Missing"
            hint="Checklists"
            onClick={() => goToTab("tenders")}
          />
          <StatCard
            icon={Clock}
            iconClass="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
            value={formatNumber(data.docs_expiring_soon)}
            label="Expiring Soon"
            hint="Open library"
            onClick={() => goToTab("library")}
          />
          <StatCard
            icon={AlertTriangle}
            iconClass="bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
            value={formatNumber(data.docs_expired)}
            label="Expired"
            hint="Open library"
            onClick={() => goToTab("library")}
          />
        </div>

        {/* Document Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileWarning className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              Document Alerts
            </CardTitle>
            <CardDescription>
              {data.docs_expiring_list.length > 0
                ? `${formatNumber(data.docs_expiring_list.length)} document${
                    data.docs_expiring_list.length === 1 ? "" : "s"
                  } need attention`
                : "All documents current"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.docs_expiring_list.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                message="No documents expiring soon. Your compliance library is up to date."
                iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
              />
            ) : (
              <>
                <div className="max-h-64 space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
                  {data.docs_expiring_list.map((d) => {
                    const isExpired = d.days_to_expiry < 0;
                    const isExpiring =
                      d.days_to_expiry >= 0 && d.days_to_expiry <= 30;
                    return (
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
                            isExpired
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-900"
                              : isExpiring
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
                          )}
                        >
                          {isExpired ? "Expired" : "Expiring Soon"} ·{" "}
                          {docExpiryLabel(d.days_to_expiry)}
                        </Badge>
                      </div>
                    );
                  })}
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
      </section>

      {/* ============ BOTTOM ROW: QUICK ACTIONS + AWARDED THIS YEAR ============ */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
              onClick={() => goToTab("deadlines")}
            >
              <CalendarClock className="h-4 w-4 text-primary" />
              <span className="text-xs">View Deadlines</span>
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

        {/* Awarded This Year */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Awarded This Year
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowAwarded(true)}
                disabled={data.awarded_this_year_list.length === 0}
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </Button>
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
              <div className="max-h-56 space-y-1 overflow-y-auto scrollbar-thin pr-1">
                {data.awarded_this_year_list.slice(0, 5).map((t) => (
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
            )}
          </CardContent>
        </Card>
      </div>

      {/* ============ DIALOG: CLOSING THIS WEEK ============ */}
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

      {/* ============ DIALOG: AWARDED THIS YEAR ============ */}
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
