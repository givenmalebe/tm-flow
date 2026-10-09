"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FolderCheck,
  FolderPlus,
  Upload,
  Search,
  RefreshCw,
  Download,
  Pencil,
  Trash2,
  AlertTriangle,
  FileText,
  CalendarClock,
  CalendarCheck,
  XCircle,
  CheckCircle2,
  Loader2,
  FileWarning,
  Files,
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
import { api, LIBRARY_CATEGORIES } from "@/lib/api";
import { formatDate } from "@/lib/dashboard-store";
import { cn } from "@/lib/utils";

// ---- Types ----
type DocStatus = "Active" | "Expiring Soon" | "Expired";

interface LibraryDoc {
  id: number;
  name: string;
  category: string;
  description: string | null;
  filename: string;
  file_size: number | null;
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  uploaded_at: string;
  days_to_expiry: number | null;
  status: DocStatus;
}

interface DocForm {
  name: string;
  category: string;
  description: string;
  issue_date: string;
  expiry_date: string;
  notes: string;
}

const EMPTY_FORM: DocForm = {
  name: "",
  category: "",
  description: "",
  issue_date: "",
  expiry_date: "",
  notes: "",
};

// ---- Helpers ----
function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusBadgeClass(status: DocStatus): string {
  if (status === "Active")
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900";
  if (status === "Expiring Soon")
    return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900";
  return "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-900";
}

function expiryLabel(days: number | null): string {
  if (days === null) return "No expiry";
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `In ${days}d`;
}

function downloadUrl(filename: string): string {
  return `/uploads/${filename}`;
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

// ---- Document card ----
interface DocumentCardProps {
  doc: LibraryDoc;
  onEdit: (doc: LibraryDoc) => void;
  onDelete: (doc: LibraryDoc) => void;
}

function DocumentCard({ doc, onEdit, onDelete }: DocumentCardProps) {
  return (
    <Card className="group flex flex-col transition-shadow hover:shadow-md">
      <CardContent className="flex flex-1 flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground" title={doc.name}>
                {doc.name}
              </div>
              <Badge variant="outline" className="mt-1 px-1.5 py-0 text-[10px] font-medium">
                {doc.category}
              </Badge>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn("shrink-0 border tabular-nums", statusBadgeClass(doc.status))}
          >
            {doc.status}
          </Badge>
        </div>

        {/* Description */}
        {doc.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{doc.description}</p>
        )}

        {/* Dates */}
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarCheck className="h-3.5 w-3.5" />
              Issued
            </span>
            <span className="font-medium text-foreground tabular-nums">
              {formatDate(doc.issue_date)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              Expires
            </span>
            <span className="font-medium text-foreground tabular-nums">
              {formatDate(doc.expiry_date)}
            </span>
          </div>
          {doc.days_to_expiry !== null && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Time left</span>
              <Badge
                variant="outline"
                className={cn(
                  "border tabular-nums px-1.5 py-0 text-[10px]",
                  doc.days_to_expiry < 0
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-900"
                    : doc.days_to_expiry <= 30
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900"
                )}
              >
                {expiryLabel(doc.days_to_expiry)}
              </Badge>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {formatFileSize(doc.file_size)}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
              asChild
            >
              <a href={downloadUrl(doc.filename)} target="_blank" rel="noopener noreferrer">
                <Download className="h-3.5 w-3.5" />
                <span className="sr-only">Download</span>
              </a>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              onClick={() => onEdit(doc)}
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="sr-only">Edit</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950"
              onClick={() => onDelete(doc)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="sr-only">Delete</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Document dialog (upload / edit) ----
interface DocumentDialogProps {
  open: boolean;
  editing: LibraryDoc | null;
  onClose: () => void;
  onSaved: () => void;
}

function DocumentDialog({ open, editing, onClose, onSaved }: DocumentDialogProps) {
  const [form, setForm] = useState<DocForm>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const isEdit = editing !== null;

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          name: editing.name || "",
          category: editing.category || "",
          description: editing.description || "",
          issue_date: editing.issue_date || "",
          expiry_date: editing.expiry_date || "",
          notes: editing.notes || "",
        });
      } else {
        setForm(EMPTY_FORM);
      }
      setFile(null);
    }
  }, [open, editing]);

  const update = (key: keyof DocForm, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const canSave =
    form.name.trim().length > 0 &&
    form.category.length > 0 &&
    (!isEdit || true) &&
    (isEdit || file !== null);

  const handleSave = async () => {
    if (!canSave) {
      if (!form.name.trim()) toast.error("Document name is required");
      else if (!form.category) toast.error("Category is required");
      else if (!isEdit && !file) toast.error("Please choose a file to upload");
      return;
    }
    setSaving(true);
    try {
      if (isEdit && editing) {
        const payload: Record<string, string> = {
          name: form.name.trim(),
          category: form.category,
          description: form.description,
          notes: form.notes,
        };
        if (form.issue_date) payload.issue_date = form.issue_date;
        if (form.expiry_date) payload.expiry_date = form.expiry_date;
        await api.updateLibraryDocument(editing.id, payload);
        toast.success("Document updated");
      } else {
        const fd = new FormData();
        fd.append("name", form.name.trim());
        fd.append("category", form.category);
        if (form.description) fd.append("description", form.description);
        if (form.issue_date) fd.append("issue_date", form.issue_date);
        if (form.expiry_date) fd.append("expiry_date", form.expiry_date);
        if (form.notes) fd.append("notes", form.notes);
        if (file) fd.append("file", file);
        await api.uploadLibraryDocument(fd);
        toast.success("Document uploaded");
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save document");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? (
              <>
                <Pencil className="h-4 w-4 text-primary" />
                Edit Document
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 text-primary" />
                Upload Document
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the document details below."
              : "Add a new compliance document to your library."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Name */}
          <div className="grid gap-2">
            <Label htmlFor="doc-name">
              Name <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="doc-name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="e.g. B-BBEE Certificate 2025"
              autoFocus
            />
          </div>

          {/* Category */}
          <div className="grid gap-2">
            <Label htmlFor="doc-category">
              Category <span className="text-rose-500">*</span>
            </Label>
            <Select
              value={form.category}
              onValueChange={(v) => update("category", v)}
            >
              <SelectTrigger id="doc-category" className="w-full">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {LIBRARY_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="grid gap-2">
            <Label htmlFor="doc-description">Description</Label>
            <Textarea
              id="doc-description"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Short summary of this document"
              rows={2}
            />
          </div>

          {/* Dates */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="doc-issue">Issue date</Label>
              <Input
                id="doc-issue"
                type="date"
                value={form.issue_date}
                onChange={(e) => update("issue_date", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="doc-expiry">Expiry date</Label>
              <Input
                id="doc-expiry"
                type="date"
                value={form.expiry_date}
                onChange={(e) => update("expiry_date", e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank if non-expiring
              </p>
            </div>
          </div>

          {/* Notes */}
          <div className="grid gap-2">
            <Label htmlFor="doc-notes">Notes</Label>
            <Textarea
              id="doc-notes"
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Internal notes, renewal reminders, etc."
              rows={2}
            />
          </div>

          {/* File */}
          {isEdit ? (
            <div className="grid gap-2">
              <Label>File</Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-muted-foreground" title={editing?.filename}>
                  {editing?.filename || "No file"}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Delete &amp; re-upload to replace the file.
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="doc-file">
                File <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="doc-file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                  {file.name} ({formatFileSize(file.size)})
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !canSave}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Upload document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Delete confirmation ----
interface DeleteDialogProps {
  open: boolean;
  doc: LibraryDoc | null;
  onClose: () => void;
  onConfirm: () => void;
  deleting: boolean;
}

function DeleteDialog({ open, doc, onClose, onConfirm, deleting }: DeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
            Delete document
          </AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-semibold text-foreground">{doc?.name}</span>? This will
            also remove the uploaded file. This action cannot be undone.
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
export function LibraryTab() {
  const [docs, setDocs] = useState<LibraryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<LibraryDoc | null>(null);

  const [deleteDoc, setDeleteDoc] = useState<LibraryDoc | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchDocs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await api.listLibrary();
      setDocs((res.items as LibraryDoc[]) || []);
    } catch (e: any) {
      setError(e?.message || "Failed to load library documents");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  // ---- Client-side filtering ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (categoryFilter !== "all" && d.category !== categoryFilter) return false;
      if (q) {
        const hay = `${d.name} ${d.description || ""} ${d.category}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [docs, categoryFilter, search]);

  // ---- Stats (computed from full list, not filtered) ----
  const stats = useMemo(() => {
    const total = docs.length;
    const expiringSoon = docs.filter((d) => d.status === "Expiring Soon").length;
    const expired = docs.filter((d) => d.status === "Expired").length;
    return { total, expiringSoon, expired };
  }, [docs]);

  // ---- Group filtered docs by category (preserving LIBRARY_CATEGORIES order) ----
  const grouped = useMemo(() => {
    const map = new Map<string, LibraryDoc[]>();
    for (const d of filtered) {
      if (!map.has(d.category)) map.set(d.category, []);
      map.get(d.category)!.push(d);
    }
    const orderedCategories = LIBRARY_CATEGORIES.filter((c) => map.has(c));
    // Include any unknown categories at the end
    for (const c of map.keys()) {
      if (!orderedCategories.includes(c)) orderedCategories.push(c);
    }
    return orderedCategories.map((c) => ({ category: c, items: map.get(c)! }));
  }, [filtered]);

  const openNew = () => {
    setEditingDoc(null);
    setDialogOpen(true);
  };

  const openEdit = (doc: LibraryDoc) => {
    setEditingDoc(doc);
    setDialogOpen(true);
  };

  const requestDelete = (doc: LibraryDoc) => {
    setDeleteDoc(doc);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteDoc) return;
    setDeleting(true);
    try {
      await api.deleteLibraryDocument(deleteDoc.id);
      toast.success("Document deleted");
      setDeleteOpen(false);
      setDeleteDoc(null);
      fetchDocs(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete document");
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
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-xl" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compliance Document Library</h1>
          <p className="text-sm text-muted-foreground">
            One central library for company documents required for tenders
          </p>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn&apos;t load your library</AlertTitle>
          <AlertDescription>
            <p className="mb-3">{error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchDocs()}
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
          <h1 className="text-2xl font-bold tracking-tight">Compliance Document Library</h1>
          <p className="text-sm text-muted-foreground">
            One central library for company documents required for tenders
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => fetchDocs(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button onClick={openNew}>
            <Upload className="h-4 w-4" />
            Upload Document
          </Button>
        </div>
      </div>

      {/* ---- Stats row ---- */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={Files}
          iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
          value={stats.total}
          label="Total Documents"
          subtitle="In your library"
        />
        <StatCard
          icon={CalendarClock}
          iconClass="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
          value={stats.expiringSoon}
          label="Expiring Soon"
          subtitle="Within 30 days"
        />
        <StatCard
          icon={FileWarning}
          iconClass="bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
          value={stats.expired}
          label="Expired"
          subtitle="Need renewal"
        />
      </div>

      {/* ---- Filters ---- */}
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 sm:w-56">
            <FolderCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {LIBRARY_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, description or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {(categoryFilter !== "all" || search) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCategoryFilter("all");
                setSearch("");
              }}
            >
              <XCircle className="h-4 w-4" />
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ---- Documents ---- */}
      {docs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent>
            <EmptyState
              icon={FolderCheck}
              title="No documents yet"
              message="Upload your first compliance document — B-BBEE certificate, CIPC records, insurance documents and more — to keep them ready for every tender."
              iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
              action={
                <Button onClick={openNew} className="mt-1">
                  <FolderPlus className="h-4 w-4" />
                  Upload your first document
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
              message="No documents match your current filters. Try clearing the search or category filter."
              iconClass="bg-muted text-muted-foreground"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ category, items }) => (
            <div key={category} className="space-y-3">
              <div className="flex items-center gap-2">
                <FolderCheck className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">{category}</h2>
                <Badge variant="outline" className="px-1.5 py-0 text-[10px] tabular-nums">
                  {items.length}
                </Badge>
                <div className="ml-2 h-px flex-1 bg-border" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    onEdit={openEdit}
                    onDelete={requestDelete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- Dialogs ---- */}
      <DocumentDialog
        open={dialogOpen}
        editing={editingDoc}
        onClose={() => setDialogOpen(false)}
        onSaved={() => fetchDocs(true)}
      />
      <DeleteDialog
        open={deleteOpen}
        doc={deleteDoc}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteDoc(null);
        }}
        onConfirm={confirmDelete}
        deleting={deleting}
      />
    </div>
  );
}
