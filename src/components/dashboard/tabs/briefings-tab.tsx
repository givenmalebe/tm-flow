"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  Building2,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Hourglass,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  Search,
  Timer,
  Trash2,
  Upload,
  User,
  UserCheck,
  Zap,
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

// =====================================================================
// Types
// =====================================================================
type BriefingType = "Briefing" | "Site Inspection";
type Urgency = "today" | "critical" | "urgent" | "soon" | "normal" | "past";

/** A briefing with computed urgency info — used everywhere in this tab. */
interface BriefingAlert {
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
  certificate_path: string | null;
  certificate_url: string | null;
  notes: string | null;
  days_until: number;
  is_past: boolean;
  is_today: boolean;
  urgency: Urgency;
}

interface BriefingSummary {
  total_upcoming: number;
  total_alerts: number;
  today_count: number;
  critical_count: number;
  urgent_count: number;
  soon_count: number;
  unconfirmed_count: number;
  no_attendee_count: number;
  total_all?: number;
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

// =====================================================================
// Helpers
// =====================================================================
function computeUrgency(days: number): Urgency {
  if (days < 0) return "past";
  if (days === 0) return "today";
  if (days <= 1) return "critical";
  if (days <= 3) return "urgent";
  if (days <= 7) return "soon";
  return "normal";
}

/** Normalize a raw briefing (from listBriefings) into a BriefingAlert. */
function toBriefingView(b: any): BriefingAlert {
  const days = b.days_until ?? daysUntil(b.date) ?? -999;
  return {
    id: b.id,
    tender_id: b.tender_id,
    tender_reference: b.tender_reference ?? null,
    tender_title: b.tender_title ?? null,
    client: b.client ?? null,
    briefing_type: b.briefing_type as BriefingType,
    date: b.date ?? null,
    time: b.time ?? null,
    location: b.location ?? null,
    contact_person: b.contact_person ?? null,
    attendance_required: !!b.attendance_required,
    attendance_confirmed: !!b.attendance_confirmed,
    person_attending: b.person_attending ?? null,
    certificate_path: b.certificate_path ?? null,
    certificate_url: b.certificate_url ?? null,
    notes: b.notes ?? null,
    days_until: days,
    is_past: days < 0,
    is_today: days === 0,
    urgency: (b.urgency as Urgency) ?? computeUrgency(days),
  };
}

const URGENCY_CONFIG: Record<
  Urgency,
  {
    label: string;
    strip: string;
    badge: string;
    border: string;
    todayBg: string;
    text: string;
    icon: LucideIcon;
  }
> = {
  today: {
    label: "TODAY",
    strip: "bg-rose-600 text-white",
    badge: "bg-rose-600 text-white border-rose-700",
    border: "border-rose-300 dark:border-rose-800",
    todayBg: "bg-rose-50 dark:bg-rose-950/20",
    text: "text-rose-700 dark:text-rose-400",
    icon: BellRing,
  },
  critical: {
    label: "CRITICAL",
    strip: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-900",
    border: "border-rose-300 dark:border-rose-800",
    todayBg: "",
    text: "text-rose-700 dark:text-rose-400",
    icon: Zap,
  },
  urgent: {
    label: "URGENT",
    strip: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900",
    border: "border-amber-300 dark:border-amber-800",
    todayBg: "",
    text: "text-amber-700 dark:text-amber-400",
    icon: Timer,
  },
  soon: {
    label: "SOON",
    strip: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
    badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300 border-yellow-200 dark:border-yellow-900",
    border: "border-yellow-300 dark:border-yellow-800",
    todayBg: "",
    text: "text-yellow-700 dark:text-yellow-500",
    icon: Hourglass,
  },
  normal: {
    label: "Upcoming",
    strip: "",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
    border: "border-border",
    todayBg: "",
    text: "text-emerald-700 dark:text-emerald-400",
    icon: Calendar,
  },
  past: {
    label: "Completed",
    strip: "",
    badge: "bg-muted text-muted-foreground",
    border: "border-border",
    todayBg: "",
    text: "text-muted-foreground",
    icon: CheckCircle2,
  },
};

function typeBadgeClass(type: BriefingType): string {
  return type === "Briefing"
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
    : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900";
}

// =====================================================================
// Stat card
// =====================================================================
function StatCard({
  icon: Icon,
  iconClass,
  value,
  label,
  subtitle,
}: {
  icon: LucideIcon;
  iconClass: string;
  value: number;
  label: string;
  subtitle: string;
}) {
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

// =====================================================================
// Empty state
// =====================================================================
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
          iconClass ||
            "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
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

// =====================================================================
// Briefing card — shows all 11 fields + urgency strip + alert strips + certificate
// =====================================================================
interface BriefingCardProps {
  briefing: BriefingAlert;
  onEdit: (b: BriefingAlert) => void;
  onDelete: (b: BriefingAlert) => void;
  onOpenTender: (id: number) => void;
  onConfirmAttendance: (b: BriefingAlert) => void;
  onUploadCertificate: (b: BriefingAlert, file: File) => void;
  onRemoveCertificate: (b: BriefingAlert) => void;
  uploadingId: number | null;
  removingCertId: number | null;
}

function BriefingCard({
  briefing,
  onEdit,
  onDelete,
  onOpenTender,
  onConfirmAttendance,
  onUploadCertificate,
  onRemoveCertificate,
  uploadingId,
  removingCertId,
}: BriefingCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const b = briefing;
  const config = URGENCY_CONFIG[b.urgency];
  const UrgencyIcon = config.icon;
  const isPast = b.is_past;
  const showStrip = b.urgency === "today" || b.urgency === "critical" || b.urgency === "urgent" || b.urgency === "soon";
  const needsConfirmation =
    b.attendance_required &&
    !b.attendance_confirmed &&
    !isPast &&
    b.days_until >= 0 &&
    b.days_until <= 7;
  const noAttendee = b.attendance_required && !b.person_attending && !isPast;
  const isUploading = uploadingId === b.id;
  const isRemoving = removingCertId === b.id;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onUploadCertificate(b, f);
    e.target.value = "";
  };

  const countdownLabel =
    b.days_until === 0
      ? "Today"
      : b.days_until === 1
      ? "1 day left"
      : b.days_until > 0
      ? `${b.days_until} days left`
      : `${Math.abs(b.days_until)}d ago`;

  return (
    <Card
      className={cn(
        "flex flex-col transition-shadow hover:shadow-md overflow-hidden",
        config.border,
        b.urgency === "today" && "border-2",
        isPast && "opacity-70"
      )}
    >
      {/* Urgency strip */}
      {showStrip && (
        <div
          className={cn(
            "flex items-center gap-2 px-4 py-1.5 text-xs font-semibold",
            config.strip
          )}
        >
          <UrgencyIcon className="h-3.5 w-3.5" />
          <span>{config.label}</span>
          <span className="ml-auto tabular-nums">{countdownLabel}</span>
        </div>
      )}
      {isPast && (
        <div className="flex items-center gap-2 bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Completed / Past</span>
        </div>
      )}

      <CardContent className="flex flex-1 flex-col gap-3 pt-4">
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
          <div className="flex items-center gap-1.5 text-xs">
            <Building2 className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium text-foreground">{b.client}</span>
          </div>
        )}

        {/* Details grid — Date, Time, Location, Contact */}
        <div className="grid grid-cols-1 gap-2 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Date:</span>
            <span
              className={cn(
                "font-medium tabular-nums",
                !isPast && config.text
              )}
            >
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
          <div className="flex items-center gap-2 sm:col-span-2">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Location:</span>
            <span className="truncate font-medium text-foreground">
              {b.location || "—"}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Contact:</span>
            <span className="truncate font-medium text-foreground">
              {b.contact_person || "—"}
            </span>
          </div>
        </div>

        {/* Attendance badges: required + confirmed */}
        <div className="flex flex-wrap items-center gap-2">
          {b.attendance_required ? (
            <Badge
              variant="outline"
              className="bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-900"
            >
              <UserCheck className="h-3 w-3" />
              Compulsory
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
              className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900"
            >
              <Clock className="h-3 w-3" />
              Not confirmed
            </Badge>
          )}
        </div>

        {/* Person attending */}
        <div className="flex items-center gap-2 text-xs">
          <UserCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Person attending:</span>
          {b.person_attending ? (
            <span className="font-medium text-foreground">{b.person_attending}</span>
          ) : b.attendance_required ? (
            <span className="font-medium text-amber-700 dark:text-amber-400">
              Not assigned
            </span>
          ) : (
            <span className="font-medium text-muted-foreground">—</span>
          )}
        </div>

        {/* Alert strips */}
        {(needsConfirmation || noAttendee) && (
          <div className="space-y-1.5">
            {needsConfirmation && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Attendance confirmation required — briefing is within{" "}
                  <span className="font-bold">
                    {b.days_until === 0
                      ? "today"
                      : `${b.days_until} day${b.days_until === 1 ? "" : "s"}`}
                    !
                  </span>
                </span>
              </div>
            )}
            {noAttendee && (
              <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>No person assigned to attend this compulsory briefing.</span>
              </div>
            )}
          </div>
        )}

        {/* Certificate section */}
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="mb-2 flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">
              Attendance Certificate
            </span>
          </div>
          {b.certificate_url ? (
            <div className="flex items-center gap-2">
              <a
                href={b.certificate_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View Certificate
              </a>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950"
                onClick={() => onRemoveCertificate(b)}
                disabled={isRemoving}
              >
                {isRemoving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Remove
              </Button>
            </div>
          ) : (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.png"
                className="hidden"
                onChange={handleFile}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-full justify-start text-xs"
                onClick={() => fileRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" />
                    Upload certificate
                  </>
                )}
              </Button>
              <p className="mt-1 text-[10px] text-muted-foreground">
                PDF, DOC, DOCX, JPG or PNG. Upload auto-marks attendance as
                confirmed.
              </p>
            </>
          )}
        </div>

        {/* Notes */}
        {b.notes && (
          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
            <p className="mb-1 font-medium text-muted-foreground">Notes</p>
            <p className="whitespace-pre-wrap text-foreground">{b.notes}</p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto flex items-center justify-end gap-1 border-t pt-3">
          {needsConfirmation && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 mr-auto border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
              onClick={() => onConfirmAttendance(b)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Confirm attendance
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2"
            onClick={() => onEdit(b)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950"
            onClick={() => onDelete(b)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// Briefing dialog (create / edit)
// =====================================================================
interface BriefingDialogProps {
  open: boolean;
  editing: BriefingAlert | null;
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
        await api.createBriefing(tenderId, payload);
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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
          {/* Tender selector — disabled in edit mode */}
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
                No tenders available. Create a tender first before scheduling a
                briefing.
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
                      <span className="font-mono text-xs">
                        {t.reference_number}
                      </span>
                      {" — "}
                      <span className="truncate">{t.title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Type + Date + Time */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="b-type">
                Type <span className="text-rose-500">*</span>
              </Label>
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
                <p className="text-[11px] text-muted-foreground">
                  Is attendance compulsory?
                </p>
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
                <p className="text-[11px] text-muted-foreground">
                  Have you confirmed?
                </p>
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

// =====================================================================
// Delete confirmation
// =====================================================================
function DeleteDialog({
  open,
  briefing,
  onClose,
  onConfirm,
  deleting,
}: {
  open: boolean;
  briefing: BriefingAlert | null;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
}) {
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

// =====================================================================
// Main component
// =====================================================================
export function BriefingsTab() {
  const [alerts, setAlerts] = useState<BriefingAlert[]>([]);
  const [upcoming, setUpcoming] = useState<BriefingAlert[]>([]);
  const [allBriefings, setAllBriefings] = useState<BriefingAlert[]>([]);
  const [summary, setSummary] = useState<BriefingSummary | null>(null);
  const [tenders, setTenders] = useState<TenderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [tendersLoading, setTendersLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<"upcoming" | "all">("upcoming");
  const [typeFilter, setTypeFilter] = useState<"all" | BriefingType>("all");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBriefing, setEditingBriefing] = useState<BriefingAlert | null>(
    null
  );

  const [deleteBriefing, setDeleteBriefing] = useState<BriefingAlert | null>(
    null
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [removingCertId, setRemovingCertId] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [alertsRes, allRes] = await Promise.all([
        api.getBriefingAlerts(),
        api.listBriefings(false, 30),
      ]);
      setAlerts((alertsRes.alerts || []).map(toBriefingView));
      setUpcoming((alertsRes.upcoming || []).map(toBriefingView));
      setSummary(alertsRes.summary as BriefingSummary);
      setAllBriefings((allRes.items || []).map(toBriefingView));
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
    fetchData();
  }, [fetchData]);

  const openTender = (id: number) => {
    useDashboardStore.getState().setTab("tenders");
    setTimeout(() => useDashboardStore.getState().selectTender(id), 50);
  };

  // ---- Filtering ----
  const filtered = useMemo(() => {
    const source = view === "upcoming" ? upcoming : allBriefings;
    const q = search.trim().toLowerCase();
    return source.filter((b) => {
      if (typeFilter !== "all" && b.briefing_type !== typeFilter) return false;
      if (q) {
        const hay =
          `${b.tender_reference || ""} ${b.tender_title || ""} ${b.client || ""} ${b.location || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [view, upcoming, allBriefings, typeFilter, search]);

  // ---- Group by date (ascending) ----
  const grouped = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return da - db;
    });
    const map = new Map<string, BriefingAlert[]>();
    for (const b of sorted) {
      const key = b.date || "no-date";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return Array.from(map.entries()).map(([key, items]) => {
      let label = "No date";
      let relative: string | null = null;
      if (key !== "no-date") {
        label = formatDate(key);
        const d = new Date(key);
        if (!isNaN(d.getTime())) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          d.setHours(0, 0, 0, 0);
          const diff = Math.round(
            (d.getTime() - today.getTime()) / 86400000
          );
          if (diff === 0) relative = "Today";
          else if (diff === 1) relative = "Tomorrow";
          else if (diff === -1) relative = "Yesterday";
          else if (diff > 1 && diff <= 7) relative = `In ${diff} days`;
          else if (diff < 0) relative = `${Math.abs(diff)}d ago`;
        }
      }
      return { key, items, label, relative };
    });
  }, [filtered]);

  // ---- Mutations ----
  const openNew = () => {
    setEditingBriefing(null);
    fetchTenders();
    setDialogOpen(true);
  };

  const openEdit = (b: BriefingAlert) => {
    setEditingBriefing(b);
    fetchTenders();
    setDialogOpen(true);
  };

  const requestDelete = (b: BriefingAlert) => {
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
      fetchData(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete briefing");
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmAttendance = async (b: BriefingAlert) => {
    setConfirmingId(b.id);
    try {
      await api.updateBriefing(b.id, { attendance_confirmed: true });
      toast.success("Attendance confirmed");
      fetchData(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to confirm attendance");
    } finally {
      setConfirmingId(null);
    }
  };

  const handleUploadCertificate = async (b: BriefingAlert, file: File) => {
    setUploadingId(b.id);
    try {
      await api.uploadBriefingCertificate(b.id, file);
      toast.success("Certificate uploaded — attendance marked as confirmed");
      fetchData(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to upload certificate");
    } finally {
      setUploadingId(null);
    }
  };

  const handleRemoveCertificate = async (b: BriefingAlert) => {
    setRemovingCertId(b.id);
    try {
      await api.deleteBriefingCertificate(b.id);
      toast.success("Certificate removed");
      fetchData(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove certificate");
    } finally {
      setRemovingCertId(null);
    }
  };

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
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
            Briefings &amp; Site Inspections
          </h1>
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

  const totalAll = allBriefings.length;
  const hasAlerts = (summary?.total_alerts ?? 0) > 0;
  const hasToday = (summary?.today_count ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* ---- Page header ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarClock className="h-6 w-6 text-primary" />
            Briefings &amp; Site Inspections
          </h1>
          <p className="text-sm text-muted-foreground">
            Track compulsory tender briefings and site inspections
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => fetchData(true)}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* ---- Alerts banner (CRITICAL) ---- */}
      {hasAlerts && (
        <Alert className="border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30">
          <BellRing className="h-5 w-5 text-rose-600 dark:text-rose-400" />
          <AlertTitle className="text-rose-800 dark:text-rose-300">
            {summary!.total_alerts} compulsory briefing
            {summary!.total_alerts === 1 ? "" : "s"} need attention — attendance
            not confirmed or no person assigned
          </AlertTitle>
          <AlertDescription>
            <div className="mt-2 space-y-2">
              {alerts.slice(0, 4).map((b) => (
                <div
                  key={b.id}
                  className="flex flex-col gap-2 rounded-md border border-rose-200 bg-card p-2.5 text-foreground dark:border-rose-900 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-primary">
                        {b.tender_reference || "—"}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "border text-[10px]",
                          b.days_until <= 1
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        )}
                      >
                        {b.days_until === 0
                          ? "Today"
                          : b.days_until === 1
                          ? "1 day"
                          : `${b.days_until} days`}
                      </Badge>
                    </div>
                    <div className="line-clamp-1 text-xs font-medium">
                      {b.tender_title || "Untitled tender"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {formatDate(b.date)}
                      {b.time && ` • ${b.time}`}
                      {!b.attendance_confirmed && " • Not confirmed"}
                      {!b.person_attending && " • No attendee"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-900"
                    onClick={() => handleConfirmAttendance(b)}
                    disabled={confirmingId === b.id}
                  >
                    {confirmingId === b.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Confirm attendance
                  </Button>
                </div>
              ))}
              {alerts.length > 4 && (
                <p className="text-[11px] text-rose-700 dark:text-rose-400">
                  + {alerts.length - 4} more — see below
                </p>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* ---- Today banner (separate) ---- */}
      {hasToday && (
        <Alert className="border-rose-400 bg-rose-100 dark:border-rose-700 dark:bg-rose-900/40">
          <BellRing className="h-5 w-5 text-rose-700 dark:text-rose-300" />
          <AlertTitle className="text-rose-900 dark:text-rose-200">
            {summary!.today_count} briefing{summary!.today_count === 1 ? "" : "s"} happening today!
          </AlertTitle>
          <AlertDescription className="text-rose-800 dark:text-rose-300">
            Check the list below — make sure attendance is confirmed and a person
            is assigned.
          </AlertDescription>
        </Alert>
      )}

      {/* ---- Success banner (when no alerts) ---- */}
      {!hasAlerts && !hasToday && (summary?.total_upcoming ?? 0) > 0 && (
        <Alert className="border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <AlertTitle className="text-emerald-800 dark:text-emerald-300">
            All upcoming briefings are confirmed
          </AlertTitle>
          <AlertDescription className="text-emerald-700 dark:text-emerald-400">
            {summary?.total_upcoming} upcoming briefing
            {summary?.total_upcoming === 1 ? "" : "s"} — all have attendance
            confirmed and a person assigned. Nice work!
          </AlertDescription>
        </Alert>
      )}

      {/* ---- Summary stats row ---- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          icon={CalendarClock}
          iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
          value={summary?.total_upcoming ?? 0}
          label="Upcoming"
          subtitle="Next 30 days"
        />
        <StatCard
          icon={BellRing}
          iconClass="bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
          value={summary?.today_count ?? 0}
          label="Today"
          subtitle="Happening today"
        />
        <StatCard
          icon={Zap}
          iconClass="bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
          value={summary?.critical_count ?? 0}
          label="Critical"
          subtitle="≤ 1 day"
        />
        <StatCard
          icon={Clock}
          iconClass="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
          value={summary?.unconfirmed_count ?? 0}
          label="Unconfirmed"
          subtitle="Attendance pending"
        />
        <StatCard
          icon={User}
          iconClass="bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400"
          value={summary?.no_attendee_count ?? 0}
          label="No Attendee"
          subtitle="No person assigned"
        />
        <StatCard
          icon={Calendar}
          iconClass="bg-primary/10 text-primary"
          value={totalAll}
          label="Total"
          subtitle="All briefings"
        />
      </div>

      {/* ---- Filter bar ---- */}
      <Card>
        <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            value={view}
            onValueChange={(v) => setView(v as "upcoming" | "all")}
          >
            <TabsList>
              <TabsTrigger value="upcoming">Upcoming (30 days)</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as "all" | BriefingType)}
            >
              <SelectTrigger className="h-9 w-full sm:w-44">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="Briefing">Briefings</SelectItem>
                <SelectItem value="Site Inspection">Site Inspections</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search reference, title, client…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={openNew} className="shrink-0">
              <CalendarPlus className="h-4 w-4" />
              Add Briefing
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ---- Briefings list ---- */}
      {allBriefings.length === 0 ? (
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
                  ? "No upcoming briefings in the next 30 days match your filters. Switch to 'All' to see past briefings."
                  : "No briefings match your search. Try a different reference or clear the filter."
              }
              iconClass="bg-muted text-muted-foreground"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ key, items, label, relative }) => {
            const first = items[0];
            const headingConfig = first ? URGENCY_CONFIG[first.urgency] : null;
            return (
              <div key={key} className="space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">
                    {label}
                  </h2>
                  {relative && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "border px-1.5 py-0 text-[10px] tabular-nums",
                        headingConfig?.badge ||
                          "bg-muted text-muted-foreground"
                      )}
                    >
                      {relative}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className="px-1.5 py-0 text-[10px] tabular-nums"
                  >
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
                      onConfirmAttendance={handleConfirmAttendance}
                      onUploadCertificate={handleUploadCertificate}
                      onRemoveCertificate={handleRemoveCertificate}
                      uploadingId={uploadingId}
                      removingCertId={removingCertId}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- Info banner ---- */}
      <Alert>
        <BellRing className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>How briefing alerts work:</strong> A briefing appears as an
          alert when it is compulsory, falls within the next 7 days, and either
          attendance is not confirmed or no person has been assigned to attend.
          Upload an attendance certificate to automatically mark a briefing as
          confirmed.
        </AlertDescription>
      </Alert>

      {/* ---- Dialogs ---- */}
      <BriefingDialog
        open={dialogOpen}
        editing={editingBriefing}
        tenders={tenders}
        tendersLoading={tendersLoading}
        onClose={() => setDialogOpen(false)}
        onSaved={() => fetchData(true)}
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
