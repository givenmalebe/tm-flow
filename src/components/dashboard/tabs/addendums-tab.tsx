"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileDiff,
  FileStack,
  Hourglass,
  Sparkles,
  RefreshCw,
  Plus,
  Search,
  Trash2,
  AlertTriangle,
  Loader2,
  Download,
  Upload,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Building2,
  Calendar,
  FileText,
  Wand2,
  AlertCircle,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import {
  useDashboardStore,
  formatDate,
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

interface AddendumRaw {
  id: number;
  addendum_number: string | null;
  title: string;
  description: string | null;
  issued_date: string | null;
  ai_changes: AiChanges | null;
  created_at: string | null;
  file_path?: string | null;
}

interface FlattenedAddendum extends AddendumRaw {
  tender_id: number;
  tender_reference: string;
  tender_title: string;
  tender_status: string;
}

interface ChangedDate {
  field: string;
  from: string;
  to: string;
}

interface AiChanges {
  new_requirements?: string[];
  removed_requirements?: string[];
  changed_dates?: ChangedDate[];
  changed_pricing?: string[];
  changed_scope?: string[];
  changed_submission?: string[];
  other_changes?: string[];
  summary?: string;
  _error?: string;
}

interface AddendumForm {
  tender_id: string;
  addendum_number: string;
  title: string;
  description: string;
  issued_date: string;
}

const EMPTY_FORM: AddendumForm = {
  tender_id: "",
  addendum_number: "",
  title: "",
  description: "",
  issued_date: "",
};

const ACCEPTED_FILE_TYPES = ".pdf,.doc,.docx,.txt";

// ---- Helpers ----
function downloadUrl(filePath: string): string {
  return `/uploads/${filePath}`;
}

function hasAiChanges(a: AddendumRaw): a is AddendumRaw & { ai_changes: AiChanges } {
  return !!a.ai_changes && typeof a.ai_changes === "object";
}

function hasAiError(a: AddendumRaw): boolean {
  return !!a.ai_changes && !!(a.ai_changes as AiChanges)._error;
}

function isNonEmpty(arr: any[] | undefined | null): boolean {
  return Array.isArray(arr) && arr.length > 0;
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

// ---- AI Changes display ----
function ChangeList({
  items,
  variant,
}: {
  items: string[];
  variant: "added" | "removed" | "neutral";
}) {
  const iconClass =
    variant === "added"
      ? "text-emerald-600 dark:text-emerald-400"
      : variant === "removed"
      ? "text-rose-600 dark:text-rose-400"
      : "text-muted-foreground";
  return (
    <ul className="space-y-1.5">
      {items.map((s, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
          {variant === "added" ? (
            <CheckCircle2 className={cn("mt-0.5 h-4 w-4 shrink-0", iconClass)} />
          ) : variant === "removed" ? (
            <XCircle className={cn("mt-0.5 h-4 w-4 shrink-0", iconClass)} />
          ) : (
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current", iconClass)} />
          )}
          <span className="leading-relaxed">{s}</span>
        </li>
      ))}
    </ul>
  );
}

interface AiChangesPanelProps {
  changes: AiChanges;
  onRetry: () => void;
  retrying: boolean;
}

function AiChangesPanel({ changes, onRetry, retrying }: AiChangesPanelProps) {
  if (changes._error) {
    return (
      <Alert variant="destructive" className="mt-3">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>AI analysis failed</AlertTitle>
        <AlertDescription>
          <p className="mb-3 text-sm">{changes._error}</p>
          <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
            {retrying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Retry analysis
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const hasAnything =
    isNonEmpty(changes.new_requirements) ||
    isNonEmpty(changes.removed_requirements) ||
    isNonEmpty(changes.changed_dates) ||
    isNonEmpty(changes.changed_pricing) ||
    isNonEmpty(changes.changed_scope) ||
    isNonEmpty(changes.changed_submission) ||
    isNonEmpty(changes.other_changes);

  if (!hasAnything && !changes.summary) {
    return (
      <div className="mt-3 rounded-lg border border-dashed bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
        AI analysis ran but no specific changes were detected.
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
        <Sparkles className="h-4 w-4" />
        AI Change Detection
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {isNonEmpty(changes.new_requirements) && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              New requirements
            </p>
            <ChangeList items={changes.new_requirements!} variant="added" />
          </div>
        )}
        {isNonEmpty(changes.removed_requirements) && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">
              Removed requirements
            </p>
            <ChangeList items={changes.removed_requirements!} variant="removed" />
          </div>
        )}
        {isNonEmpty(changes.changed_pricing) && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Changed pricing
            </p>
            <ChangeList items={changes.changed_pricing!} variant="neutral" />
          </div>
        )}
        {isNonEmpty(changes.changed_scope) && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-fuchsia-700 dark:text-fuchsia-400">
              Changed scope
            </p>
            <ChangeList items={changes.changed_scope!} variant="neutral" />
          </div>
        )}
        {isNonEmpty(changes.changed_submission) && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-400">
              Changed submission
            </p>
            <ChangeList items={changes.changed_submission!} variant="neutral" />
          </div>
        )}
        {isNonEmpty(changes.other_changes) && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Other changes
            </p>
            <ChangeList items={changes.other_changes!} variant="neutral" />
          </div>
        )}
      </div>

      {isNonEmpty(changes.changed_dates) && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400">
            Changed dates
          </p>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[40%]">Field</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead className="w-[40px]" />
                  <TableHead>To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {changes.changed_dates!.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{d.field || "—"}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {d.from || "—"}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </TableCell>
                    <TableCell className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
                      {d.to || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {changes.summary && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            <Sparkles className="h-3 w-3" />
            Summary
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
            {changes.summary}
          </p>
        </div>
      )}
    </div>
  );
}

// ---- Addendum card ----
interface AddendumCardProps {
  addendum: FlattenedAddendum;
  analyzing: boolean;
  onAnalyze: (id: number) => void;
  onDelete: (id: number) => void;
  onOpenTender: (id: number) => void;
}

function AddendumCard({
  addendum,
  analyzing,
  onAnalyze,
  onDelete,
  onOpenTender,
}: AddendumCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const aiActive = hasAiChanges(addendum);
  const aiFailed = hasAiError(addendum);

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="space-y-3">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {addendum.addendum_number && (
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                  {addendum.addendum_number}
                </Badge>
              )}
              <span className="text-sm font-semibold text-foreground">
                {addendum.title}
              </span>
              {aiActive && !aiFailed && (
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                >
                  <Sparkles className="h-3 w-3" />
                  Analyzed
                </Badge>
              )}
              {aiFailed && (
                <Badge
                  variant="outline"
                  className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
                >
                  <AlertCircle className="h-3 w-3" />
                  Analysis failed
                </Badge>
              )}
            </div>
            <button
              type="button"
              onClick={() => onOpenTender(addendum.tender_id)}
              className="group inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
              title="Open tender"
            >
              <Building2 className="h-3.5 w-3.5" />
              <span className="font-mono">{addendum.tender_reference}</span>
              <span className="truncate max-w-[260px] group-hover:underline">
                · {addendum.tender_title}
              </span>
            </button>
          </div>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950"
              aria-label="Delete addendum"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete addendum?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete{" "}
                  <span className="font-semibold text-foreground">
                    {addendum.title}
                  </span>{" "}
                  and its uploaded file. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-600"
                  onClick={() => {
                    onDelete(addendum.id);
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

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {addendum.issued_date && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span className="text-muted-foreground/70">Issued:</span>
              <span className="font-medium text-foreground tabular-nums">
                {formatDate(addendum.issued_date)}
              </span>
            </span>
          )}
          {addendum.created_at && (
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              <span className="text-muted-foreground/70">Uploaded:</span>
              <span className="font-medium text-foreground tabular-nums">
                {formatDateTime(addendum.created_at)}
              </span>
            </span>
          )}
          {addendum.file_path && (
            <a
              href={downloadUrl(addendum.file_path)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-emerald-700 hover:underline dark:text-emerald-400"
            >
              <Download className="h-3.5 w-3.5" />
              Download file
            </a>
          )}
        </div>

        {/* Description */}
        {addendum.description?.trim() && (
          <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
            {addendum.description}
          </p>
        )}

        {/* AI changes */}
        {aiActive ? (
          <AiChangesPanel
            changes={addendum.ai_changes!}
            onRetry={() => onAnalyze(addendum.id)}
            retrying={analyzing}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wand2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Not analyzed yet — run AI change detection.</span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={() => onAnalyze(addendum.id)}
                  disabled={analyzing}
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Analyzing…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Analyze with AI
                    </>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>This may take 30–60 seconds</TooltipContent>
            </Tooltip>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Main component ----
export function AddendumsTab() {
  const [tenders, setTenders] = useState<TenderOption[]>([]);
  const [addendums, setAddendums] = useState<FlattenedAddendum[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AddendumForm>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchTenders = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.listTenders({ sort: "updated_at", order: "desc" });
      const items = (res?.items || []) as TenderOption[];
      setTenders(items);

      const flat: FlattenedAddendum[] = [];
      for (const t of items) {
        const tender = t as any;
        const adds = (tender.addendums || []) as AddendumRaw[];
        for (const a of adds) {
          flat.push({
            ...a,
            tender_id: tender.id,
            tender_reference: tender.reference_number || "—",
            tender_title: tender.title || "",
            tender_status: tender.status || "",
          });
        }
      }
      // Newest first by created_at, fall back to issued_date, then id
      flat.sort((a, b) => {
        const ta = new Date(a.created_at || a.issued_date || 0).getTime();
        const tb = new Date(b.created_at || b.issued_date || 0).getTime();
        if (tb !== ta) return tb - ta;
        return b.id - a.id;
      });
      setAddendums(flat);
    } catch (e: any) {
      setError(e?.message || "Failed to load addendums");
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
    const total = addendums.length;
    const analyzed = addendums.filter(
      (a) => hasAiChanges(a) && !hasAiError(a)
    ).length;
    const pending = total - addendums.filter(hasAiChanges).length;
    return { total, analyzed, pending };
  }, [addendums]);

  // ---- Filtered list ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return addendums;
    return addendums.filter((a) => {
      const hay = [
        a.title || "",
        a.description || "",
        a.addendum_number || "",
        a.tender_reference || "",
        a.tender_title || "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [addendums, search]);

  // ---- Analyze ----
  const handleAnalyze = async (id: number) => {
    setAnalyzingId(id);
    const tid = toast.loading("Running AI change detection…", {
      description: "This may take 30–60 seconds",
    });
    try {
      const result = await api.analyzeAddendum(id);
      if (result?._error) {
        toast.error("AI analysis failed", {
          id: tid,
          description: result._error,
        });
      } else {
        toast.success("AI analysis complete", { id: tid });
      }
      await fetchTenders(true);
    } catch (e: any) {
      toast.error("AI analysis failed", {
        id: tid,
        description: e?.message || "Please try again",
      });
    } finally {
      setAnalyzingId(null);
    }
  };

  // ---- Upload ----
  const handleSave = async () => {
    if (!form.tender_id) {
      toast.error("Please select a tender");
      return;
    }
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!file) {
      toast.error("Please attach an addendum file");
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("title", form.title.trim());
      if (form.addendum_number.trim()) {
        fd.append("addendum_number", form.addendum_number.trim());
      }
      if (form.description.trim()) {
        fd.append("description", form.description.trim());
      }
      if (form.issued_date) {
        fd.append("issued_date", form.issued_date);
      }
      fd.append("file", file);
      await api.createAddendum(Number(form.tender_id), fd);
      toast.success("Addendum uploaded");
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setFile(null);
      await fetchTenders(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to upload addendum");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteAddendum(id);
      toast.success("Addendum deleted");
      await fetchTenders(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete addendum");
    }
  };

  const openDialog = () => {
    setForm(EMPTY_FORM);
    setFile(null);
    setDialogOpen(true);
  };

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-40" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
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
          <h1 className="text-2xl font-bold tracking-tight">Tender Addendums</h1>
          <p className="text-sm text-muted-foreground">
            Upload addendums and let AI highlight what changed
          </p>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn&apos;t load addendums</AlertTitle>
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
          <h1 className="text-2xl font-bold tracking-tight">Tender Addendums</h1>
          <p className="text-sm text-muted-foreground">
            Upload addendums and let AI highlight what changed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => fetchTenders(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button onClick={openDialog} disabled={tenders.length === 0}>
            <Plus className="h-4 w-4" />
            Upload Addendum
          </Button>
        </div>
      </div>

      {/* ---- Stats ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={FileStack}
          iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
          value={stats.total}
          label="Total Addendums"
          sublabel="Across all tenders"
        />
        <StatCard
          icon={Sparkles}
          iconClass="bg-teal-100 text-teal-600 dark:bg-teal-950 dark:text-teal-400"
          value={stats.analyzed}
          label="Analyzed"
          sublabel="AI change detection done"
        />
        <StatCard
          icon={Hourglass}
          iconClass="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
          value={stats.pending}
          label="Pending Analysis"
          sublabel="Not yet run"
        />
      </div>

      {/* ---- Search ---- */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by tender reference or addendum title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* ---- List ---- */}
      {tenders.length === 0 ? (
        <Card className="border-dashed">
          <CardContent>
            <EmptyState
              icon={FileDiff}
              title="No tenders yet"
              message="Create a tender first, then you can upload addendums and run AI change detection."
              iconClass="bg-muted text-muted-foreground"
            />
          </CardContent>
        </Card>
      ) : addendums.length === 0 ? (
        <Card className="border-dashed">
          <CardContent>
            <EmptyState
              icon={FileDiff}
              title="No addendums uploaded yet"
              message="Upload your first addendum — AI will compare it against the original tender and surface the changes that matter."
              action={
                <Button onClick={openDialog}>
                  <Plus className="h-4 w-4" />
                  Upload Addendum
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
              message="No addendums match your search. Try a different reference or title."
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
                {addendums.length}
              </span>{" "}
              addendums
            </p>
          </div>
          <Separator />
          <div className="space-y-4 pt-2">
            {filtered.map((a) => (
              <AddendumCard
                key={a.id}
                addendum={a}
                analyzing={analyzingId === a.id}
                onAnalyze={handleAnalyze}
                onDelete={handleDelete}
                onOpenTender={openTender}
              />
            ))}
          </div>
        </div>
      )}

      {/* ---- Upload Addendum Dialog ---- */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setForm(EMPTY_FORM);
            setFile(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle>Upload Addendum</DialogTitle>
            <DialogDescription>
              Upload an addendum file. After upload, run AI change detection to
              highlight what changed against the original tender.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Tender */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="add-tender">
                Tender <span className="text-rose-600">*</span>
              </Label>
              <Select
                value={form.tender_id}
                onValueChange={(v) => setForm((f) => ({ ...f, tender_id: v }))}
              >
                <SelectTrigger id="add-tender" className="w-full">
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

            {/* Addendum number */}
            <div className="space-y-1.5">
              <Label htmlFor="add-number">Addendum number</Label>
              <Input
                id="add-number"
                value={form.addendum_number}
                onChange={(e) =>
                  setForm((f) => ({ ...f, addendum_number: e.target.value }))
                }
                placeholder='e.g. "1", "2", "Addendum A"'
              />
            </div>

            {/* Issued date */}
            <div className="space-y-1.5">
              <Label htmlFor="add-issued">Issued date</Label>
              <Input
                id="add-issued"
                type="date"
                value={form.issued_date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, issued_date: e.target.value }))
                }
              />
            </div>

            {/* Title */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="add-title">
                Title <span className="text-rose-600">*</span>
              </Label>
              <Input
                id="add-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Brief title for the addendum"
              />
            </div>

            {/* Description */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="add-description">Description</Label>
              <Textarea
                id="add-description"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Optional summary of what the addendum covers"
                rows={3}
              />
            </div>

            {/* File */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="add-file">
                Addendum file <span className="text-rose-600">*</span>
              </Label>
              <label
                htmlFor="add-file"
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-muted/30 px-4 py-6 text-center transition-colors hover:border-emerald-400 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20",
                  file && "border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20"
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                  {file ? <FileDiff className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
                </div>
                {file ? (
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {(file.size / 1024).toFixed(1)} KB · click to replace
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                      Click to upload
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PDF, DOC, DOCX, or TXT
                    </p>
                  </div>
                )}
                <Input
                  id="add-file"
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setFile(f);
                  }}
                />
              </label>
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
            <Button
              onClick={handleSave}
              disabled={saving || !form.tender_id || !form.title.trim() || !file}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload Addendum
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
