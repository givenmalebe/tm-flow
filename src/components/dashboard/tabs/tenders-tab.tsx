"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus,
  Search,
  Filter,
  RefreshCw,
  FileStack,
  ChevronLeft,
  Calendar,
  MapPin,
  Building2,
  User,
  ArrowUpDown,
  Archive,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api, TENDER_STATUSES, TENDER_OUTCOMES } from "@/lib/api";
import { useDashboardStore, formatDate, formatCurrency, daysUntil, statusColor, deadlineColor } from "@/lib/dashboard-store";
import { TenderDetail } from "../tender-detail";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type SortField = "updated_at" | "closing_date" | "estimated_value" | "reference_number" | "title";

export function TendersTab() {
  const { selectedTenderId, selectTender, refresh, refreshKey } = useDashboardStore();
  const [tenders, setTenders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortField>("updated_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const fetchTenders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listTenders({
        search: search || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        outcome: outcomeFilter !== "all" ? outcomeFilter : undefined,
        sort: sortBy,
        order: sortOrder,
      });
      setTenders(data.items);
    } catch (e: any) {
      setError(e.message || "Failed to load tenders");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, outcomeFilter, sortBy, sortOrder, refreshKey]);

  useEffect(() => {
    const t = setTimeout(fetchTenders, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchTenders]);

  // Detail view
  if (selectedTenderId) {
    return <TenderDetail tenderId={selectedTenderId} onBack={() => selectTender(null)} />;
  }

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteTender(deleteTarget.id);
      toast.success("Tender deleted");
      setDeleteTarget(null);
      refresh();
      fetchTenders();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete tender");
    }
  };

  const handleArchive = async (t: any) => {
    try {
      await api.archiveTender(t.id);
      toast.success("Tender archived");
      refresh();
      fetchTenders();
    } catch (e: any) {
      toast.error(e.message || "Failed to archive tender");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Central tender register — every tender from discovery to outcome
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchTenders} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button onClick={() => setShowCreate(true)} size="sm">
            <Plus className="h-4 w-4" />
            New Tender
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by reference, title, client, location…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {TENDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                {TENDER_OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
              <SelectTrigger className="w-full md:w-44">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated_at">Last updated</SelectItem>
                <SelectItem value="closing_date">Closing date</SelectItem>
                <SelectItem value="estimated_value">Estimated value</SelectItem>
                <SelectItem value="reference_number">Reference</SelectItem>
                <SelectItem value="title">Title</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              title={sortOrder === "asc" ? "Ascending" : "Descending"}
            >
              <ArrowUpDown className={cn("h-4 w-4", sortOrder === "asc" && "rotate-180")} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={fetchTenders}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {loading ? "Loading…" : `${tenders.length} tender${tenders.length === 1 ? "" : "s"} found`}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : tenders.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <FileStack className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">No tenders yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              {search || statusFilter !== "all" || outcomeFilter !== "all"
                ? "No tenders match your filters. Try adjusting them."
                : "Get started by creating your first tender or uploading a tender document."}
            </p>
            <Button className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
              Create your first tender
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tenders.map((t) => {
            const days = daysUntil(t.closing_date);
            const checklistTotal = t.checklist_items?.length || 0;
            const checklistComplete = t.checklist_items?.filter((c: any) => c.status === "Complete").length || 0;
            const completionPct = checklistTotal > 0 ? Math.round((checklistComplete / checklistTotal) * 100) : 0;
            return (
              <Card
                key={t.id}
                className="hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => selectTender(t.id)}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-semibold text-primary">
                          {t.reference_number}
                        </span>
                        <Badge variant="outline" className={cn("text-xs", statusColor(t.status))}>
                          {t.status}
                        </Badge>
                        {t.outcome && t.outcome !== "Pending" && (
                          <Badge variant="outline" className={cn(
                            "text-xs",
                            t.outcome === "Awarded" && "bg-emerald-100 text-emerald-800",
                            t.outcome === "Unsuccessful" && "bg-rose-100 text-rose-800",
                            t.outcome === "Withdrawn" && "bg-muted text-muted-foreground",
                          )}>
                            {t.outcome}
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-sm sm:text-base group-hover:text-primary transition-colors line-clamp-1">
                        {t.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {t.client_company}
                        </span>
                        {t.location_site && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {t.location_site}
                          </span>
                        )}
                        {t.closing_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span className={deadlineColor(days)}>
                              {days === null ? formatDate(t.closing_date) :
                                days < 0 ? `Closed ${formatDate(t.closing_date)}` :
                                days === 0 ? "Closes today" :
                                `${days} day${days === 1 ? "" : "s"} left`}
                            </span>
                          </span>
                        )}
                        {t.person_responsible && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {t.person_responsible}
                          </span>
                        )}
                        {t.estimated_value != null && (
                          <span className="font-medium text-foreground">
                            {formatCurrency(t.estimated_value)}
                          </span>
                        )}
                      </div>
                      {checklistTotal > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 max-w-[200px] h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full transition-all",
                                completionPct === 100 ? "bg-emerald-500" :
                                completionPct >= 50 ? "bg-amber-500" : "bg-rose-500"
                              )}
                              style={{ width: `${completionPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {checklistComplete}/{checklistTotal} ({completionPct}%)
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 sm:flex-col sm:items-end" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleArchive(t)}
                        title="Archive"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                        onClick={() => setDeleteTarget(t)}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <CreateTenderDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={(t) => {
          setShowCreate(false);
          refresh();
          fetchTenders();
          selectTender(t.id);
        }}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tender?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.reference_number}</strong> —{" "}
              {deleteTarget?.title} — and all its documents, checklist, briefings, pricing, communications and addendums. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------- Create Tender Dialog ----------------

function CreateTenderDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (t: any) => void;
}) {
  const [form, setForm] = useState({
    reference_number: "",
    title: "",
    client_company: "",
    description: "",
    scope_of_work: "",
    category: "",
    location_site: "",
    issue_date: "",
    closing_date: "",
    closing_time: "",
    validity_period: "",
    estimated_value: "",
    contract_period: "",
    status: "New Opportunity",
    contact_person: "",
    contact_email: "",
    contact_telephone: "",
    submission_method: "",
    person_responsible: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.reference_number || !form.title || !form.client_company) {
      setError("Reference number, title and client are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        reference_number: form.reference_number,
        title: form.title,
        client_company: form.client_company,
        description: form.description || null,
        scope_of_work: form.scope_of_work || null,
        category: form.category || null,
        location_site: form.location_site || null,
        issue_date: form.issue_date || null,
        closing_date: form.closing_date || null,
        closing_time: form.closing_time || null,
        validity_period: form.validity_period || null,
        estimated_value: form.estimated_value ? parseFloat(form.estimated_value) : null,
        contract_period: form.contract_period || null,
        status: form.status,
        contact_person: form.contact_person || null,
        contact_email: form.contact_email || null,
        contact_telephone: form.contact_telephone || null,
        submission_method: form.submission_method || null,
        person_responsible: form.person_responsible || null,
        notes: form.notes || null,
      };
      const t = await api.createTender(payload);
      toast.success("Tender created");
      onCreated(t);
      // Reset form
      setForm({
        reference_number: "", title: "", client_company: "", description: "",
        scope_of_work: "", category: "", location_site: "", issue_date: "",
        closing_date: "", closing_time: "", validity_period: "", estimated_value: "",
        contract_period: "", status: "New Opportunity", contact_person: "",
        contact_email: "", contact_telephone: "", submission_method: "",
        person_responsible: "", notes: "",
      });
    } catch (e: any) {
      setError(e.message || "Failed to create tender");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle>Create new tender</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <Field label="Reference number *" required>
            <Input value={form.reference_number} onChange={(e) => set("reference_number", e.target.value)} placeholder="e.g. E137" />
          </Field>
          <Field label="Tender title *" required>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Provision of Security Guards" />
          </Field>
          <Field label="Client / company *" required>
            <Input value={form.client_company} onChange={(e) => set("client_company", e.target.value)} placeholder="e.g. City of Cape Town" />
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Security Services" />
          </Field>
          <Field label="Location / site">
            <Input value={form.location_site} onChange={(e) => set("location_site", e.target.value)} placeholder="e.g. Western Cape" />
          </Field>
          <Field label="Estimated value (ZAR)">
            <Input type="number" value={form.estimated_value} onChange={(e) => set("estimated_value", e.target.value)} placeholder="e.g. 2500000" />
          </Field>
          <Field label="Issue date">
            <Input type="date" value={form.issue_date} onChange={(e) => set("issue_date", e.target.value)} />
          </Field>
          <Field label="Closing date">
            <Input type="date" value={form.closing_date} onChange={(e) => set("closing_date", e.target.value)} />
          </Field>
          <Field label="Closing time">
            <Input type="time" value={form.closing_time} onChange={(e) => set("closing_time", e.target.value)} />
          </Field>
          <Field label="Validity period">
            <Input value={form.validity_period} onChange={(e) => set("validity_period", e.target.value)} placeholder="e.g. 90 days" />
          </Field>
          <Field label="Contract period">
            <Input value={form.contract_period} onChange={(e) => set("contract_period", e.target.value)} placeholder="e.g. 36 months" />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TENDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Contact person">
            <Input value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} />
          </Field>
          <Field label="Contact email">
            <Input type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} />
          </Field>
          <Field label="Contact telephone">
            <Input value={form.contact_telephone} onChange={(e) => set("contact_telephone", e.target.value)} />
          </Field>
          <Field label="Submission method">
            <Input value={form.submission_method} onChange={(e) => set("submission_method", e.target.value)} placeholder="e.g. Email / Portal / Physical" />
          </Field>
          <Field label="Person responsible">
            <Input value={form.person_responsible} onChange={(e) => set("person_responsible", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Scope of work">
              <Textarea value={form.scope_of_work} onChange={(e) => set("scope_of_work", e.target.value)} rows={3} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
            </Field>
          </div>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Creating…" : "Create tender"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}{required && <span className="text-rose-600 ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}
