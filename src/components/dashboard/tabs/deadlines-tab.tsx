"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CalendarClock,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Bell,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  Hourglass,
  Zap,
  Timer,
  Calendar,
  MapPin,
  Building2,
  User,
  ExternalLink,
  BellRing,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/lib/api";
import { useDashboardStore, formatDate, formatCurrency, statusColor } from "@/lib/dashboard-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DeadlineItem {
  id: number;
  reference_number: string;
  title: string;
  client_company: string;
  status: string;
  outcome: string | null;
  closing_date: string;
  closing_time: string | null;
  days_remaining: number | null;
  hours_remaining: number | null;
  is_closed: boolean;
  is_active: boolean;
  urgency: "critical" | "urgent" | "soon" | "normal" | "closed";
  active_reminders: number[];
  person_responsible: string | null;
  estimated_value: number | null;
  location_site: string | null;
}

interface Reminder {
  id: number;
  days_before: number;
  enabled: boolean;
}

export function DeadlinesTab() {
  const { setTab, selectTender } = useDashboardStore();
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [newReminderDays, setNewReminderDays] = useState("");
  const [addingReminder, setAddingReminder] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDeadlines();
      setDeadlines(data.items || []);
      setSummary(data.summary);
      setReminders(data.reminders || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load deadlines");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleReminder = async (id: number, enabled: boolean) => {
    try {
      await api.updateReminder(id, enabled);
      setReminders((arr) => arr.map((r) => r.id === id ? { ...r, enabled } : r));
      toast.success(`Reminder ${enabled ? "enabled" : "disabled"}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to update reminder");
    }
  };

  const handleAddReminder = async () => {
    const days = parseInt(newReminderDays);
    if (!days || days < 1 || days > 365) {
      toast.error("Enter a valid number of days (1-365)");
      return;
    }
    setAddingReminder(true);
    try {
      await api.addReminder(days);
      toast.success(`Reminder for ${days} days added`);
      setNewReminderDays("");
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "Failed to add reminder");
    } finally {
      setAddingReminder(false);
    }
  };

  const handleDeleteReminder = async (id: number, days: number) => {
    try {
      await api.deleteReminder(id);
      toast.success(`Reminder for ${days} days removed`);
      fetchData();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete reminder");
    }
  };

  const openTender = (id: number) => {
    setTab("tenders");
    setTimeout(() => selectTender(id), 50);
  };

  // Urgency config
  const urgencyConfig = {
    critical: {
      color: "rose",
      bg: "bg-rose-50 dark:bg-rose-950/30",
      border: "border-rose-300 dark:border-rose-800",
      text: "text-rose-700 dark:text-rose-400",
      badge: "bg-rose-600 text-white",
      icon: Zap,
      label: "Critical",
    },
    urgent: {
      color: "amber",
      bg: "bg-amber-50 dark:bg-amber-950/30",
      border: "border-amber-300 dark:border-amber-800",
      text: "text-amber-700 dark:text-amber-400",
      badge: "bg-amber-500 text-white",
      icon: Timer,
      label: "Urgent",
    },
    soon: {
      color: "yellow",
      bg: "bg-yellow-50 dark:bg-yellow-950/30",
      border: "border-yellow-300 dark:border-yellow-800",
      text: "text-yellow-700 dark:text-yellow-500",
      badge: "bg-yellow-400 text-yellow-900",
      icon: Hourglass,
      label: "Soon",
    },
    normal: {
      color: "emerald",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      border: "border-emerald-300 dark:border-emerald-800",
      text: "text-emerald-700 dark:text-emerald-400",
      badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
      icon: Calendar,
      label: "Normal",
    },
    closed: {
      color: "zinc",
      bg: "bg-muted/30",
      border: "border-border",
      text: "text-muted-foreground",
      badge: "bg-muted text-muted-foreground",
      icon: XCircle,
      label: "Closed",
    },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-primary" />
            Deadline Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Automatic tracking of all tender deadlines with adjustable reminders
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard icon={CalendarClock} value={summary.active_count} label="Active" color="emerald" />
          <SummaryCard icon={Zap} value={summary.critical_count} label="Critical" color="rose" />
          <SummaryCard icon={Timer} value={summary.urgent_count} label="Urgent (≤7d)" color="amber" />
          <SummaryCard icon={Hourglass} value={summary.soon_count} label="Soon (≤14d)" color="yellow" />
          <SummaryCard icon={XCircle} value={summary.closed_count} label="Closed" color="zinc" />
          <SummaryCard icon={Calendar} value={summary.total_with_deadlines} label="Total" color="primary" />
        </div>
      )}

      {/* Next deadline banner */}
      {summary?.next_deadline && (
        <Card className={cn(
          "border-2",
          urgencyConfig[summary.next_deadline.urgency as keyof typeof urgencyConfig]?.border,
          urgencyConfig[summary.next_deadline.urgency as keyof typeof urgencyConfig]?.bg
        )}>
          <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
                urgencyConfig[summary.next_deadline.urgency as keyof typeof urgencyConfig]?.badge
              )}>
                <Hourglass className="h-6 w-6" />
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Next Deadline
                </div>
                <div className="font-semibold text-base">
                  {summary.next_deadline.reference_number} — {summary.next_deadline.title}
                </div>
                <div className="text-sm text-muted-foreground">
                  Closes {formatDate(summary.next_deadline.closing_date)}
                  {summary.next_deadline.closing_time && ` at ${summary.next_deadline.closing_time}`}
                </div>
              </div>
            </div>
            <div className="text-right">
              {summary.next_deadline.days_remaining !== null && (
                <div className={cn(
                  "text-3xl font-bold tabular-nums",
                  urgencyConfig[summary.next_deadline.urgency as keyof typeof urgencyConfig]?.text
                )}>
                  {summary.next_deadline.days_remaining}
                  <span className="text-sm font-normal ml-1">days</span>
                </div>
              )}
              {summary.next_deadline.hours_remaining !== null && (
                <div className="text-sm text-muted-foreground">
                  {summary.next_deadline.hours_remaining} hours remaining
                </div>
              )}
              <Button size="sm" className="mt-1" onClick={() => openTender(summary.next_deadline.id)}>
                Open Tender
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reminder settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4 text-primary" />
            Reminder Settings
          </CardTitle>
          <CardDescription className="text-xs">
            Automatic reminders fire at these intervals before each tender's closing date. Toggle them on/off or add custom periods.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {reminders.map((r) => (
              <div
                key={r.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
                  r.enabled
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-muted/30"
                )}
              >
                <Switch
                  checked={r.enabled}
                  onCheckedChange={(v) => handleToggleReminder(r.id, v)}
                />
                <div className="flex items-center gap-1">
                  {r.enabled && <BellRing className="h-3.5 w-3.5 text-primary" />}
                  <span className={cn("text-sm font-medium", !r.enabled && "text-muted-foreground")}>
                    {r.days_before} day{r.days_before === 1 ? "" : "s"} before
                  </span>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground hover:text-rose-600"
                  onClick={() => handleDeleteReminder(r.id, r.days_before)}
                  title="Remove reminder"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-2 border-t">
            <Input
              type="number"
              min={1}
              max={365}
              value={newReminderDays}
              onChange={(e) => setNewReminderDays(e.target.value)}
              placeholder="Custom days (e.g. 21)"
              className="w-48"
              onKeyDown={(e) => e.key === "Enter" && handleAddReminder()}
            />
            <Button size="sm" onClick={handleAddReminder} disabled={addingReminder || !newReminderDays}>
              {addingReminder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add Reminder
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Deadline list */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          All Tender Deadlines
          <Badge variant="outline" className="text-xs">{deadlines.length}</Badge>
        </h2>

        {deadlines.length === 0 ? (
          <Card>
            <CardContent className="py-16 flex flex-col items-center text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <CalendarClock className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-semibold">No deadlines yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Tenders with closing dates will appear here, sorted by urgency. Add a closing date to your tenders to start tracking deadlines.
              </p>
              <Button className="mt-4" onClick={() => setTab("tenders")}>
                Go to Tenders
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {deadlines.map((d) => {
              const config = urgencyConfig[d.urgency];
              const UrgencyIcon = config.icon;
              return (
                <Card
                  key={d.id}
                  className={cn(
                    "border-l-4 transition-all hover:shadow-md cursor-pointer",
                    config.border,
                    d.is_closed && "opacity-60"
                  )}
                  onClick={() => openTender(d.id)}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Urgency indicator */}
                      <div className="flex items-center gap-2 sm:flex-col sm:items-center sm:gap-1 sm:w-20 shrink-0">
                        <div className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full",
                          config.badge
                        )}>
                          <UrgencyIcon className="h-5 w-5" />
                        </div>
                        <Badge variant="outline" className={cn("text-xs", config.badge)}>
                          {config.label}
                        </Badge>
                      </div>

                      {/* Tender info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-mono text-xs font-semibold text-primary">
                            {d.reference_number}
                          </span>
                          <Badge variant="outline" className={cn("text-xs", statusColor(d.status))}>
                            {d.status}
                          </Badge>
                          {d.active_reminders.length > 0 && (
                            <Badge variant="outline" className="text-xs bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                              <BellRing className="h-3 w-3 mr-0.5" />
                              Reminder active
                            </Badge>
                          )}
                        </div>
                        <h3 className="font-semibold text-sm sm:text-base line-clamp-1">{d.title}</h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {d.client_company}
                          </span>
                          {d.location_site && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {d.location_site}
                            </span>
                          )}
                          {d.person_responsible && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {d.person_responsible}
                            </span>
                          )}
                          {d.estimated_value != null && (
                            <span className="font-medium text-foreground">{formatCurrency(d.estimated_value)}</span>
                          )}
                        </div>
                      </div>

                      {/* Deadline countdown */}
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground flex items-center gap-1 justify-center">
                            <Calendar className="h-3 w-3" />
                            Closing
                          </div>
                          <div className="text-sm font-medium">{formatDate(d.closing_date)}</div>
                          {d.closing_time && (
                            <div className="text-xs text-muted-foreground">{d.closing_time}</div>
                          )}
                        </div>
                        <div className={cn("text-center min-w-[80px]", config.text)}>
                          {d.is_closed ? (
                            <>
                              <div className="text-2xl font-bold">
                                <XCircle className="h-7 w-7 mx-auto" />
                              </div>
                              <div className="text-xs font-medium">Closed</div>
                            </>
                          ) : d.hours_remaining !== null && d.hours_remaining <= 72 ? (
                            <>
                              <div className="text-2xl font-bold tabular-nums">
                                {d.hours_remaining}
                              </div>
                              <div className="text-xs font-medium">hours left</div>
                            </>
                          ) : (
                            <>
                              <div className="text-2xl font-bold tabular-nums">
                                {d.days_remaining}
                              </div>
                              <div className="text-xs font-medium">days left</div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Active reminders strip */}
                    {d.active_reminders.length > 0 && !d.is_closed && (
                      <div className="mt-2 pt-2 border-t flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <BellRing className="h-3 w-3 text-rose-600" />
                          Reminders firing:
                        </span>
                        {d.active_reminders.map((rd) => (
                          <Badge key={rd} variant="outline" className="text-xs bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                            {rd} day{rd === 1 ? "" : "s"} before
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Info banner */}
      <Alert>
        <CalendarClock className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>How reminders work:</strong> When a tender's closing date is within one of your reminder periods (e.g. 7 days),
          a reminder badge appears on that tender in the deadlines list and on the dashboard. The system automatically tracks
          days remaining, hours remaining (when within 72 hours), and whether a tender has closed. Adjust the reminder periods above to suit your workflow.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function SummaryCard({ icon: Icon, value, label, color }: {
  icon: any; value: number; label: string; color: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-500",
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
          <div className="text-xl font-bold tabular-nums">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
