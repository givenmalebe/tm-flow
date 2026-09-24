"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MapPin,
  CalendarPlus,
  CalendarDays,
  Clock,
  User2,
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  CalendarClock,
  UserCheck,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ListChecks,
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  formatDate,
  daysUntil,
} from "@/lib/dashboard-store";
import { cn } from "@/lib/utils";

// ---- Types ----
type BriefingType = "Briefing" | "Site Inspection";

interface Briefing {
  id: number;
  tender_id: number;
  tender_reference: string | null;
  tender_title: string | null;
  client: string | null;
  briefing_type: BriefingType;
  date: string | null;
  time: string | null;
  location: string | null;
  contact_person: string | null;
  attendance_required: boolean;
  attendance_confirmed: boolean;
  person_attending: string | null;
  notes: string | null;
}

interface TenderOption {
  id: number;
  reference_number: string;
  title: string;
}

interface BriefingForm {
  tender_id: string;
  briefing_type: BriefingType;
  date: string;
  time: string;
  location: string;
  contact_person: string;
  attendance_required: boolean;
  attendance_confirmed: boolean;
  person_attending: string;
  notes: string;
}

const EMPTY_FORM: BriefingForm = {
  tender_id: "",
  briefing_type: "Briefing",
  date: "",
  time: "",
  location: "",
  contact_person: "",
  attendance_required: true,
  attendance_confirmed: false,
  person_attending: "",
  notes: "",
};

const BRIEFING_TYPES: BriefingType[] = ["Briefing", "Site Inspection"];

// ---- Helpers ----
function typeBadgeClass(type: BriefingType): string {
  return type === "Briefing"
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
    : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900";
}

function dateHeading(iso: string): { label: string; relative: string | null; diff: number } {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { label: formatDate(iso), relative: null, diff: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  const label = d.toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  let relative: string | null = null;
  if (diff === 0) relative = "Today";
  else if (diff === 1) relative = "Tomorrow";
  else if (diff === -1) relative = "Yesterday";
  else if (diff > 1 && diff <= 7) relative = `In ${diff} days`;
  else if (diff < 0) relative = `${Math.abs(diff)}d ago`;
  return { label, relative, diff };
}

function relativeBadgeClass(diff: number): string {
  if (diff < 0)
    return "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-900";
  if (diff <= 1)
    return "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-900";
  if (diff <= 3)
    return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900";
}

// ---- Stat card ----
interface StatCardProps {
  icon: LucideIcon;
  iconClass: string;
  value: number;
  label: string;
  subtitle: string;
}

function StatCard({ icon: Icon, iconClass, value, label, subtitle }: StatCardProps) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
            {value}
          </div>
          <div className="mt-1 text-sm font-medium text-foreground">{label}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
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
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
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

// ---- Briefing card ----
interface BriefingCardProps {
  briefing: Briefing;
  onEdit: (b: Briefing) => void;
  onDelete: (b: Briefing) => void;
  onOpenTender: (id: number) => void;
}

function BriefingCard({ briefing, onEdit, onDelete, onOpenTender }: BriefingCardProps) {
  const [notesExpanded, setNotesExpanded] = useState(false);
  const b = briefing;
  const days = daysUntil(b.date);
  const needsConfirmation =
    b.attendance_required &&
    !b.attendance_confirmed &&
    days !== null &&
    days >= 0 &&
    days <= 7;
  const hasLongNotes = (b.notes?.length || 0) > 120;

  return (
    <Card
      className={cn(
        "flex flex-col transition-shadow hover:shadow-md",
        needsConfirmation && "border-amber-300 dark:border-amber-800"
      )}
    >
      {needsConfirmation && (
        <div className="flex items-center gap-2 rounded-t-lg bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Attendance confirmation required!
        </div>
      )}
      <CardContent className="flex flex-1 flex-col gap-3">
        {/* Header: tender + type */}
        <div className="flex items-start justify-between gap-2">
          <button
            onClick={() => onOpenTender(b.tender_id)}
            className="group flex min-w-0 items-start gap-2 text-left"
            title="Open tender"
          >
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-semibold text-primary group-hover:underline">
                  {b.tender_reference || "—"}
                </span>
                <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div
                className="line-clamp-2 text-sm font-semibold text-foreground group-hover:underline"
                title={b.tender_title || ""}
              >
                {b.tender_title || "Untitled tender"}
              </div>
            </div>
          </button>
          <Badge
            variant="outline"
            className={cn("shrink-0 border", typeBadgeClass(b.briefing_type))}
          >
            {b.briefing_type}
          </Badge>
        </div>

        {/* Client */}
        {b.client && (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{b.client}</span>
          </div>
        )}

        {/* Details grid */}
        <div className="grid grid-cols-1 gap-2 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Date:</span>
            <span className="font-medium text-foreground tabular-nums">
              {formatDate(b.date)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Time:</span>
            <span className="font-medium text-foreground tabular-nums">
              {b.time || "—"}
            </span>
          </div>
          {b.location && (
            <div className="flex items-center gap-2 sm:col-span-2">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">Location:</span>
              <span className="truncate font-medium text-foreground">{b.location}</span>
            </div>
          )}
          {b.contact_person && (
            <div className="flex items-center gap-2">
              <User2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">Contact:</span>
              <span className="truncate font-medium text-foreground">{b.contact_person}</span>
            </div>
          )}
          {b.person_attending && (
            <div className="flex items-center gap-2">
              <UserCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">Attending:</span>
              <span className="truncate font-medium text-foreground">{b.person_attending}</span>
            </div>
          )}
        </div>

        {/* Attendance badges */}
        <div className="flex flex-wrap items-center gap-2">
          {b.attendance_required ? (
            <Badge
              variant="outline"
              className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
            >
              <UserCheck className="h-3 w-3" />
              Attendance required
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              Optional
            </Badge>
          )}
          {b.attendance_confirmed ? (
            <Badge
              variant="outline"
              className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
            >
              <CheckCircle2 className="h-3 w-3" />
              Confirmed
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-muted text-muted-foreground"
            >
              <XCircle className="h-3 w-3" />
              Unconfirmed
            </Badge>
          )}
        </div>

        {/* Notes */}
        {b.notes && (
          <div className="text-xs">
            <p
              className={cn(
                "text-muted-foreground whitespace-pre-wrap",
                !notesExpanded && hasLongNotes && "line-clamp-2"
              )}
            >
              {b.notes}
            </p>
            {hasLongNotes && (
              <button
                onClick={() => setNotesExpanded((v) => !v)}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                {notesExpanded ? (
                  <>
                    Show less
                    <ChevronUp className="h-3 w-3" />
                  </>
                ) : (
                  <>
                    Show more
                    <ChevronDown className="h-3 w-3" />
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto flex items-center justify-end gap-1 border-t pt-3">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            onClick={() => onEdit(b)}
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="sr-only">Edit</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950"
            onClick={() => onDelete(b)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Briefing dialog (create / edit) ----
interface BriefingDialogProps {
  open: boolean;
  editing: Briefing | null;
  tenders: TenderOption[];
  tendersLoading: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function BriefingDialog({
  open,
  editing,
  tenders,
  tendersLoading,
  onClose,
  onSaved,
}: BriefingDialogProps) {
  const [form, setForm] = useState<BriefingForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const isEdit = editing !== null;

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          tender_id: String(editing.tender_id),
          briefing_type: editing.briefing_type || "Briefing",
          date: editing.date || "",
          time: editing.time || "",
          location: editing.location || "",
          contact_person: editing.contact_person || "",
          attendance_required: editing.attendance_required,
          attendance_confirmed: editing.attendance_confirmed,
          person_attending: editing.person_attending || "",
          notes: editing.notes || "",
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [open, editing]);

  const update = <K extends keyof BriefingForm>(key: K, value: BriefingForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canSave =
    form.date.length > 0 && (isEdit || form.tender_id.length > 0);

  const handleSave = async () => {
    if (!form.date) {
      toast.error("Date is required");
      return;
    }
    if (!isEdit && !form.tender_id) {
      toast.error("Please select a tender");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        briefing_type: form.briefing_type,
        date: form.date,
        time: form.time || null,
        location: form.location || null,
        contact_person: form.contact_person || null,
        attendance_required: form.attendance_required,
        attendance_confirmed: form.attendance_confirmed,
        person_attending: form.person_attending || null,
        notes: form.notes || null,
      };
      if (isEdit && editing) {
        await api.updateBriefing(editing.id, payload);
        toast.success("Briefing updated");
      } else {
        const tenderId = Number(form.tender_id);
        await api.createBriefing(tenderId, { ...payload, tender_id: tenderId });
        toast.success("Briefing added");
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save briefing");
    } finally {
      setSaving(false);
    }
  };

  const selectedTender = tenders.find((t) => String(t.id) === form.tender_id);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? (
              <>
                <Pencil className="h-4 w-4 text-primary" />
                Edit Briefing
              </>
            ) : (
              <>
                <CalendarPlus className="h-4 w-4 text-primary" />
                Add Briefing
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the briefing or site inspection details."
              : "Schedule a compulsory briefing or site inspection for a tender."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Tender selector */}
          <div className="grid gap-2">
            <Label htmlFor="b-tender">
              Tender <span className="text-rose-500">*</span>
            </Label>
            {isEdit ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-muted-foreground">
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {editing?.tender_reference}
                  </span>{" "}
                  — {editing?.tender_title}
                </span>
              </div>
            ) : tendersLoading ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading tenders…
              </div>
            ) : tenders.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                No tenders available. Create a tender first before scheduling a briefing.
              </div>
            ) : (
              <Select
                value={form.tender_id}
                onValueChange={(v) => update("tender_id", v)}
              >
                <SelectTrigger id="b-tender" className="w-full">
                  <SelectValue placeholder="Select a tender" />
                </SelectTrigger>
                <SelectContent>
                  {tenders.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      <span className="font-mono text-xs">{t.reference_number}</span>
                      {" — "}
                      <span className="truncate">{t.title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedTender && !isEdit && (
              <p className="text-[11px] text-muted-foreground truncate">
                {selectedTender.title}
              </p>
            )}
          </div>

          {/* Type + Date + Time */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="b-type">Type</Label>
              <Select
                value={form.briefing_type}
                onValueChange={(v) => update("briefing_type", v as BriefingType)}
              >
                <SelectTrigger id="b-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRIEFING_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b-date">
                Date <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="b-date"
                type="date"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b-time">Time</Label>
              <Input
                id="b-time"
                type="time"
                value={form.time}
                onChange={(e) => update("time", e.target.value)}
              />
            </div>
          </div>

          {/* Location + Contact */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="b-location">Location</Label>
              <Input
                id="b-location"
                value={form.location}
                onChange={(e) => update("location", e.target.value)}
                placeholder="e.g. Client head office, Boardroom A"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b-contact">Contact person</Label>
              <Input
                id="b-contact"
                value={form.contact_person}
                onChange={(e) => update("contact_person", e.target.value)}
                placeholder="e.g. Jane Doe — 011 555 0100"
              />
            </div>
          </div>

          {/* Person attending */}
          <div className="grid gap-2">
            <Label htmlFor="b-attending">Person attending</Label>
            <Input
              id="b-attending"
              value={form.person_attending}
              onChange={(e) => update("person_attending", e.target.value)}
              placeholder="Who will attend from your side"
            />
          </div>

          {/* Attendance switches */}
          <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor="b-required" className="cursor-pointer">
                  Attendance required
                </Label>
                <p className="text-[11px] text-muted-foreground">Is attendance compulsory?</p>
              </div>
              <Switch
                id="b-required"
                checked={form.attendance_required}
                onCheckedChange={(v) => update("attendance_required", v)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor="b-confirmed" className="cursor-pointer">
                  Attendance confirmed
                </Label>
                <p className="text-[11px] text-muted-foreground">Have you confirmed?</p>
              </div>
              <Switch
                id="b-confirmed"
                checked={form.attendance_confirmed}
                onCheckedChange={(v) => update("attendance_confirmed", v)}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="grid gap-2">
            <Label htmlFor="b-notes">Notes</Label>
            <Textarea
              id="b-notes"
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Parking, security clearance, documents to bring, etc."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !canSave || (!isEdit && tenders.length === 0)}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Add briefing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Delete confirmation ----
interface DeleteDialogProps {
  open: boolean;
  briefing: Briefing | null;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
}

function DeleteDialog({ open, briefing, onClose, onConfirm, deleting }: DeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
            Delete briefing
          </AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this{" "}
            <span className="font-semibold text-foreground">
              {briefing?.briefing_type.toLowerCase()}
            </span>{" "}
            on{" "}
            <span className="font-semibold text-foreground">
              {formatDate(briefing?.date)}
            </span>
            ? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={deleting}
            className="bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600/30"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---- Main Component ----
export function BriefingsTab() {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [tenders, setTenders] = useState<TenderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [tendersLoading, setTendersLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<"all" | "upcoming">("all");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBriefing, setEditingBriefing] = useState<Briefing | null>(null);

  const [deleteBriefing, setDeleteBriefing] = useState<Briefing | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchBriefings = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.listBriefings(false, 30);
      setBriefings((res.items as Briefing[]) || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load briefings");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchTenders = useCallback(async () => {
    setTendersLoading(true);
    try {
      const res = await api.listTenders();
      setTenders(
        (res.items || []).map((t: any) => ({
          id: t.id,
          reference_number: t.reference_number,
          title: t.title,
        }))
      );
    } catch {
      // silent — dialog will show empty state
    } finally {
      setTendersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBriefings();
  }, [fetchBriefings]);

  const openTender = (id: number) => {
    useDashboardStore.getState().setTab("tenders");
    setTimeout(() => useDashboardStore.getState().selectTender(id), 50);
  };

  // ---- Stats (computed from full list) ----
  const stats = useMemo(() => {
    const total = briefings.length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);
    const upcoming = briefings.filter((b) => {
      if (!b.date) return false;
      const d = new Date(b.date);
      d.setHours(0, 0, 0, 0);
      return d >= today && d <= in30;
    }).length;
    const unconfirmed = briefings.filter(
      (b) => b.attendance_required && !b.attendance_confirmed
    ).length;
    return { total, upcoming, unconfirmed };
  }, [briefings]);

  // ---- Client-side filtering ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);
    return briefings.filter((b) => {
      if (view === "upcoming") {
        if (!b.date) return false;
        const d = new Date(b.date);
        d.setHours(0, 0, 0, 0);
        if (d < today || d > in30) return false;
      }
      if (q) {
        const hay = `${b.tender_reference || ""} ${b.tender_title || ""} ${b.client || ""} ${b.location || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [briefings, view, search]);

  // ---- Group filtered briefings by date (ascending) ----
  const grouped = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return da - db;
    });
    const map = new Map<string, Briefing[]>();
    for (const b of sorted) {
      const key = b.date || "no-date";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return Array.from(map.entries()).map(([key, items]) => {
      const heading = key !== "no-date" ? dateHeading(key) : null;
      return { key, items, heading };
    });
  }, [filtered]);

  const openNew = () => {
    setEditingBriefing(null);
    fetchTenders();
    setDialogOpen(true);
  };

  const openEdit = (b: Briefing) => {
    setEditingBriefing(b);
    fetchTenders();
    setDialogOpen(true);
  };

  const requestDelete = (b: Briefing) => {
    setDeleteBriefing(b);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteBriefing) return;
    setDeleting(true);
    try {
      await api.deleteBriefing(deleteBriefing.id);
      toast.success("Briefing deleted");
      setDeleteOpen(false);
      setDeleteBriefing(null);
      fetchBriefings(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete briefing");
    } finally {
      setDeleting(false);
    }
  };

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
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
          <h1 className="text-2xl font-bold tracking-tight">Briefings &amp; Site Inspections</h1>
          <p className="text-sm text-muted-foreground">
            Track compulsory briefings and site inspections
          </p>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn&apos;t load your briefings</AlertTitle>
          <AlertDescription>
            <p className="mb-3">{error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchBriefings()}
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Briefings &amp; Site Inspections</h1>
          <p className="text-sm text-muted-foreground">
            Track compulsory briefings and site inspections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => fetchBriefings(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button onClick={openNew}>
            <CalendarPlus className="h-4 w-4" />
            Add Briefing
          </Button>
        </div>
      </div>

      {/* ---- Stats row ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={ListChecks}
          iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
          value={stats.total}
          label="Total Briefings"
          subtitle="All scheduled"
        />
        <StatCard
          icon={CalendarClock}
          iconClass="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
          value={stats.upcoming}
          label="Upcoming"
          subtitle="Next 30 days"
        />
        <StatCard
          icon={AlertTriangle}
          iconClass="bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
          value={stats.unconfirmed}
          label="Unconfirmed"
          subtitle="Attendance pending"
        />
      </div>

      {/* ---- Filters ---- */}
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={view} onValueChange={(v) => setView(v as "all" | "upcoming")}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming (30 days)</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by tender ref, title, client…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* ---- Briefings list ---- */}
      {briefings.length === 0 ? (
        <Card className="border-dashed">
          <CardContent>
            <EmptyState
              icon={MapPin}
              title="No briefings scheduled"
              message="Track compulsory briefings and site inspections for your tenders. Add your first briefing to stay on top of attendance requirements."
              iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
              action={
                <Button onClick={openNew} className="mt-1">
                  <CalendarPlus className="h-4 w-4" />
                  Add your first briefing
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
              message={
                view === "upcoming"
                  ? "No briefings in the next 30 days. Switch to 'All' to see past briefings."
                  : "No briefings match your search. Try a different reference or clear the filter."
              }
              iconClass="bg-muted text-muted-foreground"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ key, items, heading }) => (
            <div key={key} className="space-y-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">
                  {heading ? heading.label : "No date"}
                </h2>
                {heading?.relative && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "border px-1.5 py-0 text-[10px] tabular-nums",
                      relativeBadgeClass(heading.diff)
                    )}
                  >
                    {heading.relative}
                  </Badge>
                )}
                <Badge variant="outline" className="px-1.5 py-0 text-[10px] tabular-nums">
                  {items.length} {items.length === 1 ? "item" : "items"}
                </Badge>
                <div className="ml-2 h-px flex-1 bg-border" />
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {items.map((b) => (
                  <BriefingCard
                    key={b.id}
                    briefing={b}
                    onEdit={openEdit}
                    onDelete={requestDelete}
                    onOpenTender={openTender}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- Dialogs ---- */}
      <BriefingDialog
        open={dialogOpen}
        editing={editingBriefing}
        tenders={tenders}
        tendersLoading={tendersLoading}
        onClose={() => setDialogOpen(false)}
        onSaved={() => fetchBriefings(true)}
      />
      <DeleteDialog
        open={deleteOpen}
        briefing={deleteBriefing}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteBriefing(null);
        }}
        onConfirm={confirmDelete}
        deleting={deleting}
      />
    </div>
  );
}
