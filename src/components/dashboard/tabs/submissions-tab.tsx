"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Send,
  Search,
  RefreshCw,
  AlertTriangle,
  Loader2,
  Save,
  Pencil,
  Trophy,
  XCircle,
  Hourglass,
  FileStack,
  Copy,
  Check,
  CalendarClock,
  User2,
  Clock,
  Mail,
  Hash,
  TrendingUp,
  Settings2,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { api, TENDER_OUTCOMES } from "@/lib/api";
import {
  useDashboardStore,
  formatDate,
  formatDateTime,
  formatCurrency,
  statusColor,
} from "@/lib/dashboard-store";
import { cn } from "@/lib/utils";

// ---- Types ----
interface Submission {
  id: number;
  submission_date: string | null;
  submission_time: string | null;
  submission_method: string | null;
  submitted_by: string | null;
  confirmation_reference: string | null;
  final_pricing: number | null;
  notes: string | null;
}

interface TenderWithSubmission {
  id: number;
  reference_number: string;
  title: string;
  client_company: string | null;
  status: string;
  outcome: string | null;
  unsuccessful_reason: string | null;
  closing_date: string | null;
  person_responsible: string | null;
  estimated_value: number | null;
  submission: Submission | null;
}

// ---- Constants ----
const SUBMISSION_METHODS = [
  "Email",
  "Online Portal",
  "Physical Delivery",
  "Courier",
  "E-procurement portal",
  "Other",
] as const;

const OUTCOMES = ["Pending", "Awarded", "Unsuccessful", "Withdrawn"] as const;

const SUBMITTED_STATUSES = new Set([
  "Submitted",
  "Awarded",
  "Unsuccessful",
  "Withdrawn",
]);

// ---- Helpers ----
function normalizeOutcome(outcome: string | null | undefined): string {
  if (!outcome || outcome.trim() === "") return "Pending";
  return outcome;
}

function outcomeBadgeClass(outcome: string | null | undefined): string {
  const o = normalizeOutcome(outcome);
  switch (o) {
    case "Awarded":
      return "bg-emerald-600 text-white hover:bg-emerald-600";
    case "Unsuccessful":
      return "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 hover:bg-rose-100";
    case "Withdrawn":
      return "bg-muted text-muted-foreground hover:bg-muted";
    case "Pending":
    default:
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 hover:bg-amber-100";
  }
}

function OutcomeIconRender({
  outcome,
  className,
}: {
  outcome: string | null | undefined;
  className?: string;
}) {
  const o = normalizeOutcome(outcome);
  if (o === "Awarded") return <Trophy className={className} />;
  if (o === "Unsuccessful") return <XCircle className={className} />;
  if (o === "Withdrawn") return <Hourglass className={className} />;
  return <Hourglass className={className} />;
}

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

function daysSinceLabel(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 0) return `In ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`;
  return `${days} days ago`;
}

function isSubmissionTracked(t: TenderWithSubmission): boolean {
  if (t.submission !== null) return true;
  if (SUBMITTED_STATUSES.has(t.status)) return true;
  const o = normalizeOutcome(t.outcome);
  if (o !== "Pending") return true;
  return false;
}

// ---- Empty state ----
function EmptyState({
  icon: Icon,
  message,
  hint,
  iconClass,
}: {
  icon: LucideIcon;
  message: string;
  hint?: string;
  iconClass?: string;
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
        <p className="text-sm font-medium text-foreground">{message}</p>
        {hint && (
          <p className="text-xs text-muted-foreground max-w-sm">{hint}</p>
        )}
      </div>
    </div>
  );
}

// ---- Stat card ----
function StatCard({
  icon: Icon,
  iconClass,
  value,
  label,
  sublabel,
}: {
  icon: LucideIcon;
  iconClass: string;
  value: string | number;
  label: string;
  sublabel?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {value}
          </div>
          <div className="mt-0.5 text-sm font-medium text-foreground">{label}</div>
          {sublabel && (
            <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>
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
    </Card>
  );
}

// ---- Copy button ----
function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(label ? `${label} copied` : "Copied to clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  };
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
      onClick={handleCopy}
      aria-label="Copy reference"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

// ---- Submission Row Card ----
interface SubmissionCardProps {
  tender: TenderWithSubmission;
  onOpenTender: (id: number) => void;
  onEdit: (tender: TenderWithSubmission) => void;
  onSetOutcome: (tender: TenderWithSubmission) => void;
}

function SubmissionCard({
  tender,
  onOpenTender,
  onEdit,
  onSetOutcome,
}: SubmissionCardProps) {
  const [showReason, setShowReason] = useState(false);
  const sub = tender.submission;
  const outcome = normalizeOutcome(tender.outcome);
  const days = sub?.submission_date
    ? daysSince(sub.submission_date)
    : daysSince(tender.closing_date);
  const reason = tender.unsuccessful_reason?.trim();

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="space-y-4">
        {/* Header row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onOpenTender(tender.id)}
                className="font-mono text-xs font-semibold text-primary hover:underline"
              >
                {tender.reference_number}
              </button>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-medium",
                  statusColor(tender.status)
                )}
              >
                {tender.status}
              </Badge>
            </div>
            <button
              onClick={() => onOpenTender(tender.id)}
              className="block text-left text-base font-semibold text-foreground hover:underline line-clamp-2"
            >
              {tender.title}
            </button>
            <div className="text-xs text-muted-foreground">
              {tender.client_company || "No client"}
            </div>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end shrink-0">
            <Badge className={cn("gap-1", outcomeBadgeClass(tender.outcome))}>
              <OutcomeIconRender outcome={outcome} className="h-3 w-3" />
              {outcome}
            </Badge>
            {sub?.final_pricing != null && (
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(sub.final_pricing)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  final pricing
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-4">
          <DetailItem
            icon={CalendarClock}
            label="Submitted"
            value={
              sub?.submission_date
                ? `${formatDate(sub.submission_date)}${
                    sub.submission_time ? ` · ${sub.submission_time}` : ""
                  }`
                : "—"
            }
          />
          <DetailItem
            icon={Mail}
            label="Method"
            value={sub?.submission_method || "—"}
          />
          <DetailItem
            icon={User2}
            label="Submitted by"
            value={sub?.submitted_by || tender.person_responsible || "—"}
          />
          <DetailItem
            icon={Clock}
            label="Days since"
            value={daysSinceLabel(days)}
            valueClass={
              days !== null && days > 60
                ? "text-amber-700 dark:text-amber-400"
                : undefined
            }
          />
        </div>

        {/* Confirmation reference + reason row */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          {sub?.confirmation_reference && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Confirmation ref:</span>
              <span className="font-mono font-medium text-foreground">
                {sub.confirmation_reference}
              </span>
              <CopyButton
                value={sub.confirmation_reference}
                label="Confirmation reference"
              />
            </div>
          )}
          {sub?.notes && (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-muted-foreground shrink-0">Notes:</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="truncate font-medium text-foreground max-w-xs cursor-help">
                      {sub.notes}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="whitespace-pre-wrap">{sub.notes}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>

        {/* Unsuccessful reason */}
        {outcome === "Unsuccessful" && reason && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/30">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-rose-700 dark:text-rose-400 font-medium">
                  <XCircle className="h-3 w-3" />
                  Unsuccessful reason
                </div>
                <p
                  className={cn(
                    "mt-1 text-sm text-foreground whitespace-pre-wrap",
                    !showReason && "line-clamp-2"
                  )}
                >
                  {reason}
                </p>
              </div>
              {reason.length > 100 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 h-7 text-xs"
                  onClick={() => setShowReason((v) => !v)}
                >
                  {showReason ? "Show less" : "Show more"}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onSetOutcome(tender)}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Set Outcome
          </Button>
          <Button variant="outline" size="sm" onClick={() => onEdit(tender)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit Submission
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
  valueClass,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 truncate text-sm font-medium text-foreground",
          valueClass
        )}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

// ---- Edit Submission Dialog ----
interface EditSubmissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tender: TenderWithSubmission | null;
  onSaved: () => void;
}

function EditSubmissionDialog({
  open,
  onOpenChange,
  tender,
  onSaved,
}: EditSubmissionDialogProps) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [method, setMethod] = useState("");
  const [submittedBy, setSubmittedBy] = useState("");
  const [confirmationRef, setConfirmationRef] = useState("");
  const [finalPricing, setFinalPricing] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Pre-fill when tender changes
  useEffect(() => {
    if (!tender) return;
    const sub = tender.submission;
    setDate(sub?.submission_date || "");
    setTime(sub?.submission_time || "");
    setMethod(sub?.submission_method || "");
    setSubmittedBy(sub?.submitted_by || tender.person_responsible || "");
    setConfirmationRef(sub?.confirmation_reference || "");
    setFinalPricing(
      sub?.final_pricing != null ? String(sub.final_pricing) : ""
    );
    setNotes(sub?.notes || "");
  }, [tender]);

  const handleSave = async () => {
    if (!tender) return;
    setSaving(true);
    try {
      await api.saveSubmission(tender.id, {
        tender_id: tender.id,
        submission_date: date || undefined,
        submission_time: time || undefined,
        submission_method: method || undefined,
        submitted_by: submittedBy.trim() || undefined,
        confirmation_reference: confirmationRef.trim() || undefined,
        final_pricing: finalPricing ? parseFloat(finalPricing) : undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Submission saved");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to save submission");
    } finally {
      setSaving(false);
    }
  };

  if (!tender) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Edit Submission
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs font-semibold text-primary">
              {tender.reference_number}
            </span>{" "}
            — {tender.title}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="sub-date">Submission date</Label>
            <Input
              id="sub-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sub-time">Submission time</Label>
            <Input
              id="sub-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sub-method">Submission method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="sub-method" className="w-full">
                <SelectValue placeholder="Select method…" />
              </SelectTrigger>
              <SelectContent>
                {SUBMISSION_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sub-by">Submitted by</Label>
            <Input
              id="sub-by"
              value={submittedBy}
              onChange={(e) => setSubmittedBy(e.target.value)}
              placeholder="Person who submitted"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sub-ref">Confirmation reference</Label>
            <Input
              id="sub-ref"
              value={confirmationRef}
              onChange={(e) => setConfirmationRef(e.target.value)}
              placeholder="Reference / receipt number"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sub-price">Final pricing (ZAR)</Label>
            <Input
              id="sub-price"
              type="number"
              min={0}
              step="any"
              value={finalPricing}
              onChange={(e) => setFinalPricing(e.target.value)}
              placeholder="0"
              className="tabular-nums"
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="sub-notes">
              Notes{" "}
              <span className="text-xs text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Textarea
              id="sub-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any submission-related notes…"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save submission
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Set Outcome Dialog ----
interface OutcomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tender: TenderWithSubmission | null;
  onSaved: () => void;
}

function OutcomeDialog({
  open,
  onOpenChange,
  tender,
  onSaved,
}: OutcomeDialogProps) {
  const [outcome, setOutcome] = useState<string>("Pending");
  const [reason, setReason] = useState("");
  const [awardNote, setAwardNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tender) return;
    setOutcome(normalizeOutcome(tender.outcome));
    setReason(tender.unsuccessful_reason || "");
    setAwardNote("");
  }, [tender]);

  const handleSave = async () => {
    if (!tender) return;
    if (outcome === "Unsuccessful" && !reason.trim()) {
      toast.error("Please provide a reason for the unsuccessful outcome");
      return;
    }
    setSaving(true);
    try {
      // For Awarded, store award value note appended to existing tender notes via patch is not possible;
      // we just save the outcome. Award note is captured here but the backend TenderUpdate
      // does not expose a dedicated award_value field, so we keep it local for confirmation.
      await api.updateTender(tender.id, {
        outcome,
        unsuccessful_reason:
          outcome === "Unsuccessful" ? reason.trim() : null,
      });
      toast.success(`Outcome updated to ${outcome}`);
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to update outcome");
    } finally {
      setSaving(false);
    }
  };

  if (!tender) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Set Outcome
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs font-semibold text-primary">
              {tender.reference_number}
            </span>{" "}
            — {tender.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Current outcome display */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
            <span className="text-xs text-muted-foreground">Current outcome</span>
            <Badge className={cn("gap-1", outcomeBadgeClass(tender.outcome))}>
              <OutcomeIconRender
                outcome={tender.outcome}
                className="h-3 w-3"
              />
              {normalizeOutcome(tender.outcome)}
            </Badge>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="outcome-select">New outcome</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger id="outcome-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {outcome === "Unsuccessful" && (
            <div className="grid gap-2">
              <Label htmlFor="reason">
                Reason{" "}
                <span className="text-xs text-rose-600 font-normal">
                  (required)
                </span>
              </Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why was this tender unsuccessful? (e.g. Priced too high, missing compliance docs…)"
                rows={3}
                className="border-rose-300 focus-visible:ring-rose-500/30 dark:border-rose-900"
              />
            </div>
          )}

          {outcome === "Awarded" && (
            <div className="grid gap-2">
              <Label htmlFor="award-note">
                Award value / notes{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Textarea
                id="award-note"
                value={awardNote}
                onChange={(e) => setAwardNote(e.target.value)}
                placeholder="Contract value, start date, key contact…"
                rows={3}
              />
              <p className="text-[11px] text-muted-foreground">
                For your records — this note is not stored on the tender.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Update outcome
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Main Component ----
export function SubmissionsTab() {
  const [tenders, setTenders] = useState<TenderWithSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("All");
  const [editTender, setEditTender] = useState<TenderWithSubmission | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [outcomeTender, setOutcomeTender] = useState<TenderWithSubmission | null>(
    null
  );
  const [outcomeOpen, setOutcomeOpen] = useState(false);

  const fetchTenders = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.listTenders({ sort: "updated_at", order: "desc" });
      const all = (res.items || []) as TenderWithSubmission[];
      // Filter client-side: include any tender that has a submission record OR
      // is in a submitted/awarded/unsuccessful/withdrawn state OR has a non-pending outcome.
      const tracked = all.filter(isSubmissionTracked);
      setTenders(tracked);
    } catch (e: any) {
      setError(e?.message || "Failed to load submissions");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTenders();
  }, [fetchTenders]);

  // Client-side filtering by search + outcome
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenders.filter((t) => {
      const o = normalizeOutcome(t.outcome);
      if (outcomeFilter !== "All" && o !== outcomeFilter) return false;
      if (!q) return true;
      return (
        t.reference_number.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        (t.client_company || "").toLowerCase().includes(q) ||
        (t.submission?.submitted_by || "").toLowerCase().includes(q) ||
        (t.submission?.confirmation_reference || "")
          .toLowerCase()
          .includes(q)
      );
    });
  }, [tenders, search, outcomeFilter]);

  // Stats computed from full tracked list
  const stats = useMemo(() => {
    let pending = 0,
      awarded = 0,
      unsuccessful = 0,
      withdrawn = 0;
    for (const t of tenders) {
      const o = normalizeOutcome(t.outcome);
      if (o === "Awarded") awarded++;
      else if (o === "Unsuccessful") unsuccessful++;
      else if (o === "Withdrawn") withdrawn++;
      else pending++;
    }
    return { total: tenders.length, pending, awarded, unsuccessful, withdrawn };
  }, [tenders]);

  const openTender = (id: number) => {
    useDashboardStore.getState().setTab("tenders");
    setTimeout(() => useDashboardStore.getState().selectTender(id), 50);
  };

  const handleEdit = (t: TenderWithSubmission) => {
    setEditTender(t);
    setEditOpen(true);
  };

  const handleSetOutcome = (t: TenderWithSubmission) => {
    setOutcomeTender(t);
    setOutcomeOpen(true);
  };

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-7 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-11 w-11 rounded-xl" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
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
            Submission Tracking
          </h1>
          <p className="text-sm text-muted-foreground">
            Record and track submitted tenders
          </p>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn&apos;t load submissions</AlertTitle>
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
            Submission Tracking
          </h1>
          <p className="text-sm text-muted-foreground">
            Record and track submitted tenders
          </p>
        </div>
        <Button variant="ghost" onClick={() => fetchTenders(true)} disabled={refreshing}>
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* ---- Stats row ---- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={FileStack}
          iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
          value={stats.total}
          label="Total Submitted"
          sublabel="All tracked tenders"
        />
        <StatCard
          icon={Hourglass}
          iconClass="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
          value={stats.pending}
          label="Pending Outcome"
          sublabel="Awaiting result"
        />
        <StatCard
          icon={Trophy}
          iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
          value={stats.awarded}
          label="Awarded"
          sublabel="Wins"
        />
        <StatCard
          icon={XCircle}
          iconClass="bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
          value={stats.unsuccessful}
          label="Unsuccessful"
          sublabel="Losses"
        />
      </div>

      {/* ---- Filters ---- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ref, title, client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">
            Filter:
          </Label>
          <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All outcomes</SelectItem>
              {TENDER_OUTCOMES.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ---- Submissions list ---- */}
      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent>
            {tenders.length === 0 ? (
              <EmptyState
                icon={Send}
                message="No submissions recorded yet"
                hint="Open a tender and record a submission to start tracking outcomes here."
              />
            ) : (
              <EmptyState
                icon={Search}
                message="No submissions match your filters"
                hint="Try adjusting your search or outcome filter."
                iconClass="bg-muted text-muted-foreground"
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground">{filtered.length}</span>{" "}
              of{" "}
              <span className="font-medium text-foreground">{tenders.length}</span>{" "}
              submission{tenders.length === 1 ? "" : "s"}
            </p>
          </div>
          {filtered.map((t) => (
            <SubmissionCard
              key={t.id}
              tender={t}
              onOpenTender={openTender}
              onEdit={handleEdit}
              onSetOutcome={handleSetOutcome}
            />
          ))}
        </div>
      )}

      {/* ---- Dialogs ---- */}
      <EditSubmissionDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        tender={editTender}
        onSaved={() => fetchTenders(true)}
      />
      <OutcomeDialog
        open={outcomeOpen}
        onOpenChange={setOutcomeOpen}
        tender={outcomeTender}
        onSaved={() => fetchTenders(true)}
      />
    </div>
  );
}
