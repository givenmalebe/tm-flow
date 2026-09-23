"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MessageSquare,
  Mail,
  HelpCircle,
  Reply,
  Users,
  FileDiff,
  Clock,
  Tag,
  FileText,
  Send,
  Building2,
  RefreshCw,
  Plus,
  Search,
  Trash2,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api";
import {
  useDashboardStore,
  formatDateTime,
} from "@/lib/dashboard-store";
import { cn } from "@/lib/utils";

// ---- Types ----
interface TenderOption {
  id: number;
  reference_number: string;
  title: string;
  client_company: string | null;
  status: string;
}

interface CommunicationRaw {
  id: number;
  comm_type: string;
  subject: string | null;
  body: string | null;
  comm_date: string | null;
  from_party: string | null;
  to_party: string | null;
  notes: string | null;
}

interface FlattenedCommunication extends CommunicationRaw {
  tender_id: number;
  tender_reference: string;
  tender_title: string;
}

interface CommForm {
  tender_id: string;
  comm_type: string;
  subject: string;
  body: string;
  comm_date: string;
  from_party: string;
  to_party: string;
  notes: string;
}

const EMPTY_FORM: CommForm = {
  tender_id: "",
  comm_type: "Email",
  subject: "",
  body: "",
  comm_date: "",
  from_party: "",
  to_party: "",
  notes: "",
};

const COMM_TYPES = [
  "Email",
  "Clarification Request",
  "Clarification Response",
  "Meeting",
  "Addendum",
  "Extension",
  "Tender Validity Extension",
  "Pricing Clarification",
  "Client Correspondence",
  "Other",
] as const;

// ---- Helpers ----
function commTypeBadgeClass(type: string): string {
  switch (type) {
    case "Email":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900";
    case "Clarification Request":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900";
    case "Clarification Response":
      return "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border-teal-200 dark:border-teal-900";
    case "Meeting":
      return "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300 border-cyan-200 dark:border-cyan-900";
    case "Addendum":
      return "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-violet-200 dark:border-violet-900";
    case "Extension":
    case "Tender Validity Extension":
      return "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 border-orange-200 dark:border-orange-900";
    case "Pricing Clarification":
      return "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-900";
    case "Client Correspondence":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function commTypeIconClass(type: string): string {
  switch (type) {
    case "Email":
      return "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400";
    case "Clarification Request":
      return "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400";
    case "Clarification Response":
      return "bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400";
    case "Meeting":
      return "bg-cyan-100 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-400";
    case "Addendum":
      return "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400";
    case "Extension":
    case "Tender Validity Extension":
      return "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400";
    case "Pricing Clarification":
      return "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-950 dark:text-fuchsia-400";
    case "Client Correspondence":
      return "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

// ---- Communication type icon render (declared outside main component
// to satisfy react-hooks/static-components) ----
function CommTypeIconRender({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  switch (type) {
    case "Email":
      return <Mail className={className} />;
    case "Clarification Request":
      return <HelpCircle className={className} />;
    case "Clarification Response":
      return <Reply className={className} />;
    case "Meeting":
      return <Users className={className} />;
    case "Addendum":
      return <FileDiff className={className} />;
    case "Extension":
    case "Tender Validity Extension":
      return <Clock className={className} />;
    case "Pricing Clarification":
      return <Tag className={className} />;
    case "Client Correspondence":
      return <Send className={className} />;
    default:
      return <FileText className={className} />;
  }
}

// ---- Stat card ----
interface StatCardProps {
  icon: LucideIcon;
  iconClass: string;
  value: number;
  label: string;
  sublabel: string;
}

function StatCard({ icon: Icon, iconClass, value, label, sublabel }: StatCardProps) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
            {value}
          </div>
          <div className="mt-1 text-sm font-medium text-foreground">{label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>
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
    </Card>
  );
}

function StatSkeleton() {
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
  title,
  message,
  iconClass,
  action,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  iconClass?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-2xl",
          iconClass || "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
        )}
      >
        <Icon className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
      </div>
      {action}
    </div>
  );
}

// ---- Communication timeline card ----
interface CommunicationCardProps {
  comm: FlattenedCommunication;
  isLast: boolean;
  onDelete: (id: number) => void;
  onOpenTender: (id: number) => void;
}

function CommunicationCard({
  comm,
  isLast,
  onDelete,
  onOpenTender,
}: CommunicationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const body = comm.body?.trim() || "";
  const isLongBody = body.length > 240;
  const shownBody = expanded || !isLongBody ? body : body.slice(0, 240).trimEnd() + "…";

  return (
    <div className="relative pl-12 pb-6">
      {/* Timeline line */}
      {!isLast && (
        <span
          className="absolute left-[18px] top-10 bottom-0 w-px bg-border"
          aria-hidden
        />
      )}
      {/* Timeline node */}
      <div
        className={cn(
          "absolute left-0 top-1 flex h-9 w-9 items-center justify-center rounded-full ring-4 ring-background",
          commTypeIconClass(comm.comm_type)
        )}
      >
        <CommTypeIconRender type={comm.comm_type} className="h-4 w-4" />
      </div>

      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="space-y-3">
          {/* Header row */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("border text-[11px] font-medium", commTypeBadgeClass(comm.comm_type))}
                >
                  {comm.comm_type}
                </Badge>
                <span className="text-sm font-semibold text-foreground">
                  {comm.subject || "(no subject)"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onOpenTender(comm.tender_id)}
                className="group inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
                title="Open tender"
              >
                <Building2 className="h-3.5 w-3.5" />
                <span className="font-mono">{comm.tender_reference}</span>
                <span className="truncate max-w-[260px] group-hover:underline">
                  · {comm.tender_title}
                </span>
              </button>
            </div>
            <div className="flex items-center gap-1">
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950"
                  aria-label="Delete communication"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete communication?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete{" "}
                      <span className="font-semibold text-foreground">
                        {comm.subject || "this communication"}
                      </span>
                      . This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-600"
                      onClick={() => {
                        onDelete(comm.id);
                        setConfirmOpen(false);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {/* Date + parties */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span className="tabular-nums">{formatDateTime(comm.comm_date)}</span>
            </span>
            {comm.from_party && (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-muted-foreground/70">From:</span>
                <span className="font-medium text-foreground">{comm.from_party}</span>
              </span>
            )}
            {comm.to_party && (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-muted-foreground/70">To:</span>
                <span className="font-medium text-foreground">{comm.to_party}</span>
              </span>
            )}
          </div>

          {/* Body */}
          {body && (
            <div className="space-y-1">
              <p className="whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed">
                {shownBody}
              </p>
              {isLongBody && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-primary hover:bg-primary/10"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronRight className="h-3 w-3" />
                      Show more
                    </>
                  )}
                </Button>
              )}
            </div>
          )}

          {/* Notes */}
          {comm.notes?.trim() && (
            <div className="rounded-lg border border-dashed bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                <StickyNote className="h-3 w-3" />
                Notes
              </div>
              <p className="text-xs text-foreground/80 whitespace-pre-wrap">
                {comm.notes}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Main component ----
export function ClarificationsTab() {
  const [tenders, setTenders] = useState<TenderOption[]>([]);
  const [communications, setCommunications] = useState<FlattenedCommunication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CommForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchTenders = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.listTenders({ sort: "updated_at", order: "desc" });
      const items = (res?.items || []) as TenderOption[];
      setTenders(items);

      const flat: FlattenedCommunication[] = [];
      for (const t of items) {
        const tender = t as any;
        const comms = (tender.communications || []) as CommunicationRaw[];
        for (const c of comms) {
          flat.push({
            ...c,
            tender_id: tender.id,
            tender_reference: tender.reference_number || "—",
            tender_title: tender.title || "",
          });
        }
      }
      // Newest first
      flat.sort((a, b) => {
        const da = a.comm_date ? new Date(a.comm_date).getTime() : 0;
        const db = b.comm_date ? new Date(b.comm_date).getTime() : 0;
        if (db !== da) return db - da;
        return b.id - a.id;
      });
      setCommunications(flat);
    } catch (e: any) {
      setError(e?.message || "Failed to load communications");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTenders();
  }, [fetchTenders]);

  const openTender = (id: number) => {
    useDashboardStore.getState().setTab("tenders");
    setTimeout(() => useDashboardStore.getState().selectTender(id), 50);
  };

  // ---- Stats ----
  const stats = useMemo(() => {
    const total = communications.length;
    const clarificationRequests = communications.filter(
      (c) => c.comm_type === "Clarification Request"
    ).length;
    const meetings = communications.filter((c) => c.comm_type === "Meeting").length;
    const extensions = communications.filter(
      (c) =>
        c.comm_type === "Extension" ||
        c.comm_type === "Tender Validity Extension"
    ).length;
    return { total, clarificationRequests, meetings, extensions };
  }, [communications]);

  // ---- Filtered communications ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return communications.filter((c) => {
      if (typeFilter !== "all" && c.comm_type !== typeFilter) return false;
      if (!q) return true;
      const hay = [
        c.subject || "",
        c.body || "",
        c.tender_reference || "",
        c.tender_title || "",
        c.from_party || "",
        c.to_party || "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [communications, typeFilter, search]);

  // ---- Create communication ----
  const handleSave = async () => {
    if (!form.tender_id) {
      toast.error("Please select a tender");
      return;
    }
    if (!form.comm_type) {
      toast.error("Please select a communication type");
      return;
    }
    setSaving(true);
    try {
      const tenderId = Number(form.tender_id);
      await api.createCommunication(tenderId, {
        tender_id: tenderId,
        comm_type: form.comm_type,
        subject: form.subject.trim() || undefined,
        body: form.body.trim() || undefined,
        comm_date: form.comm_date || undefined,
        from_party: form.from_party.trim() || undefined,
        to_party: form.to_party.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      toast.success("Communication logged");
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      await fetchTenders(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to log communication");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteCommunication(id);
      toast.success("Communication deleted");
      await fetchTenders(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete communication");
    }
  };

  const openDialog = () => {
    setForm({
      ...EMPTY_FORM,
      comm_date: toDatetimeLocalValue(new Date().toISOString()),
    });
    setDialogOpen(true);
  };

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Skeleton className="h-10 w-full sm:w-56" />
          <Skeleton className="h-10 flex-1" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Clarifications &amp; Communication
          </h1>
          <p className="text-sm text-muted-foreground">
            Track all communication relating to tenders
          </p>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn&apos;t load communications</AlertTitle>
          <AlertDescription>
            <p className="mb-3">{error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchTenders()}
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

  return (
    <div className="space-y-6">
      {/* ---- Page header ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Clarifications &amp; Communication
          </h1>
          <p className="text-sm text-muted-foreground">
            Track all communication relating to tenders
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => fetchTenders(true)}
            disabled={refreshing}
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
            />
            Refresh
          </Button>
          <Button onClick={openDialog} disabled={tenders.length === 0}>
            <Plus className="h-4 w-4" />
            Log Communication
          </Button>
        </div>
      </div>

      {/* ---- Stats ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={MessageSquare}
          iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
          value={stats.total}
          label="Total Communications"
          sublabel="Across all tenders"
        />
        <StatCard
          icon={HelpCircle}
          iconClass="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
          value={stats.clarificationRequests}
          label="Clarification Requests"
          sublabel="Logged to date"
        />
        <StatCard
          icon={Users}
          iconClass="bg-cyan-100 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-400"
          value={stats.meetings}
          label="Meetings"
          sublabel="Logged"
        />
        <StatCard
          icon={Clock}
          iconClass="bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400"
          value={stats.extensions}
          label="Extensions"
          sublabel="Deadline / validity"
        />
      </div>

      {/* ---- Filter bar ---- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:w-60">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {COMM_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by subject, tender reference, parties…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* ---- Tender-empty banner ---- */}
      {tenders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent>
            <EmptyState
              icon={MessageSquare}
              title="No tenders yet"
              message="Create a tender first, then you can log communications against it."
              iconClass="bg-muted text-muted-foreground"
            />
          </CardContent>
        </Card>
      ) : communications.length === 0 ? (
        <Card className="border-dashed">
          <CardContent>
            <EmptyState
              icon={MessageSquare}
              title="No communications logged yet"
              message="Log your first email, clarification request, meeting or extension to start building your audit trail."
              action={
                <Button onClick={openDialog}>
                  <Plus className="h-4 w-4" />
                  Log Communication
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent>
            <EmptyState
              icon={Search}
              title="No matches"
              message="No communications match your current filters. Try adjusting the type or search query."
              iconClass="bg-muted text-muted-foreground"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground tabular-nums">
                {filtered.length}
              </span>{" "}
              of{" "}
              <span className="font-medium text-foreground tabular-nums">
                {communications.length}
              </span>{" "}
              communications
            </p>
          </div>
          <Separator />
          <div className="pt-2">
            {filtered.map((c, idx) => (
              <CommunicationCard
                key={c.id}
                comm={c}
                isLast={idx === filtered.length - 1}
                onDelete={handleDelete}
                onOpenTender={openTender}
              />
            ))}
          </div>
        </div>
      )}

      {/* ---- Log Communication Dialog ---- */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setForm(EMPTY_FORM);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle>Log Communication</DialogTitle>
            <DialogDescription>
              Record a communication against a tender for your audit trail.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Tender */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="comm-tender">
                Tender <span className="text-rose-600">*</span>
              </Label>
              <Select
                value={form.tender_id}
                onValueChange={(v) => setForm((f) => ({ ...f, tender_id: v }))}
              >
                <SelectTrigger id="comm-tender" className="w-full">
                  <SelectValue placeholder="Select a tender…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {tenders.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      <span className="font-mono text-xs">{t.reference_number}</span>
                      <span className="text-muted-foreground"> — </span>
                      <span className="truncate">{t.title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <Label htmlFor="comm-type">
                Type <span className="text-rose-600">*</span>
              </Label>
              <Select
                value={form.comm_type}
                onValueChange={(v) => setForm((f) => ({ ...f, comm_type: v }))}
              >
                <SelectTrigger id="comm-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {COMM_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <Label htmlFor="comm-date">Date &amp; time</Label>
              <Input
                id="comm-date"
                type="datetime-local"
                value={form.comm_date}
                onChange={(e) => setForm((f) => ({ ...f, comm_date: e.target.value }))}
              />
            </div>

            {/* Subject */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="comm-subject">Subject</Label>
              <Input
                id="comm-subject"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                placeholder="Brief subject line"
              />
            </div>

            {/* From / To */}
            <div className="space-y-1.5">
              <Label htmlFor="comm-from">From</Label>
              <Input
                id="comm-from"
                value={form.from_party}
                onChange={(e) => setForm((f) => ({ ...f, from_party: e.target.value }))}
                placeholder="Sender name / organisation"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comm-to">To</Label>
              <Input
                id="comm-to"
                value={form.to_party}
                onChange={(e) => setForm((f) => ({ ...f, to_party: e.target.value }))}
                placeholder="Recipient name / organisation"
              />
            </div>

            {/* Body */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="comm-body">Body</Label>
              <Textarea
                id="comm-body"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Paste or write the communication body…"
                rows={5}
              />
            </div>

            {/* Notes */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="comm-notes">Internal notes</Label>
              <Textarea
                id="comm-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional internal notes (not sent to client)"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.tender_id}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Log Communication
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
