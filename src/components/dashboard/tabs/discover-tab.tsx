"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Radar,
  Search,
  Loader2,
  MapPin,
  Building2,
  CalendarClock,
  FileText,
  Plus,
  CheckCircle2,
  TrendingUp,
  Eye,
  Download,
  X,
  ShieldCheck,
  AlertTriangle,
  Send,
  Clock,
  Inbox,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { publicApi, api } from "@/lib/api";
import { useDashboardStore, formatDate, daysUntil, deadlineColor } from "@/lib/dashboard-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface PublicTender {
  id: number;
  reference_number: string;
  title: string;
  description: string;
  category: string;
  location: string;
  closing_date: string | null;
  budget: number;
  contract_period: string;
  status: string;
  company_name: string;
  company_industry: string;
  company_description: string;
  bid_count: number;
}

interface FullTender extends PublicTender {
  scope_of_work: string;
  evaluation_criteria: string;
  submission_method: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  ai_generated_content: string;
}

interface ComplianceResult {
  tender_id: number;
  tender_title: string;
  company_name: string;
  total_required: number;
  matched: number;
  missing: number;
  compliance_percentage: number;
  items: { document: string; category: string; status: string; matched_count: number }[];
}

/* ------------------------------------------------------------------ */
/*  localStorage helpers for "My Tenders" + progress                  */
/* ------------------------------------------------------------------ */

const MY_TENDERS_KEY = "tmflow_my_tenders";

function getMyTenders(): Record<number, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(MY_TENDERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveMyTender(tenderId: number) {
  const map = getMyTenders();
  map[tenderId] = 0;
  localStorage.setItem(MY_TENDERS_KEY, JSON.stringify(map));
}

function removeMyTender(tenderId: number) {
  const map = getMyTenders();
  delete map[tenderId];
  localStorage.setItem(MY_TENDERS_KEY, JSON.stringify(map));
}

function setMyTenderProgress(tenderId: number, progress: number) {
  const map = getMyTenders();
  map[tenderId] = progress;
  localStorage.setItem(MY_TENDERS_KEY, JSON.stringify(map));
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function DiscoverTab() {
  const { setTab, selectTender } = useDashboardStore();
  const [tenders, setTenders] = useState<PublicTender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [categories, setCategories] = useState<string[]>([]);
  const [myTenders, setMyTenders] = useState<Record<number, number>>({});
  const [selectedTender, setSelectedTender] = useState<PublicTender | null>(null);
  const [fullTender, setFullTender] = useState<FullTender | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);
  const [checkingCompliance, setCheckingCompliance] = useState(false);

  /* ---- Load published tenders + categories ---- */
  const fetchTenders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tenderData, catData] = await Promise.all([
        publicApi.listTenders({}),
        publicApi.listCategories(),
      ]);
      setTenders(tenderData.items || []);
      setCategories(catData.items || []);
    } catch (e: any) {
      setError(e.message || "Failed to load tenders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTenders();
    setMyTenders(getMyTenders());
  }, [fetchTenders]);

  /* ---- Filter ---- */
  const filtered = tenders.filter((t) => {
    if (category !== "All" && t.category !== category) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.title?.toLowerCase().includes(q) ||
      t.reference_number?.toLowerCase().includes(q) ||
      t.company_name?.toLowerCase().includes(q) ||
      t.category?.toLowerCase().includes(q) ||
      t.location?.toLowerCase().includes(q)
    );
  });

  /* ---- View detail ---- */
  const openDetail = async (t: PublicTender) => {
    setSelectedTender(t);
    setFullTender(null);
    setLoadingDetail(true);
    try {
      const full = await publicApi.getTender(t.id);
      setFullTender(full);
    } catch (e: any) {
      toast.error("Failed to load tender details", { description: e.message });
    } finally {
      setLoadingDetail(false);
    }
  };

  /* ---- Add / Remove from My Tenders ---- */
  const handleAddToMyTenders = (t: PublicTender) => {
    saveMyTender(t.id);
    setMyTenders(getMyTenders());
    toast.success("Tender added to your list", {
      description: "Track preparation progress in the Tenders tab.",
    });
  };

  const handleRemoveFromMyTenders = (t: PublicTender) => {
    removeMyTender(t.id);
    setMyTenders(getMyTenders());
    toast.success("Tender removed from your list");
  };

  /* ---- Compliance check ---- */
  const handleComplianceCheck = async (t: PublicTender) => {
    setCheckingCompliance(true);
    setCompliance(null);
    try {
      const result = await publicApi.complianceCheck(t.id);
      setCompliance(result);
    } catch (e: any) {
      toast.error("Compliance check failed", { description: e.message });
    } finally {
      setCheckingCompliance(false);
    }
  };

  /* ---- Download PDF ---- */
  const downloadPDF = async (t: PublicTender) => {
    try {
      const full = await publicApi.getTender(t.id);
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF();
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      const m = 18;
      const cw = pw - m * 2;
      let y = 0;

      // Header
      doc.setFillColor(15, 118, 110); doc.rect(0, 0, pw, 28, "F");
      doc.setFillColor(217, 119, 6); doc.rect(0, 28, pw, 2, "F");
      doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont("helvetica", "bold");
      doc.text("TM FLOW", m, 13);
      doc.setFontSize(8); doc.text("TENDER NOTICE", m, 19);
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.text("TENDER NOTICE", pw - m, 13, { align: "right" });

      y = 40;
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(115, 115, 115);
      doc.text(`Reference: ${full.reference_number || "N/A"}`, m, y); y += 5;
      doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(24, 24, 27);
      const tLines = doc.splitTextToSize(full.title || "Untitled Tender", cw);
      doc.text(tLines, m, y); y += tLines.length * 8 + 4;
      doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(115, 115, 115);
      doc.text(`Issued by: ${full.company_name || "—"}`, m, y); y += 10;

      // Sections
      const sections: [string, string][] = [
        ["DESCRIPTION", full.description || ""],
        ["SCOPE OF WORK", full.scope_of_work || ""],
        ["EVALUATION CRITERIA", full.evaluation_criteria || ""],
        ["SUBMISSION METHOD", full.submission_method || ""],
        ["FULL TENDER DOCUMENT", full.ai_generated_content || ""],
      ];
      for (const [label, text] of sections) {
        if (!text) continue;
        if (y > ph - 40) { doc.addPage(); y = m; }
        doc.setFillColor(217, 119, 6); doc.roundedRect(m, y, 3, 5, 1, 1, "F");
        doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(24, 24, 27);
        doc.text(label, m + 6, y + 4);
        doc.setDrawColor(228, 228, 231); doc.line(m, y + 7, pw - m, y + 7);
        y += 12;
        doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(51, 51, 51);
        const lines = doc.splitTextToSize(text, cw);
        lines.forEach((line: string) => {
          if (y > ph - 20) { doc.addPage(); y = m; }
          doc.text(line, m, y); y += 4.5;
        });
        y += 5;
      }

      // Footer
      const pc = doc.getNumberOfPages();
      for (let i = 1; i <= pc; i++) {
        doc.setPage(i);
        doc.setDrawColor(228, 228, 231); doc.line(m, ph - 14, pw - m, ph - 14);
        doc.setFontSize(6); doc.setTextColor(150, 150, 150);
        doc.text(`TM Flow | ${full.reference_number || ""} | Page ${i} of ${pc}`, m, ph - 8);
      }
      doc.save(`${full.reference_number || "tender"}.pdf`);
      toast.success("PDF downloaded");
    } catch (e: any) {
      toast.error("PDF download failed", { description: e.message });
    }
  };

  /* ---- Stats ---- */
  const totalTenders = tenders.length;
  const addedCount = Object.keys(myTenders).length;
  const companies = new Set(tenders.map((t) => t.company_name)).size;

  /* ------------------------------------------------------------------ */
  /*  Render                                                            */
  /* ------------------------------------------------------------------ */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radar className="h-6 w-6 text-primary" />
            Discover Tenders
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse live tender opportunities published on the TM Flow platform.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Inbox className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-2xl font-bold">{totalTenders}</div>
              <div className="text-xs text-muted-foreground">Tenders Available</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{companies}</div>
              <div className="text-xs text-muted-foreground">Issuing Organisations</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{addedCount}</div>
              <div className="text-xs text-muted-foreground">Added to My Tenders</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search + filter */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title, reference, company, category, location…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-56">
                <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Tenders grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
          <p className="text-sm text-muted-foreground">Loading published tenders…</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-1">
              {totalTenders === 0 ? "No tenders published yet" : "No results found"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {totalTenders === 0
                ? "Check back soon for new opportunities from issuing organisations."
                : "Try a different search term or category filter."}
            </p>
            {search && (
              <Button variant="outline" className="mt-4" onClick={() => { setSearch(""); setCategory("All"); }}>
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => {
            const days = daysUntil(t.closing_date);
            const isAdded = myTenders[t.id] !== undefined;
            const progress = myTenders[t.id] ?? 0;
            return (
              <Card
                key={t.id}
                className={cn(
                  "flex flex-col transition-all hover:shadow-lg",
                  isAdded ? "border-emerald-300 ring-1 ring-emerald-200" : "hover:border-primary/30"
                )}
              >
                <CardContent className="p-5 flex flex-col flex-1">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {t.reference_number}
                    </span>
                    {t.category && (
                      <Badge variant="outline" className="text-[9px] h-5 px-1.5 bg-primary/5 text-primary border-primary/20 shrink-0">
                        {t.category}
                      </Badge>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-semibold line-clamp-2 mb-1">{t.title}</h3>
                  <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {t.company_name}
                  </p>

                  {/* Meta */}
                  <div className="space-y-1.5 text-xs text-muted-foreground flex-1">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{t.location || "Location not specified"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CalendarClock className="h-3 w-3 shrink-0" />
                      <span>Closes {formatDate(t.closing_date)}</span>
                      {days !== null && days >= 0 && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] h-4 px-1 ml-auto",
                            days <= 7
                              ? "bg-rose-50 text-rose-700 border-rose-200"
                              : days <= 30
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          )}
                        >
                          {days}d left
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3 w-3 shrink-0" />
                      <span>{t.bid_count || 0} bids submitted</span>
                    </div>
                    {t.budget > 0 && (
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className="h-3 w-3 shrink-0" />
                        <span className="font-medium text-foreground">
                          Est. R {t.budget.toLocaleString("en-ZA")}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Added status + progress */}
                  {isAdded && (
                    <div className="mt-3 p-2 rounded-md bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Tender Added
                        </span>
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{progress}%</span>
                      </div>
                      <Progress value={progress} className="h-1.5 bg-emerald-100" />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 mt-4">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={() => openDetail(t)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => downloadPDF(t)}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    {isAdded ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                        onClick={() => handleRemoveFromMyTenders(t)}
                      >
                        <X className="h-3.5 w-3.5 mr-1" />
                        Remove
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={() => handleAddToMyTenders(t)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add to My Tenders
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selectedTender} onOpenChange={(o) => { if (!o) { setSelectedTender(null); setFullTender(null); setCompliance(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {loadingDetail ? (
            <div className="p-12 flex flex-col items-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">Loading tender details…</p>
            </div>
          ) : selectedTender && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-[10px] font-mono text-muted-foreground px-2 py-0.5 rounded bg-muted">
                        {selectedTender.reference_number}
                      </span>
                      {selectedTender.category && (
                        <Badge variant="outline" className="text-[9px] h-5 px-1.5 bg-primary/5 text-primary border-primary/20">
                          {selectedTender.category}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[9px] h-5 px-1.5 bg-amber-50 text-amber-700 border-amber-200">
                        {selectedTender.bid_count || 0} bids
                      </Badge>
                    </div>
                    <DialogTitle className="text-xl">{selectedTender.title}</DialogTitle>
                    <DialogDescription className="mt-1">
                      Issued by <span className="font-medium text-foreground">{selectedTender.company_name}</span>
                      {selectedTender.company_industry ? ` · ${selectedTender.company_industry}` : ""}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {/* Key details grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2">
                <div className="rounded-md border p-3">
                  <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> Category
                  </div>
                  <div className="text-sm font-medium mt-1">{selectedTender.category || "—"}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Budget
                  </div>
                  <div className="text-sm font-bold mt-1 text-amber-700">
                    {selectedTender.budget ? `R ${selectedTender.budget.toLocaleString("en-ZA")}` : "—"}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" /> Closing
                  </div>
                  <div className="text-sm font-medium mt-1">{formatDate(selectedTender.closing_date)}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Location
                  </div>
                  <div className="text-sm font-medium mt-1 line-clamp-2">{selectedTender.location || "—"}</div>
                </div>
              </div>

              {/* Description */}
              {(fullTender?.description || selectedTender.description) && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 font-medium">Description</div>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{fullTender?.description || selectedTender.description}</p>
                </div>
              )}

              {fullTender?.scope_of_work && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 font-medium">Scope of Work</div>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{fullTender.scope_of_work}</p>
                </div>
              )}

              {fullTender?.evaluation_criteria && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 font-medium">Evaluation Criteria</div>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{fullTender.evaluation_criteria}</p>
                </div>
              )}

              {(fullTender?.submission_method || selectedTender.submission_method) && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 font-medium">Submission Method</div>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{fullTender?.submission_method || selectedTender.submission_method}</p>
                </div>
              )}

              {fullTender?.ai_generated_content && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 font-medium flex items-center gap-1">
                    <FileText className="h-3 w-3" /> Full Tender Document
                  </div>
                  <div className="rounded-md border border-border bg-muted/30 p-4 max-h-[300px] overflow-y-auto">
                    <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">{fullTender.ai_generated_content}</pre>
                  </div>
                </div>
              )}

              {/* Contact */}
              {(fullTender?.contact_person || fullTender?.contact_email || fullTender?.contact_phone) && (
                <div className="rounded-md border border-border p-4 bg-muted/20">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 font-medium">Contact Details</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    {fullTender?.contact_person && (
                      <div><span className="text-[10px] text-muted-foreground">Person</span><div className="font-medium">{fullTender.contact_person}</div></div>
                    )}
                    {fullTender?.contact_email && (
                      <div><span className="text-[10px] text-muted-foreground">Email</span><div className="font-medium">{fullTender.contact_email}</div></div>
                    )}
                    {fullTender?.contact_phone && (
                      <div><span className="text-[10px] text-muted-foreground">Phone</span><div className="font-medium">{fullTender.contact_phone}</div></div>
                    )}
                  </div>
                </div>
              )}

              {/* Compliance check */}
              {compliance && (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] uppercase tracking-wide font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" /> Compliance Check
                    </div>
                    <Badge className={cn(
                      "text-xs",
                      compliance.compliance_percentage >= 80
                        ? "bg-emerald-600"
                        : compliance.compliance_percentage >= 50
                        ? "bg-amber-600"
                        : "bg-rose-600"
                    )}>
                      {compliance.compliance_percentage}% compliant
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    {compliance.matched} of {compliance.total_required} required documents matched in your Compliance Library.
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {compliance.items.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {item.status === "matched" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        )}
                        <span className={item.status === "matched" ? "text-foreground" : "text-muted-foreground"}>
                          {item.document}
                        </span>
                        <Badge variant="outline" className="text-[9px] h-4 px-1 ml-auto">
                          {item.status === "matched" ? "Ready" : "Missing"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <Button size="sm" variant="outline" onClick={() => downloadPDF(selectedTender)}>
                  <Download className="h-4 w-4 mr-1.5" /> Download PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleComplianceCheck(selectedTender)}
                  disabled={checkingCompliance}
                >
                  {checkingCompliance ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 mr-1.5" />
                  )}
                  Check Compliance
                </Button>
                {myTenders[selectedTender.id] !== undefined ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-600 border-rose-200 hover:bg-rose-50"
                      onClick={() => handleRemoveFromMyTenders(selectedTender)}
                    >
                      <X className="h-4 w-4 mr-1.5" /> Remove from My Tenders
                    </Button>
                    <Button
                      size="sm"
                      className="ml-auto"
                      onClick={() => setShowSubmit(true)}
                    >
                      <Send className="h-4 w-4 mr-1.5" /> Submit Bid
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    className="ml-auto"
                    onClick={() => handleAddToMyTenders(selectedTender)}
                  >
                    <Plus className="h-4 w-4 mr-1.5" /> Add to My Tenders
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Submit Bid dialog */}
      <SubmitBidDialog
        tender={selectedTender}
        open={showSubmit}
        onOpenChange={setShowSubmit}
        onSubmitted={() => {
          if (selectedTender) {
            setMyTenderProgress(selectedTender.id, 100);
            setMyTenders(getMyTenders());
          }
          setShowSubmit(false);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Submit Bid Dialog                                                 */
/* ------------------------------------------------------------------ */

function SubmitBidDialog({
  tender,
  open,
  onOpenChange,
  onSubmitted,
}: {
  tender: PublicTender | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmitted: () => void;
}) {
  const [companyName, setCompanyName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [bbbeeLevel, setBbbeeLevel] = useState("");
  const [amount, setAmount] = useState("");
  const [summary, setSummary] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && tender) {
      // Pre-fill from logged-in user if possible
      try {
        const raw = localStorage.getItem("tenderflow_user");
        if (raw) {
          const u = JSON.parse(raw);
          setContactPerson(u.full_name || "");
          setCompanyName(u.company_name || "");
          setEmail(u.email || "");
        }
      } catch {}
    }
  }, [open, tender]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tender) return;
    if (!companyName.trim() || !contactPerson.trim()) {
      toast.error("Company name and contact person are required");
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("bidder_company_name", companyName.trim());
      form.append("bidder_contact_person", contactPerson.trim());
      form.append("bidder_email", email.trim());
      form.append("bidder_phone", phone.trim());
      form.append("bidder_bbbee_level", bbbeeLevel);
      form.append("total_amount", amount || "0");
      form.append("proposal_summary", summary.trim());
      files.forEach((f) => form.append("files", f));
      await publicApi.submitBid(tender.id, form);
      toast.success("Bid submitted successfully!", {
        description: "The issuer will review your bid.",
      });
      onSubmitted();
    } catch (err: any) {
      toast.error("Failed to submit bid", { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit Bid</DialogTitle>
          <DialogDescription>
            {tender?.title} · {tender?.reference_number}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="bid-company">Company Name *</Label>
              <Input id="bid-company" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bid-contact">Contact Person *</Label>
              <Input id="bid-contact" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bid-email">Email</Label>
              <Input id="bid-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bid-phone">Phone</Label>
              <Input id="bid-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bid-bbbee">B-BBEE Level</Label>
              <Select value={bbbeeLevel} onValueChange={setBbbeeLevel}>
                <SelectTrigger id="bid-bbbee"><SelectValue placeholder="Select level" /></SelectTrigger>
                <SelectContent>
                  {["Level 1", "Level 2", "Level 3", "Level 4", "Level 5", "Level 6", "Level 7", "Level 8", "Non-compliant"].map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bid-amount">Bid Amount (R)</Label>
              <Input id="bid-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bid-summary">Proposal Summary</Label>
            <Textarea
              id="bid-summary"
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Briefly describe your approach, experience, and value proposition…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bid-files">Supporting Documents</Label>
            <Input
              id="bid-files"
              type="file"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
            <p className="text-xs text-muted-foreground">
              Upload any supporting documents (company profile, B-BBEE certificate, references, etc.)
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              {submitting ? "Submitting…" : "Submit Bid"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
