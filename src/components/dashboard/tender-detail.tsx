"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  ChevronLeft,
  Pencil,
  RefreshCw,
  FileStack,
  FileText,
  ListChecks,
  MapPin,
  Calculator,
  Send,
  MessageSquare,
  FileDiff,
  Sparkles,
  Upload,
  Trash2,
  Download,
  Wand2,
  Loader2,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Link2,
  Bot,
  Save,
  X,
  Shield,
  Building2,
  Users,
  User,
  FileSignature,
  Copy,
  Check,
  FileCheck,
  ClipboardCheck,
  TrendingUp,
  Target,
  Calendar,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { api, TENDER_STATUSES, TENDER_OUTCOMES, CHECKLIST_STATUSES, LIBRARY_CATEGORIES, type PackItem, type DocumentPackResponse } from "@/lib/api";
import { SubmissionReadinessPanel } from "./submission-readiness";
import {
  useDashboardStore,
  formatDate,
  formatDateTime,
  formatCurrency,
  daysUntil,
  statusColor,
  deadlineColor,
} from "@/lib/dashboard-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TenderDetailProps {
  tenderId: number;
  onBack: () => void;
}

type SubTab = "overview" | "preparation" | "readiness" | "checklist" | "briefings" | "pricing" | "submission" | "communications" | "addendums" | "generated" | "ai";

export function TenderDetail({ tenderId, onBack }: TenderDetailProps) {
  const { refresh } = useDashboardStore();
  const [tender, setTender] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<SubTab>("overview");
  const [showEdit, setShowEdit] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await api.getTender(tenderId);
      setTender(t);
    } catch (e: any) {
      setError(e.message || "Failed to load tender");
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center justify-between">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={fetch}>Retry</Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!tender) return null;

  const days = daysUntil(tender.closing_date);
  const checklistTotal = tender.checklist_items?.length || 0;
  const checklistComplete = tender.checklist_items?.filter((c: any) => c.status === "Complete").length || 0;
  const completionPct = checklistTotal > 0 ? Math.round((checklistComplete / checklistTotal) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Back + header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
          Back to tenders
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-mono text-sm font-semibold text-primary">
                  {tender.reference_number}
                </span>
                <Badge variant="outline" className={cn("text-xs", statusColor(tender.status))}>
                  {tender.status}
                </Badge>
                {tender.outcome && tender.outcome !== "Pending" && (
                  <Badge variant="outline" className={cn(
                    "text-xs",
                    tender.outcome === "Awarded" && "bg-emerald-600 text-white",
                    tender.outcome === "Unsuccessful" && "bg-rose-100 text-rose-800",
                    tender.outcome === "Withdrawn" && "bg-muted text-muted-foreground",
                  )}>
                    {tender.outcome}
                  </Badge>
                )}
                {tender.ai_extracted_info && !tender.ai_extracted_info._error && (
                  <Badge variant="outline" className="text-xs bg-violet-100 text-violet-800">
                    <Sparkles className="h-3 w-3 mr-1" />
                    AI Extracted
                  </Badge>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{tender.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{tender.client_company}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
                {tender.closing_date && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Closes: <span className={deadlineColor(days)}>{formatDate(tender.closing_date)}{tender.closing_time ? ` ${tender.closing_time}` : ""}</span>
                    {days !== null && days >= 0 && (
                      <span className={deadlineColor(days)}>· {days === 0 ? "today" : `${days}d left`}</span>
                    )}
                  </span>
                )}
                {tender.location_site && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {tender.location_site}
                  </span>
                )}
                {tender.estimated_value != null && (
                  <span className="font-medium text-foreground">{formatCurrency(tender.estimated_value)}</span>
                )}
                {tender.person_responsible && (
                  <span>Responsible: {tender.person_responsible}</span>
                )}
              </div>
              {checklistTotal > 0 && (
                <div className="mt-3 flex items-center gap-3 max-w-md">
                  <Progress value={completionPct} className="h-2 flex-1" />
                  <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {completionPct}% complete ({checklistComplete}/{checklistTotal})
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={fetch}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submission gate: what must be true before this bid can be sent */}
      {tab !== "submission" && (
        <SubmissionReadinessPanel
          tenderId={tender.id}
          referenceNumber={tender.reference_number}
          onSubmitted={fetch}
        />
      )}

      {/* Sub-tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as SubTab)}>
        <TabsList className="w-full flex-wrap h-auto justify-start overflow-x-auto scrollbar-thin">
          <TabsTrigger value="overview" className="text-xs"><FileText className="h-3.5 w-3.5 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="readiness" className="text-xs"><Target className="h-3.5 w-3.5 mr-1" />Readiness</TabsTrigger>
          <TabsTrigger value="preparation" className="text-xs"><ClipboardCheck className="h-3.5 w-3.5 mr-1" />Preparation</TabsTrigger>
          <TabsTrigger value="checklist" className="text-xs"><ListChecks className="h-3.5 w-3.5 mr-1" />Checklist</TabsTrigger>
          <TabsTrigger value="briefings" className="text-xs"><MapPin className="h-3.5 w-3.5 mr-1" />Briefings</TabsTrigger>
          <TabsTrigger value="pricing" className="text-xs"><Calculator className="h-3.5 w-3.5 mr-1" />Pricing</TabsTrigger>
          <TabsTrigger value="submission" className="text-xs"><Send className="h-3.5 w-3.5 mr-1" />Submission</TabsTrigger>
          <TabsTrigger value="communications" className="text-xs"><MessageSquare className="h-3.5 w-3.5 mr-1" />Comms</TabsTrigger>
          <TabsTrigger value="addendums" className="text-xs"><FileDiff className="h-3.5 w-3.5 mr-1" />Addendums</TabsTrigger>
          <TabsTrigger value="generated" className="text-xs"><FileSignature className="h-3.5 w-3.5 mr-1" />Documents</TabsTrigger>
          <TabsTrigger value="ai" className="text-xs"><Bot className="h-3.5 w-3.5 mr-1" />AI</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewSection tender={tender} />
        </TabsContent>
        <TabsContent value="readiness" className="mt-4">
          <ReadinessSection tender={tender} />
        </TabsContent>
        <TabsContent value="preparation" className="mt-4">
          <PreparationSection tender={tender} onChanged={fetch} />
        </TabsContent>
        <TabsContent value="checklist" className="mt-4">
          <ChecklistSection tender={tender} onChanged={fetch} />
        </TabsContent>
        <TabsContent value="briefings" className="mt-4">
          <BriefingsSection tender={tender} onChanged={fetch} />
        </TabsContent>
        <TabsContent value="pricing" className="mt-4">
          <PricingSection tender={tender} onChanged={fetch} />
        </TabsContent>
        <TabsContent value="submission" className="mt-4">
          <SubmissionSection tender={tender} onChanged={fetch} />
        </TabsContent>
        <TabsContent value="communications" className="mt-4">
          <CommunicationsSection tender={tender} onChanged={fetch} />
        </TabsContent>
        <TabsContent value="addendums" className="mt-4">
          <AddendumsSection tender={tender} onChanged={fetch} />
        </TabsContent>
        <TabsContent value="generated" className="mt-4">
          <GeneratedDocumentsSection tender={tender} onChanged={fetch} />
        </TabsContent>
        <TabsContent value="ai" className="mt-4">
          <AISection tender={tender} onChanged={fetch} />
        </TabsContent>
      </Tabs>

      <EditTenderDialog
        tender={tender}
        open={showEdit}
        onOpenChange={setShowEdit}
        onSaved={() => {
          refresh();
          fetch();
        }}
      />
    </div>
  );
}

// ============== Readiness Report Section ==============
function ReadinessSection({ tender }: { tender: any }) {
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    toast.info("AI is analyzing your tender readiness…");
    try {
      const data = await api.generateReadinessReport(tender.id);
      setReport(data.report);
      toast.success("Readiness report generated!");
    } catch (e: any) {
      setError(e.message || "Failed to generate report");
      toast.error(e.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (report) {
      navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Report copied to clipboard");
    }
  };

  const handleDownload = () => {
    if (report) {
      const blob = new Blob([report], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `readiness_report_${tender.reference_number}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    }
  };

  // Parse the report into sections for visual rendering
  const sections = report ? report.split(/=== (.+?) ===/).filter(Boolean) : [];

  return (
    <div className="space-y-4">
      {/* Header card */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-base">AI Tender Readiness Report</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  The AI tells you: what the tender requires, what you have, what you're missing,
                  deadlines, risks, and what needs to be done before submission.
                </p>
              </div>
            </div>
            {!report && !loading && (
              <Button onClick={handleGenerate} size="lg">
                <Sparkles className="h-4 w-4" />
                Generate Report
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Loading state */}
      {loading && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <div className="relative">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Target className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <div className="absolute -inset-2 rounded-2xl border-2 border-primary/20 animate-ping" style={{ animationDuration: "2s" }} />
            </div>
            <h3 className="font-semibold mt-4">AI is analyzing your tender…</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Reading the tender requirements, checking your checklist, reviewing deadlines,
              identifying risks, and building your action plan. This usually takes 20-40 seconds.
            </p>
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-4" />
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={handleGenerate}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Report display */}
      {report && !loading && (
        <>
          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleGenerate}>
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-3.5 w-3.5" />
              Download
            </Button>
          </div>

          {/* Render the report sections */}
          {sections.length > 1 ? (
            <div className="space-y-3">
              {sections.map((section, i) => {
                // Even indices (0, 2, 4...) are section titles, odd are content
                if (i % 2 === 0) {
                  const title = section.trim();
                  const content = sections[i + 1]?.trim() || "";
                  const iconMap: Record<string, any> = {
                    "WHAT THE TENDER REQUIRES": FileText,
                    "WHAT YOU HAVE": CheckCircle2,
                    "WHAT YOU ARE MISSING": AlertTriangle,
                    "DEADLINES": Calendar,
                    "RISKS": AlertTriangle,
                    "WHAT NEEDS TO BE DONE BEFORE SUBMISSION": ListChecks,
                    "READINESS SCORE": Target,
                  };
                  const Icon = iconMap[title] || FileText;
                  const isMissing = title.includes("MISSING");
                  const isRisks = title.includes("RISKS");
                  const isScore = title.includes("SCORE");

                  return (
                    <Card key={i} className={cn(
                      isMissing && "border-amber-300 dark:border-amber-800",
                      isRisks && "border-rose-300 dark:border-rose-800",
                      isScore && "border-primary/40 bg-primary/5",
                    )}>
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 text-sm">
                          <Icon className={cn(
                            "h-4 w-4",
                            isMissing && "text-amber-600",
                            isRisks && "text-rose-600",
                            isScore && "text-primary",
                            !isMissing && !isRisks && !isScore && "text-primary",
                          )} />
                          {title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <pre className="text-sm whitespace-pre-wrap font-sans">{content}</pre>
                      </CardContent>
                    </Card>
                  );
                }
                return null;
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="p-4">
                <pre className="text-sm whitespace-pre-wrap font-sans">{report}</pre>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Empty state */}
      {!report && !loading && !error && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Target className="h-7 w-7 text-primary" />
            </div>
            <h3 className="font-semibold">Generate your readiness report</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              The AI will analyze everything about this tender and tell you exactly:
              what it requires, what you have, what you're missing, the deadlines, the risks,
              and what needs to be done before submission — plus a readiness score out of 100.
            </p>
            <Button className="mt-4" onClick={handleGenerate} size="lg">
              <Sparkles className="h-4 w-4" />
              Generate Readiness Report
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============== Preparation Section ==============
function PreparationSection({ tender, onChanged }: { tender: any; onChanged: () => void }) {
  const checklist = tender.checklist_items || [];
  const [updating, setUpdating] = useState<number | null>(null);

  // Calculate completion stats
  const total = checklist.length;
  const complete = checklist.filter((c: any) => c.status === "Complete").length;
  const outstanding = checklist.filter((c: any) => c.status === "Outstanding").length;
  const expired = checklist.filter((c: any) => c.status === "Expired").length;
  const na = checklist.filter((c: any) => c.status === "Not Applicable").length;
  // Percentage: complete / (total - N/A) to exclude N/A items from the denominator
  const eligible = total - na;
  const pct = eligible > 0 ? Math.round((complete / eligible) * 100) : 0;

  // Group by category
  const categoryOrder = ["Compliance", "Company", "Technical", "Methodology", "Pricing", "Forms", "Personnel", "References", "Other"];
  const grouped = checklist.reduce((acc: any, item: any) => {
    const cat = item.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});
  const categories = Object.keys(grouped).sort((a, b) => {
    const ia = categoryOrder.indexOf(a);
    const ib = categoryOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const handleToggle = async (item: any) => {
    setUpdating(item.id);
    const newStatus = item.status === "Complete" ? "Outstanding" : "Complete";
    try {
      await api.updateChecklistItem(item.id, { status: newStatus });
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Update failed");
    } finally {
      setUpdating(null);
    }
  };

  // Status icon
  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "Complete") return <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />;
    if (status === "Expired") return <XCircle className="h-5 w-5 text-rose-600 shrink-0" />;
    if (status === "Not Applicable") return <X className="h-5 w-5 text-muted-foreground shrink-0" />;
    return <Clock className="h-5 w-5 text-amber-500 shrink-0" />;
  };

  return (
    <div className="space-y-4">
      {/* Big progress card */}
      <Card className={cn(
        "border-2",
        pct === 100 ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
        : pct >= 50 ? "border-amber-300 dark:border-amber-800"
        : "border-rose-300 dark:border-rose-800"
      )}>
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row items-center gap-6">
            {/* Circular progress */}
            <div className="relative shrink-0">
              <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/30" />
                <circle
                  cx="60" cy="60" r="52" fill="none" strokeWidth="10" strokeLinecap="round"
                  className={pct === 100 ? "text-emerald-500" : pct >= 50 ? "text-amber-500" : "text-rose-500"}
                  strokeDasharray={`${2 * Math.PI * 52}`}
                  strokeDashoffset={`${2 * Math.PI * 52 * (1 - pct / 100)}`}
                  style={{ transition: "stroke-dashoffset 0.5s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn(
                  "text-3xl font-bold tabular-nums",
                  pct === 100 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-rose-600"
                )}>
                  {pct}%
                </span>
                <span className="text-xs text-muted-foreground">complete</span>
              </div>
            </div>

            {/* Stats */}
            <div className="flex-1 w-full">
              <h3 className="font-semibold text-lg flex items-center gap-2 mb-3">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                Tender Preparation Status
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {pct === 100
                  ? "🎉 All preparation items complete — ready for submission!"
                  : `${outstanding} item${outstanding === 1 ? "" : "s"} still outstanding${expired > 0 ? `, ${expired} expired` : ""}`}
              </p>
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-3 text-center">
                  <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{complete}</div>
                  <div className="text-xs text-muted-foreground">Complete ✓</div>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
                  <div className="text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">{outstanding}</div>
                  <div className="text-xs text-muted-foreground">Outstanding</div>
                </div>
                <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 p-3 text-center">
                  <div className="text-2xl font-bold text-rose-700 dark:text-rose-400 tabular-nums">{expired}</div>
                  <div className="text-xs text-muted-foreground">Expired</div>
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <div className="text-2xl font-bold text-muted-foreground tabular-nums">{na}</div>
                  <div className="text-xs text-muted-foreground">N/A</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preparation checklist by category */}
      {checklist.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <ClipboardCheck className="h-7 w-7 text-primary" />
            </div>
            <h3 className="font-semibold">No preparation items yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Upload and run AI extraction on the tender document to automatically generate a preparation checklist.
              Or go to the Checklist tab to add items manually.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {categories.map((cat) => {
            const items = grouped[cat];
            const catComplete = items.filter((i: any) => i.status === "Complete").length;
            const catEligible = items.filter((i: any) => i.status !== "Not Applicable").length;
            const catPct = catEligible > 0 ? Math.round((catComplete / catEligible) * 100) : 0;
            return (
              <Card key={cat}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <CategoryIcon category={cat} />
                      {cat}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {catComplete}/{catEligible} done
                      </Badge>
                      <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all",
                            catPct === 100 ? "bg-emerald-500" : catPct >= 50 ? "bg-amber-500" : "bg-rose-500"
                          )}
                          style={{ width: `${catPct}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground tabular-nums w-8 text-right">
                        {catPct}%
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1">
                    {items.map((item: any) => (
                      <button
                        key={item.id}
                        onClick={() => handleToggle(item)}
                        disabled={updating === item.id || item.status === "Not Applicable" || item.status === "Expired"}
                        className={cn(
                          "w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors",
                          item.status === "Not Applicable" || item.status === "Expired"
                            ? "cursor-not-allowed opacity-60"
                            : "hover:bg-muted/50 cursor-pointer"
                        )}
                      >
                        {updating === item.id ? (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground shrink-0" />
                        ) : (
                          <StatusIcon status={item.status} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-sm font-medium",
                              item.status === "Complete" && "line-through text-muted-foreground"
                            )}>
                              {item.name}
                            </span>
                            {item.mandatory === false && (
                              <Badge variant="outline" className="text-[10px] bg-muted">Optional</Badge>
                            )}
                            {item.mandatory === true && (
                              <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300">Mandatory</Badge>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                          )}
                          {item.linked_library_doc_id && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                              <Link2 className="h-3 w-3" />
                              Linked to compliance library
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                          {item.status === "Complete" ? "Click to undo" : "Click to complete"}
                        </span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Summary banner */}
      {checklist.length > 0 && (
        <Card className={cn(
          "border-2",
          pct === 100 ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20"
          : pct >= 50 ? "border-amber-300 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/10"
          : "border-rose-300 dark:border-rose-800 bg-rose-50/30 dark:bg-rose-950/10"
        )}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              pct === 100 ? "bg-emerald-100 dark:bg-emerald-950"
              : pct >= 50 ? "bg-amber-100 dark:bg-amber-950"
              : "bg-rose-100 dark:bg-rose-950"
            )}>
              {pct === 100 ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              : pct >= 50 ? <TrendingUp className="h-5 w-5 text-amber-600" />
              : <AlertTriangle className="h-5 w-5 text-rose-600" />}
            </div>
            <div>
              <div className="font-semibold text-sm">
                {pct === 100
                  ? "Ready for submission!"
                  : pct >= 50
                  ? "More than halfway there"
                  : "Significant work remaining"}
              </div>
              <p className="text-xs text-muted-foreground">
                {complete} of {eligible} items complete · {outstanding} outstanding{expired > 0 ? ` · ${expired} expired` : ""}
                {na > 0 ? ` · ${na} not applicable` : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============== Overview Section ==============
function OverviewSection({ tender }: { tender: any }) {
  const fields: { label: string; value: any; icon?: React.ElementType }[] = [
    { label: "Reference number", value: tender.reference_number, icon: FileText },
    { label: "Client / company", value: tender.client_company, icon: FileStack },
    { label: "Category", value: tender.category },
    { label: "Location / site", value: tender.location_site, icon: MapPin },
    { label: "Issue date", value: formatDate(tender.issue_date) },
    { label: "Closing date", value: formatDate(tender.closing_date) },
    { label: "Closing time", value: tender.closing_time },
    { label: "Validity period", value: tender.validity_period },
    { label: "Estimated value", value: formatCurrency(tender.estimated_value) },
    { label: "Contract period", value: tender.contract_period },
    { label: "Contact person", value: tender.contact_person },
    { label: "Contact email", value: tender.contact_email },
    { label: "Contact telephone", value: tender.contact_telephone },
    { label: "Submission method", value: tender.submission_method },
    { label: "Person responsible", value: tender.person_responsible },
    { label: "Outcome", value: tender.outcome },
  ];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tender details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
            {fields.map((f) => (
              <div key={f.label} className="space-y-0.5">
                <div className="text-xs text-muted-foreground">{f.label}</div>
                <div className="text-sm font-medium break-words">{f.value || <span className="text-muted-foreground">—</span>}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {tender.description && (
        <Card>
          <CardHeader><CardTitle className="text-base">Description</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{tender.description}</p>
          </CardContent>
        </Card>
      )}

      {tender.scope_of_work && (
        <Card>
          <CardHeader><CardTitle className="text-base">Scope of work</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{tender.scope_of_work}</p>
          </CardContent>
        </Card>
      )}

      {tender.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">{tender.notes}</p>
          </CardContent>
        </Card>
      )}

      {tender.unsuccessful_reason && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Unsuccessful reason:</strong> {tender.unsuccessful_reason}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ============== Documents Section ==============
function DocumentsSection({ tender, onChanged }: { tender: any; onChanged: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [deleteDoc, setDeleteDoc] = useState<any | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadTenderDocument(tender.id, file);
      toast.success("Document uploaded");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const handleExtract = async () => {
    setExtracting(true);
    toast.info("AI is reading your tender documents…");
    try {
      await api.aiExtractTender(tender.id);
      toast.success("AI extraction complete — checklist & fields updated");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "AI extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDoc) return;
    try {
      await api.deleteTenderDocument(tender.id, deleteDoc.id);
      toast.success("Document deleted");
      setDeleteDoc(null);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-sm">Tender documents</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload the tender PDF/DOCX/TXT — then let AI read it and extract requirements.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExtract}
              disabled={extracting || !tender.documents?.length}
            >
              {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              AI Extract
            </Button>
            <Button size="sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Upload document
            </Button>
            <input ref={fileInput} type="file" accept=".pdf,.doc,.docx,.txt,.csv" onChange={handleUpload} className="hidden" />
          </div>
        </CardContent>
      </Card>

      {!tender.documents?.length ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <FileStack className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold">No documents uploaded</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Upload the tender document and the AI will automatically read it, extract key information,
              and build your submission checklist.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tender.documents.map((doc: any) => (
            <Card key={doc.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{doc.original_filename}</div>
                  <div className="text-xs text-muted-foreground">
                    {doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB · ` : ""}
                    {formatDateTime(doc.uploaded_at)}
                    {doc.is_primary && <Badge variant="outline" className="ml-2 text-xs">Primary</Badge>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  asChild
                >
                  <a
                    href={`/uploads/${doc.filename}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Download"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                  onClick={() => setDeleteDoc(doc)}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteDoc} onOpenChange={(o) => !o && setDeleteDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <strong>{deleteDoc?.original_filename}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============== Checklist Section ==============
function CategoryIcon({ category }: { category: string }) {
  const iconMap: Record<string, React.ElementType> = {
    Compliance: Shield,
    Company: Building2,
    Technical: FileText,
    Methodology: ListChecks,
    Pricing: Calculator,
    Forms: FileText,
    Personnel: Users,
    References: User,
    Other: FileStack,
  };
  const Icon = iconMap[category] || FileStack;
  return <Icon className="h-4 w-4 text-primary" />;
}
function ChecklistSection({ tender, onChanged }: { tender: any; onChanged: () => void }) {
  const [items, setItems] = useState<any[]>(tender.checklist_items || []);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [libraryDocs, setLibraryDocs] = useState<any[]>([]);
  const [showLink, setShowLink] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const [verification, setVerification] = useState<Record<number, any>>({});

  useEffect(() => {
    setItems(tender.checklist_items || []);
  }, [tender.checklist_items]);

  useEffect(() => {
    api.listLibrary().then((r) => setLibraryDocs(r.items)).catch(() => {});
  }, []);

  const updateItem = async (id: number, payload: any) => {
    try {
      await api.updateChecklistItem(id, payload);
      setItems((arr) => arr.map((it) => it.id === id ? { ...it, ...payload } : it));
    } catch (e: any) {
      toast.error(e.message || "Update failed");
    }
  };

  const handleUploadDocument = async (itemId: number, file: File) => {
    setUploadingId(itemId);
    toast.info("Uploading and verifying document with AI…");
    try {
      const result = await api.uploadChecklistDocument(itemId, file);
      // Update the item in the local state
      setItems((arr) => arr.map((it) => it.id === itemId ? {
        ...it,
        status: result.status,
        linked_library_doc_id: result.linked_library_doc_id,
        notes: result.notes,
      } : it));
      // Store the verification result to display
      setVerification((prev) => ({ ...prev, [itemId]: result.verification }));
      // Show toast based on verification
      if (result.verification?.matches) {
        toast.success("Document verified!", {
          description: `Detected: ${result.verification.detected_type || "Document"}. Item marked complete.`,
        });
      } else {
        toast.warning("Document may not match", {
          description: result.verification?.reason || "The AI could not confirm this is the correct document type.",
        });
      }
      onChanged();
    } catch (e: any) {
      toast.error("Upload failed", { description: e.message });
    } finally {
      setUploadingId(null);
    }
  };

  const handleUnlinkDocument = async (item: any) => {
    await updateItem(item.id, { linked_library_doc_id: null, status: "Outstanding", notes: null });
    setVerification((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });
    toast.success("Document removed — item is now outstanding");
  };

  const addItem = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const created = await api.addChecklistItem(tender.id, { name: newName.trim(), status: "Outstanding" });
      setItems((arr) => [...arr, created]);
      setNewName("");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Add failed");
    } finally {
      setAdding(false);
    }
  };

  const deleteItem = async (id: number) => {
    try {
      await api.deleteChecklistItem(id);
      setItems((arr) => arr.filter((it) => it.id !== id));
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
  };

  const linkLibraryDoc = async (itemId: number, docId: number | null) => {
    await updateItem(itemId, { linked_library_doc_id: docId, status: docId ? "Complete" : "Outstanding" });
    setShowLink(null);
    if (docId) toast.success("Document linked");
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    toast.info("AI is generating a tender-specific checklist…");
    try {
      const updated = await api.regenerateChecklist(tender.id);
      setItems(updated.checklist_items || []);
      toast.success(`Checklist regenerated with ${updated.checklist_items?.length || 0} items`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed to regenerate checklist");
    } finally {
      setRegenerating(false);
    }
  };

  const complete = items.filter((i) => i.status === "Complete").length;
  const outstanding = items.filter((i) => i.status === "Outstanding").length;
  const expired = items.filter((i) => i.status === "Expired").length;
  const na = items.filter((i) => i.status === "Not Applicable").length;
  const pct = items.length > 0 ? Math.round((complete / items.length) * 100) : 0;

  // Group items by category
  const categoryOrder = ["Compliance", "Company", "Technical", "Methodology", "Pricing", "Forms", "Personnel", "References", "Other"];
  const grouped = items.reduce((acc, item) => {
    const cat = item.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, any[]>);
  const categories = Object.keys(grouped).sort((a, b) => {
    const ia = categoryOrder.indexOf(a);
    const ib = categoryOrder.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  const hasAIExtraction = !!tender.ai_extracted_info && !tender.ai_extracted_info._error;

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-sm">Automatic Submission Checklist</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {hasAIExtraction
                  ? "Generated by AI from the tender document — specific to this tender."
                  : "Run AI extraction on the tender document to generate a tender-specific checklist."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">{pct}% complete</Badge>
              {hasAIExtraction && (
                <Button size="sm" variant="outline" onClick={handleRegenerate} disabled={regenerating}>
                  {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Regenerate
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3 text-center">
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-2">
              <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">{complete}</div>
              <div className="text-xs text-muted-foreground">Complete</div>
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-2">
              <div className="text-lg font-semibold text-amber-700 dark:text-amber-400">{outstanding}</div>
              <div className="text-xs text-muted-foreground">Outstanding</div>
            </div>
            <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 p-2">
              <div className="text-lg font-semibold text-rose-700 dark:text-rose-400">{expired}</div>
              <div className="text-xs text-muted-foreground">Expired</div>
            </div>
            <div className="rounded-lg bg-muted p-2">
              <div className="text-lg font-semibold text-muted-foreground">{na}</div>
              <div className="text-xs text-muted-foreground">N/A</div>
            </div>
          </div>
          <Progress value={pct} className="h-2" />
        </CardContent>
      </Card>

      {/* Checklist grouped by category */}
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <ListChecks className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold">No checklist items yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              {hasAIExtraction
                ? "Click 'Regenerate' above to let the AI build a tender-specific checklist, or add items manually below."
                : "Upload and run AI extraction on the tender document to automatically generate a checklist specific to this tender."}
            </p>
          </CardContent>
        </Card>
      ) : (
        categories.map((cat) => (
          <Card key={cat}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <CategoryIcon category={cat} />
                  {cat}
                </span>
                <Badge variant="outline" className="text-xs">
                  {grouped[cat].filter((i: any) => i.status === "Complete").length}/{grouped[cat].length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-1">
              {grouped[cat].map((item: any) => {
                const hasDoc = !!item.linked_library_doc_id;
                const verify = verification[item.id];
                const isUploading = uploadingId === item.id;
                return (
                <div key={item.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50 group">
                  <Select
                    value={item.status}
                    onValueChange={(v) => updateItem(item.id, { status: v })}
                  >
                    <SelectTrigger className="w-32 h-8 text-xs shrink-0 mt-0.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHECKLIST_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          <span className="flex items-center gap-1.5">
                            {s === "Complete" && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                            {s === "Outstanding" && <Clock className="h-3 w-3 text-amber-600" />}
                            {s === "Expired" && <XCircle className="h-3 w-3 text-rose-600" />}
                            {s === "Not Applicable" && <X className="h-3 w-3 text-muted-foreground" />}
                            {s}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        value={item.name}
                        onChange={(e) => setItems((arr) => arr.map((it) => it.id === item.id ? { ...it, name: e.target.value } : it))}
                        onBlur={(e) => updateItem(item.id, { name: e.target.value })}
                        className="h-7 text-sm border-0 hover:border focus-visible:border px-1 py-0"
                      />
                      {/* Status badge — Outstanding (amber) when no doc, Complete (emerald) when doc uploaded */}
                      {!hasDoc && item.status !== "Not Applicable" && (
                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200">
                          <Clock className="h-2.5 w-2.5 mr-0.5" />
                          Outstanding
                        </Badge>
                      )}
                      {hasDoc && item.status === "Complete" && (
                        <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200">
                          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                          Uploaded
                        </Badge>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 ml-1">{item.description}</p>
                    )}
                    {/* Show uploaded document info + AI verification */}
                    {hasDoc && (
                      <div className="mt-1 ml-1 space-y-1">
                        <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {libraryDocs.find((d) => d.id === item.linked_library_doc_id)?.name || "Document uploaded"}
                          {item.status === "Expired" && (
                            <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 ml-1">
                              Expired
                            </Badge>
                          )}
                        </div>
                        {/* AI verification result */}
                        {verify && (
                          <div className={cn(
                            "text-[11px] rounded px-2 py-1 flex items-start gap-1.5",
                            verify.matches
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400"
                          )}>
                            {verify.matches
                              ? <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0" />
                              : <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            }
                            <span>
                              <strong>AI:</strong> {verify.detected_type}
                              {verify.key_info && verify.key_info !== "None found" ? ` · ${verify.key_info}` : ""}
                              {" — "}
                              {verify.reason}
                            </span>
                          </div>
                        )}
                        {item.notes && !verify && (
                          <p className="text-[11px] text-muted-foreground ml-1">{item.notes}</p>
                        )}
                      </div>
                    )}
                    {/* Hint to upload when no doc */}
                    {!hasDoc && item.status !== "Not Applicable" && (
                      <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1 ml-1">
                        <Upload className="h-3 w-3" />
                        Upload document to complete this item
                      </div>
                    )}
                  </div>
                  {/* Upload document button */}
                  {item.status !== "Not Applicable" && (
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      {hasDoc ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-rose-600 hover:bg-rose-50"
                          onClick={() => handleUnlinkDocument(item)}
                          disabled={isUploading}
                          title="Remove document"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <label className="cursor-pointer">
                          <span className={cn(
                            "inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium transition-colors",
                            "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
                            isUploading && "opacity-60 cursor-wait"
                          )}>
                            {isUploading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Upload className="h-3.5 w-3.5" />
                            )}
                            {isUploading ? "Verifying…" : "Upload"}
                          </span>
                          <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt"
                            disabled={isUploading}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadDocument(item.id, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100"
                        onClick={() => setShowLink(item.id)}
                        title="Link existing library document"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 text-rose-600 hover:text-rose-700"
                        onClick={() => deleteItem(item.id)}
                        title="Remove item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}

      {/* Add new item */}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem()}
              placeholder="Add new checklist item…"
              className="h-8 text-sm"
            />
            <Button size="sm" variant="outline" onClick={addItem} disabled={adding || !newName.trim()}>
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Link library doc dialog */}
      <Dialog open={showLink !== null} onOpenChange={(o) => !o && setShowLink(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle>Link compliance document</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 py-2">
            {libraryDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No documents in your library yet. Upload some in the Compliance Library tab.
              </p>
            ) : (
              libraryDocs.map((d) => (
                <button
                  key={d.id}
                  onClick={() => showLink !== null && linkLibraryDoc(showLink, d.id)}
                  className="w-full text-left p-2 rounded-lg hover:bg-accent flex items-center gap-2"
                >
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{d.category}</div>
                  </div>
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => showLink !== null && linkLibraryDoc(showLink, null)}>Unlink</Button>
            <Button variant="ghost" onClick={() => setShowLink(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============== Briefings Section ==============
function BriefingsSection({ tender, onChanged }: { tender: any; onChanged: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    briefing_type: "Briefing",
    date: "",
    time: "",
    location: "",
    contact_person: "",
    attendance_required: true,
    attendance_confirmed: false,
    person_attending: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const briefings = tender.briefings || [];

  const handleAdd = async () => {
    if (!form.date) { toast.error("Date is required"); return; }
    setSaving(true);
    try {
      await api.createBriefing(tender.id, {
        ...form,
        time: form.time || null,
      });
      toast.success("Briefing added");
      setShowAdd(false);
      setForm({
        briefing_type: "Briefing", date: "", time: "", location: "",
        contact_person: "", attendance_required: true, attendance_confirmed: false,
        person_attending: "", notes: "",
      });
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleConfirmed = async (b: any) => {
    try {
      await api.updateBriefing(b.id, { attendance_confirmed: !b.attendance_confirmed });
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Update failed");
    }
  };

  const handleDelete = async (b: any) => {
    try {
      await api.deleteBriefing(b.id);
      toast.success("Briefing deleted");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Briefings & site inspections</h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {briefings.length === 0 ? (
        <Card>
          <CardContent className="py-10 flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <MapPin className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold">No briefings scheduled</h3>
            <p className="text-sm text-muted-foreground mt-1">Track compulsory briefings and site inspections here.</p>
          </CardContent>
        </Card>
      ) : (
        briefings.map((b: any) => {
          const days = daysUntil(b.date);
          return (
            <Card key={b.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={cn(
                        "text-xs",
                        b.briefing_type === "Briefing" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                      )}>
                        {b.briefing_type}
                      </Badge>
                      {b.attendance_required && (
                        <Badge variant="outline" className="text-xs">Compulsory</Badge>
                      )}
                      <span className={cn("text-xs font-medium", deadlineColor(days))}>
                        {formatDate(b.date)} {b.time && `at ${b.time}`}
                      </span>
                    </div>
                    {b.location && <div className="text-sm">{b.location}</div>}
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                      {b.contact_person && <div>Contact: {b.contact_person}</div>}
                      {b.person_attending && <div>Attending: {b.person_attending}</div>}
                      {b.notes && <div className="mt-1 italic">{b.notes}</div>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Button
                      size="sm"
                      variant={b.attendance_confirmed ? "default" : "outline"}
                      onClick={() => toggleConfirmed(b)}
                    >
                      {b.attendance_confirmed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                      {b.attendance_confirmed ? "Confirmed" : "Mark confirmed"}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => handleDelete(b)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {b.attendance_required && !b.attendance_confirmed && days !== null && days >= 0 && days <= 7 && (
                  <div className="mt-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded p-2 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3" />
                    Attendance confirmation required — briefing is within {days} day{days === 1 ? "" : "s"}!
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader><DialogTitle>Add briefing / site inspection</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <Field2 label="Type">
              <Select value={form.briefing_type} onValueChange={(v) => setForm({ ...form, briefing_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Briefing">Briefing</SelectItem>
                  <SelectItem value="Site Inspection">Site Inspection</SelectItem>
                </SelectContent>
              </Select>
            </Field2>
            <Field2 label="Date *">
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </Field2>
            <Field2 label="Time">
              <Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </Field2>
            <Field2 label="Location">
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Field2>
            <Field2 label="Contact person">
              <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
            </Field2>
            <Field2 label="Person attending">
              <Input value={form.person_attending} onChange={(e) => setForm({ ...form, person_attending: e.target.value })} />
            </Field2>
            <div className="col-span-2 flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.attendance_required} onCheckedChange={(v) => setForm({ ...form, attendance_required: v })} />
                Attendance required
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.attendance_confirmed} onCheckedChange={(v) => setForm({ ...form, attendance_confirmed: v })} />
                Attendance confirmed
              </label>
            </div>
            <div className="col-span-2">
              <Field2 label="Notes">
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
              </Field2>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? "Saving…" : "Add briefing"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============== Pricing Section ==============
function PricingSection({ tender, onChanged }: { tender: any; onChanged: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<any[]>([{ category: "Labour", description: "", quantity: 1, rate: 0 }]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const versions = tender.pricing_versions || [];

  const subtotal = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.rate) || 0), 0);
  const vat = subtotal * 0.15;
  const total = subtotal + vat;

  const handleAdd = async () => {
    setSaving(true);
    try {
      await api.createPricing(tender.id, {
        tender_id: tender.id,
        version_label: label || undefined,
        notes: notes || undefined,
        line_items: items.map((it) => ({
          ...it,
          total: (Number(it.quantity) || 0) * (Number(it.rate) || 0),
        })),
      });
      toast.success("Pricing version saved");
      setShowAdd(false);
      setLabel(""); setNotes(""); setItems([{ category: "Labour", description: "", quantity: 1, rate: 0 }]);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deletePricing(deleteTarget.id);
      toast.success("Version deleted");
      setDeleteTarget(null);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Pricing versions</h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5" />
          New version
        </Button>
      </div>

      {versions.length === 0 ? (
        <Card>
          <CardContent className="py-10 flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <Calculator className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold">No pricing versions yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Build your first pricing sheet with labour, equipment, transport and other costs.</p>
          </CardContent>
        </Card>
      ) : (
        [...versions].reverse().map((v: any) => (
          <Card key={v.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">v{v.version_number}</Badge>
                  <span className="font-medium text-sm">{v.version_label || `Version ${v.version_number}`}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(v.created_at)}</span>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => setDeleteTarget(v)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {v.line_items && v.line_items.length > 0 && (
                <div className="overflow-x-auto scrollbar-thin">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-1 pr-2">Category</th>
                        <th className="py-1 pr-2">Description</th>
                        <th className="py-1 pr-2 text-right">Qty</th>
                        <th className="py-1 pr-2 text-right">Rate</th>
                        <th className="py-1 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.line_items.map((li: any, i: number) => (
                        <tr key={i} className="border-b last:border-b-0">
                          <td className="py-1 pr-2"><Badge variant="outline" className="text-[10px]">{li.category}</Badge></td>
                          <td className="py-1 pr-2">{li.description || "—"}</td>
                          <td className="py-1 pr-2 text-right">{li.quantity}</td>
                          <td className="py-1 pr-2 text-right">{formatCurrency(li.rate)}</td>
                          <td className="py-1 text-right font-medium">{formatCurrency(li.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex justify-end mt-3 gap-6 text-sm">
                <div><span className="text-muted-foreground">Subtotal:</span> <span className="font-medium">{formatCurrency(v.subtotal)}</span></div>
                <div><span className="text-muted-foreground">VAT (15%):</span> <span className="font-medium">{formatCurrency(v.vat)}</span></div>
                <div className="text-base"><span className="text-muted-foreground">Total:</span> <span className="font-bold text-emerald-600">{formatCurrency(v.total)}</span></div>
              </div>
              {v.notes && <p className="text-xs text-muted-foreground mt-2 italic">{v.notes}</p>}
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader><DialogTitle>New pricing version</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <Field2 label="Version label (optional)">
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Draft, Final, Revised" />
              </Field2>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left text-xs font-medium">Category</th>
                    <th className="p-2 text-left text-xs font-medium">Description</th>
                    <th className="p-2 text-right text-xs font-medium w-20">Qty</th>
                    <th className="p-2 text-right text-xs font-medium w-28">Rate (ZAR)</th>
                    <th className="p-2 text-right text-xs font-medium w-28">Total</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-1">
                        <Select value={it.category} onValueChange={(v) => setItems(arr => arr.map((x, i) => i === idx ? { ...x, category: v } : x))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["Labour", "Equipment", "Consumables", "Transport", "Other"].map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-1">
                        <Input value={it.description} onChange={(e) => setItems(arr => arr.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} className="h-8 text-xs" />
                      </td>
                      <td className="p-1">
                        <Input type="number" value={it.quantity} onChange={(e) => setItems(arr => arr.map((x, i) => i === idx ? { ...x, quantity: parseFloat(e.target.value) || 0 } : x))} className="h-8 text-xs text-right" />
                      </td>
                      <td className="p-1">
                        <Input type="number" value={it.rate} onChange={(e) => setItems(arr => arr.map((x, i) => i === idx ? { ...x, rate: parseFloat(e.target.value) || 0 } : x))} className="h-8 text-xs text-right" />
                      </td>
                      <td className="p-2 text-right text-xs font-medium">{formatCurrency((Number(it.quantity) || 0) * (Number(it.rate) || 0))}</td>
                      <td className="p-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => setItems(arr => arr.filter((_, i) => i !== idx))}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" onClick={() => setItems([...items, { category: "Labour", description: "", quantity: 1, rate: 0 }])}>
              <Plus className="h-3.5 w-3.5" /> Add line item
            </Button>
            <div className="flex justify-end gap-6 text-sm border-t pt-3">
              <div><span className="text-muted-foreground">Subtotal:</span> <span className="font-medium">{formatCurrency(subtotal)}</span></div>
              <div><span className="text-muted-foreground">VAT (15%):</span> <span className="font-medium">{formatCurrency(vat)}</span></div>
              <div><span className="text-muted-foreground">Total:</span> <span className="font-bold text-emerald-600 text-base">{formatCurrency(total)}</span></div>
            </div>
            <Field2 label="Notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </Field2>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? "Saving…" : "Save version"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete pricing version?</AlertDialogTitle>
            <AlertDialogDescription>Delete {deleteTarget?.version_label || `v${deleteTarget?.version_number}`}?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============== Submission Section ==============
function SubmissionSection({ tender, onChanged }: { tender: any; onChanged: () => void }) {
  const sub = tender.submission;
  const [form, setForm] = useState({
    submission_date: sub?.submission_date || "",
    submission_time: sub?.submission_time || "",
    submission_method: sub?.submission_method || "",
    submitted_by: sub?.submitted_by || "",
    confirmation_reference: sub?.confirmation_reference || "",
    final_pricing: sub?.final_pricing?.toString() || "",
    notes: sub?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState(tender.outcome || "Pending");
  const [reason, setReason] = useState(tender.unsuccessful_reason || "");
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [uploadingConfirmation, setUploadingConfirmation] = useState(false);
  const [uploadingDocuments, setUploadingDocuments] = useState(false);
  const confirmationInputRef = useRef<HTMLInputElement>(null);
  const documentsInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveSubmission(tender.id, {
        tender_id: tender.id,
        submission_date: form.submission_date || null,
        submission_time: form.submission_time || null,
        submission_method: form.submission_method || null,
        submitted_by: form.submitted_by || null,
        confirmation_reference: form.confirmation_reference || null,
        final_pricing: form.final_pricing ? parseFloat(form.final_pricing) : null,
        notes: form.notes || null,
      });
      toast.success("Submission saved");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleOutcome = async () => {
    setSavingOutcome(true);
    try {
      await api.updateTender(tender.id, {
        outcome,
        unsuccessful_reason: outcome === "Unsuccessful" ? reason : null,
      });
      toast.success("Outcome updated");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSavingOutcome(false);
    }
  };

  const handleUploadConfirmation = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingConfirmation(true);
    try {
      await api.uploadSubmissionConfirmation(tender.id, file);
      toast.success("Submission confirmation uploaded");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploadingConfirmation(false);
      if (confirmationInputRef.current) confirmationInputRef.current.value = "";
    }
  };

  const handleDeleteConfirmation = async () => {
    try {
      await api.deleteSubmissionConfirmation(tender.id);
      toast.success("Confirmation file removed");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  };

  const handleUploadDocuments = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingDocuments(true);
    try {
      await api.uploadFinalDocuments(tender.id, file);
      toast.success("Final documents uploaded");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploadingDocuments(false);
      if (documentsInputRef.current) documentsInputRef.current.value = "";
    }
  };

  const handleDeleteDocuments = async () => {
    try {
      await api.deleteFinalDocuments(tender.id);
      toast.success("Final documents removed");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  };

  return (
    <div className="space-y-4">
      {/* Submission details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            Submission Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field2 label="Submission date">
              <Input type="date" value={form.submission_date} onChange={(e) => setForm({ ...form, submission_date: e.target.value })} />
            </Field2>
            <Field2 label="Submission time">
              <Input type="time" value={form.submission_time} onChange={(e) => setForm({ ...form, submission_time: e.target.value })} />
            </Field2>
            <Field2 label="Submission method">
              <Select value={form.submission_method} onValueChange={(v) => setForm({ ...form, submission_method: v })}>
                <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                <SelectContent>
                  {["Email", "Online Portal", "Physical Delivery", "Courier", "E-procurement portal", "Other"].map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field2>
            <Field2 label="Submitted by">
              <Input value={form.submitted_by} onChange={(e) => setForm({ ...form, submitted_by: e.target.value })} placeholder="Who submitted the tender" />
            </Field2>
            <Field2 label="Submission/reference number">
              <Input value={form.confirmation_reference} onChange={(e) => setForm({ ...form, confirmation_reference: e.target.value })} placeholder="e.g. Bid submission ref / RFQ-2025-001" />
            </Field2>
            <Field2 label="Final pricing (ZAR)">
              <Input type="number" value={form.final_pricing} onChange={(e) => setForm({ ...form, final_pricing: e.target.value })} placeholder="Total tender price submitted" />
            </Field2>
          </div>
          <Field2 label="Notes">
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Any notes about the submission..." />
          </Field2>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save submission"}
          </Button>
        </CardContent>
      </Card>

      {/* Submission confirmation file */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-primary" />
            Submission Confirmation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Upload the submission confirmation/receipt you received when submitting the tender (email confirmation, portal receipt, courier proof, etc.)
          </p>
          <input ref={confirmationInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.png,.txt" onChange={handleUploadConfirmation} className="hidden" />
          {sub?.confirmation_file_url ? (
            <div className="flex items-center gap-2 rounded-lg border p-3 bg-emerald-50/50 dark:bg-emerald-950/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">Confirmation uploaded</div>
                <a href={sub.confirmation_file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Download className="h-3 w-3" />
                  View / Download
                </a>
              </div>
              <Button size="sm" variant="outline" onClick={() => confirmationInputRef.current?.click()} disabled={uploadingConfirmation}>
                {uploadingConfirmation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Replace
              </Button>
              <Button size="sm" variant="ghost" className="text-rose-600" onClick={handleDeleteConfirmation}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => confirmationInputRef.current?.click()} disabled={uploadingConfirmation} className="w-full border-dashed">
              {uploadingConfirmation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploadingConfirmation ? "Uploading…" : "Upload Submission Confirmation"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Final submitted documents */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileStack className="h-4 w-4 text-primary" />
            Final Submitted Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Upload the final submitted tender documents (the complete PDF bundle that was submitted to the client)
          </p>
          <input ref={documentsInputRef} type="file" accept=".pdf,.doc,.docx,.zip" onChange={handleUploadDocuments} className="hidden" />
          {sub?.final_documents_url ? (
            <div className="flex items-center gap-2 rounded-lg border p-3 bg-emerald-50/50 dark:bg-emerald-950/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">Final documents uploaded</div>
                <a href={sub.final_documents_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Download className="h-3 w-3" />
                  View / Download
                </a>
              </div>
              <Button size="sm" variant="outline" onClick={() => documentsInputRef.current?.click()} disabled={uploadingDocuments}>
                {uploadingDocuments ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Replace
              </Button>
              <Button size="sm" variant="ghost" className="text-rose-600" onClick={handleDeleteDocuments}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => documentsInputRef.current?.click()} disabled={uploadingDocuments} className="w-full border-dashed">
              {uploadingDocuments ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploadingDocuments ? "Uploading…" : "Upload Final Documents"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Tender outcome */}
      <Card>
        <CardHeader><CardTitle className="text-base">Tender outcome</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Field2 label="Outcome">
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TENDER_OUTCOMES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field2>
          {outcome === "Unsuccessful" && (
            <Field2 label="Reason for unsuccessful bid">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Lower price competitor, missing documentation, etc." />
            </Field2>
          )}
          <Button onClick={handleOutcome} disabled={savingOutcome}>
            {savingOutcome ? "Saving…" : "Update outcome"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ============== Communications Section ==============
function CommunicationsSection({ tender, onChanged }: { tender: any; onChanged: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    comm_type: "Email",
    subject: "",
    body: "",
    comm_date: new Date().toISOString().slice(0, 16),
    from_party: "",
    to_party: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const comms = tender.communications || [];

  const handleAdd = async () => {
    if (!form.comm_type) { toast.error("Type is required"); return; }
    setSaving(true);
    try {
      await api.createCommunication(tender.id, {
        tender_id: tender.id,
        ...form,
        comm_date: form.comm_date ? new Date(form.comm_date).toISOString() : null,
      });
      toast.success("Communication logged");
      setShowAdd(false);
      setForm({ comm_type: "Email", subject: "", body: "", comm_date: new Date().toISOString().slice(0, 16), from_party: "", to_party: "", notes: "" });
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: any) => {
    try {
      await api.deleteCommunication(c.id);
      toast.success("Deleted");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  };

  const COMM_TYPES = ["Email", "Clarification Request", "Clarification Response", "Meeting Invitation", "Meeting Notes", "Pricing Clarification", "Client Correspondence", "Addendum", "Tender Extension", "Tender Validity Extension", "Other"];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Communication log ({comms.length})</h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5" />
          Log communication
        </Button>
      </div>

      {comms.length === 0 ? (
        <Card>
          <CardContent className="py-10 flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <MessageSquare className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold">No communications logged</h3>
            <p className="text-sm text-muted-foreground mt-1">Track emails, clarifications, meetings and addendums here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {[...comms].reverse().map((c: any) => (
            <Card key={c.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">{c.comm_type}</Badge>
                      {c.comm_date && <span className="text-xs text-muted-foreground">{formatDateTime(c.comm_date)}</span>}
                    </div>
                    {c.subject && <div className="font-medium text-sm">{c.subject}</div>}
                    {(c.from_party || c.to_party) && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {c.from_party && <>From: {c.from_party}</>}
                        {c.from_party && c.to_party && " → "}
                        {c.to_party && <>To: {c.to_party}</>}
                      </div>
                    )}
                    {c.body && <p className="text-sm mt-1 line-clamp-3 whitespace-pre-wrap">{c.body}</p>}
                    {c.notes && <p className="text-xs text-muted-foreground mt-1 italic">{c.notes}</p>}
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600 shrink-0" onClick={() => handleDelete(c)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader><DialogTitle>Log communication</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <Field2 label="Type">
                <Select value={form.comm_type} onValueChange={(v) => setForm({ ...form, comm_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMM_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field2>
              <Field2 label="Date & time">
                <Input type="datetime-local" value={form.comm_date} onChange={(e) => setForm({ ...form, comm_date: e.target.value })} />
              </Field2>
            </div>
            <Field2 label="Subject">
              <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </Field2>
            <div className="grid grid-cols-2 gap-3">
              <Field2 label="From">
                <Input value={form.from_party} onChange={(e) => setForm({ ...form, from_party: e.target.value })} />
              </Field2>
              <Field2 label="To">
                <Input value={form.to_party} onChange={(e) => setForm({ ...form, to_party: e.target.value })} />
              </Field2>
            </div>
            <Field2 label="Body">
              <Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4} />
            </Field2>
            <Field2 label="Notes">
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </Field2>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? "Saving…" : "Log"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============== Addendums Section ==============
function AddendumsSection({ tender, onChanged }: { tender: any; onChanged: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ addendum_number: "", title: "", description: "", issued_date: "" });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState<number | null>(null);

  const addendums = tender.addendums || [];

  const handleAdd = async () => {
    if (!form.title || !file) { toast.error("Title and file are required"); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("file", file);
      if (form.addendum_number) fd.append("addendum_number", form.addendum_number);
      if (form.description) fd.append("description", form.description);
      if (form.issued_date) fd.append("issued_date", form.issued_date);
      await api.createAddendum(tender.id, fd);
      toast.success("Addendum uploaded");
      setShowAdd(false);
      setForm({ addendum_number: "", title: "", description: "", issued_date: "" });
      setFile(null);
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleAnalyze = async (a: any) => {
    setAnalyzing(a.id);
    toast.info("Running AI change detection — this may take 30-60 seconds…");
    try {
      const result = await api.analyzeAddendum(a.id);
      if (result._error) {
        toast.error("AI analysis failed: " + result._error);
      } else {
        toast.success("AI analysis complete");
      }
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setAnalyzing(null);
    }
  };

  const handleDelete = async (a: any) => {
    try {
      await api.deleteAddendum(a.id);
      toast.success("Addendum deleted");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Tender addendums ({addendums.length})</h3>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5" />
          Upload addendum
        </Button>
      </div>

      {addendums.length === 0 ? (
        <Card>
          <CardContent className="py-10 flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <FileDiff className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold">No addendums uploaded</h3>
            <p className="text-sm text-muted-foreground mt-1">Upload client addendums and AI will highlight what changed.</p>
          </CardContent>
        </Card>
      ) : (
        addendums.map((a: any) => (
          <Card key={a.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {a.addendum_number && <Badge variant="outline" className="text-xs">{a.addendum_number}</Badge>}
                    <span className="font-medium text-sm">{a.title}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {a.issued_date && <>Issued: {formatDate(a.issued_date)} · </>}
                    Added: {formatDateTime(a.created_at)}
                    {a.file_path && (
                      <> · <a href={`/uploads/${a.file_path}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Download</a></>
                    )}
                  </div>
                  {a.description && <p className="text-sm mt-1">{a.description}</p>}
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-600" onClick={() => handleDelete(a)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {a.ai_changes ? (
                <div className="mt-3 border rounded-lg p-3 bg-violet-50/50 dark:bg-violet-950/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-violet-600" />
                    <span className="text-sm font-semibold">AI Change Detection</span>
                  </div>
                  {a.ai_changes._error ? (
                    <Alert variant="destructive">
                      <AlertDescription>{a.ai_changes._error}</AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {a.ai_changes.new_requirements?.length > 0 && (
                        <ChangeList title="New requirements" items={a.ai_changes.new_requirements} color="emerald" />
                      )}
                      {a.ai_changes.removed_requirements?.length > 0 && (
                        <ChangeList title="Removed requirements" items={a.ai_changes.removed_requirements} color="rose" />
                      )}
                      {a.ai_changes.changed_dates?.length > 0 && (
                        <div>
                          <div className="font-semibold mb-1">Changed dates:</div>
                          <div className="space-y-1">
                            {a.ai_changes.changed_dates.map((d: any, i: number) => (
                              <div key={i} className="flex items-center gap-2">
                                <span className="font-medium">{d.field}:</span>
                                <span className="line-through text-muted-foreground">{d.from}</span>
                                <span>→</span>
                                <span className="text-emerald-700 font-medium">{d.to}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {a.ai_changes.changed_pricing?.length > 0 && (
                        <ChangeList title="Changed pricing" items={a.ai_changes.changed_pricing} color="amber" />
                      )}
                      {a.ai_changes.changed_scope?.length > 0 && (
                        <ChangeList title="Changed scope" items={a.ai_changes.changed_scope} color="cyan" />
                      )}
                      {a.ai_changes.changed_submission?.length > 0 && (
                        <ChangeList title="Changed submission" items={a.ai_changes.changed_submission} color="violet" />
                      )}
                      {a.ai_changes.other_changes?.length > 0 && (
                        <ChangeList title="Other changes" items={a.ai_changes.other_changes} color="muted" />
                      )}
                      {a.ai_changes.summary && (
                        <div className="mt-2 p-2 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200">
                          <strong>Summary:</strong> {a.ai_changes.summary}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => handleAnalyze(a)}
                  disabled={analyzing === a.id}
                >
                  {analyzing === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  Analyze with AI
                </Button>
              )}
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader><DialogTitle>Upload addendum</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <Field2 label="Addendum number (optional)">
                <Input value={form.addendum_number} onChange={(e) => setForm({ ...form, addendum_number: e.target.value })} placeholder="e.g. 1, A" />
              </Field2>
              <Field2 label="Issued date">
                <Input type="date" value={form.issued_date} onChange={(e) => setForm({ ...form, issued_date: e.target.value })} />
              </Field2>
            </div>
            <Field2 label="Title *">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field2>
            <Field2 label="Description">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </Field2>
            <Field2 label="Addendum file *">
              <Input type="file" accept=".pdf,.doc,.docx,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </Field2>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !file || !form.title}>{saving ? "Uploading…" : "Upload"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChangeList({ title, items, color }: { title: string; items: string[]; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-700",
    rose: "text-rose-700",
    amber: "text-amber-700",
    cyan: "text-cyan-700",
    violet: "text-violet-700",
    muted: "text-muted-foreground",
  };
  return (
    <div>
      <div className={cn("font-semibold mb-1", colorMap[color])}>{title}:</div>
      <ul className="ml-4 space-y-0.5">
        {items.map((it, i) => (
          <li key={i} className="list-disc">{it}</li>
        ))}
      </ul>
    </div>
  );
}

// ============== AI Section ==============
function AISection({ tender, onChanged }: { tender: any; onChanged: () => void }) {
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [generatingDoc, setGeneratingDoc] = useState(false);

  const handleGenerateSummary = async () => {
    setGeneratingSummary(true);
    toast.info("Generating AI summary…");
    try {
      await api.aiTenderSummary(tender.id);
      toast.success("AI summary generated");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleGenerateDocument = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt describing what document you need");
      return;
    }
    setGeneratingDoc(true);
    try {
      // Step 1: start the job (returns immediately with job_id)
      const startRes = await api.generateDocumentByPrompt(tender.id, prompt.trim(), docTitle.trim() || undefined);
      const jobId = startRes.job_id;
      toast.success("AI is generating your document…", {
        description: "This uses full tender context — may take 20-40 seconds.",
      });

      // Step 2: poll for the result every 3 seconds, up to ~3 minutes
      const maxAttempts = 60;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const status = await api.generateDocumentByPromptStatus(tender.id, jobId);
        if (status.status === "done" && status.result) {
          toast.success("Document generated!", {
            description: "Find it in the Documents tab to view, edit, or download.",
          });
          setPrompt("");
          setDocTitle("");
          onChanged();
          setGeneratingDoc(false);
          return;
        }
        if (status.status === "error") {
          throw new Error(status.error || "AI generation failed");
        }
        // status === "pending" → keep polling
      }
      throw new Error("AI generation timed out. Please try again.");
    } catch (e: any) {
      toast.error("Generation failed", { description: e.message });
    } finally {
      setGeneratingDoc(false);
    }
  };

  const extracted = tender.ai_extracted_info;
  const hasContext = !!extracted || !!tender.ai_summary || (tender.checklist_items?.length || 0) > 0;

  return (
    <div className="space-y-4">
      {/* AI Document Generator (prompt-based) */}
      <Card className="border-violet-200 dark:border-violet-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            AI Document Generator
          </CardTitle>
          <CardDescription className="text-xs">
            Describe any document you need and the AI will generate it with full knowledge of this tender, your company, checklist progress, and uploaded documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Context indicator */}
          <div className="flex flex-wrap gap-2 text-[11px]">
            <Badge variant="outline" className={cn("border-violet-200", hasContext ? "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400" : "bg-muted")}>
              {extracted ? "✓ AI extraction" : "No AI extraction"}
            </Badge>
            <Badge variant="outline" className={cn("border-violet-200", tender.ai_summary ? "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400" : "bg-muted")}>
              {tender.ai_summary ? "✓ AI summary" : "No summary"}
            </Badge>
            <Badge variant="outline" className={cn("border-violet-200", (tender.checklist_items?.length || 0) > 0 ? "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400" : "bg-muted")}>
              {tender.checklist_items?.length || 0} checklist items
            </Badge>
            <Badge variant="outline" className={cn("border-violet-200", (tender.generated_documents?.length || 0) > 0 ? "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400" : "bg-muted")}>
              {tender.generated_documents?.length || 0} generated docs
            </Badge>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Document title (optional)</Label>
            <Input
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder="e.g. Method Statement, Cover Letter, Risk Assessment…"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">What document do you need?</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="e.g. Write a detailed method statement for providing security guarding services, including deployment plan, supervision structure, and incident response procedures."
              className="text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              "Cover letter for this tender submission",
              "Method statement with deployment plan",
              "Risk assessment with mitigation strategies",
              "Implementation plan with timeline",
              "Technical proposal addressing evaluation criteria",
              "Company profile highlighting relevant experience",
            ].map((s) => (
              <button
                key={s}
                onClick={() => setPrompt(s)}
                className="text-[11px] px-2 py-1 rounded-md border border-violet-200 text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
          <Button
            onClick={handleGenerateDocument}
            disabled={generatingDoc || !prompt.trim()}
            className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
          >
            {generatingDoc ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating (20-30s)…</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-2" /> Generate Document</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* AI Extracted Info */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-600" />
                AI Extracted Information
              </CardTitle>
              <CardDescription className="text-xs">
                Automatically read from your uploaded tender documents
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <a href={`/uploads/${tender.documents?.[0]?.filename || ""}`} target="_blank" rel="noopener noreferrer">
                <FileText className="h-3.5 w-3.5" /> View doc
              </a>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!extracted ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No AI extraction yet. Go to the Documents tab and click "AI Extract" to read the tender automatically.
            </div>
          ) : extracted._error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{extracted._error}</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3 text-sm">
              {extracted.tender_number && <KV k="Tender number" v={extracted.tender_number} />}
              {extracted.client && <KV k="Client" v={extracted.client} />}
              {extracted.tender_title && <KV k="Title" v={extracted.tender_title} />}
              {extracted.closing_date && <KV k="Closing date" v={extracted.closing_date} />}
              {extracted.closing_time && <KV k="Closing time" v={extracted.closing_time} />}
              {extracted.contract_period && <KV k="Contract period" v={extracted.contract_period} />}
              {extracted.site_locations?.length > 0 && <KV k="Site locations" v={extracted.site_locations.join(", ")} />}
              {extracted.number_of_personnel_guards && <KV k="Personnel/guards required" v={extracted.number_of_personnel_guards} />}
              {extracted.required_psira_grades?.length > 0 && <KV k="PSIRA grades" v={extracted.required_psira_grades.join(", ")} />}
              {extracted.scope_of_work && <KV k="Scope of work" v={extracted.scope_of_work} />}
              {extracted.submission_method && <KV k="Submission method" v={extracted.submission_method} />}
              {extracted.compulsory_briefing_site_inspection && <KV k="Compulsory briefing" v={extracted.compulsory_briefing_site_inspection} />}
              {extracted.briefing_date && <KV k="Briefing date" v={`${extracted.briefing_date}${extracted.briefing_time ? " " + extracted.briefing_time : ""}`} />}
              <ListSection title="Mandatory requirements" items={extracted.mandatory_requirements} />
              <ListSection title="Functionality requirements" items={extracted.functionality_requirements} />
              <ListSection title="Evaluation criteria" items={extracted.evaluation_criteria} />
              <ListSection title="Pricing requirements" items={extracted.pricing_requirements} />
              <ListSection title="Compulsory documents" items={extracted.compulsory_documents} />
              <ListSection title="Required qualifications" items={extracted.required_qualifications} />
              <ListSection title="Required equipment" items={extracted.required_equipment} />
              <ListSection title="Submission requirements" items={extracted.submission_requirements} />
              <ListSection title="Important conditions" items={extracted.important_conditions} />
              <ListSection title="Important deadlines" items={extracted.important_deadlines} />
              <ListSection title="Disqualification risks" items={extracted.disqualification_requirements} highlight="rose" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                AI Tender Summary
              </CardTitle>
              <CardDescription className="text-xs">
                A plain-English summary of this tender
              </CardDescription>
            </div>
            <Button size="sm" onClick={handleGenerateSummary} disabled={generatingSummary}>
              {generatingSummary ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {tender.ai_summary ? "Regenerate" : "Generate"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {tender.ai_summary ? (
            <pre className="text-sm whitespace-pre-wrap font-sans">{tender.ai_summary}</pre>
          ) : (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No summary yet. Click "Generate" to get a concise overview of this tender.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="text-xs font-medium text-muted-foreground">{k}</div>
      <div className="col-span-2 text-sm">{v}</div>
    </div>
  );
}

function ListSection({ title, items, highlight }: { title: string; items?: string[]; highlight?: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className={cn("text-xs font-medium mb-1", highlight === "rose" ? "text-rose-700" : "text-muted-foreground")}>
        {title}:
      </div>
      <ul className={cn("ml-4 space-y-0.5", highlight === "rose" && "text-rose-700")}>
        {items.map((it, i) => <li key={i} className="list-disc text-sm">{it}</li>)}
      </ul>
    </div>
  );
}

// ============== Edit Tender Dialog ==============
function EditTenderDialog({ tender, open, onOpenChange, onSaved }: {
  tender: any; open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        reference_number: tender.reference_number || "",
        title: tender.title || "",
        client_company: tender.client_company || "",
        description: tender.description || "",
        scope_of_work: tender.scope_of_work || "",
        category: tender.category || "",
        location_site: tender.location_site || "",
        issue_date: tender.issue_date || "",
        closing_date: tender.closing_date || "",
        closing_time: tender.closing_time || "",
        validity_period: tender.validity_period || "",
        estimated_value: tender.estimated_value?.toString() || "",
        contract_period: tender.contract_period || "",
        status: tender.status || "New Opportunity",
        contact_person: tender.contact_person || "",
        contact_email: tender.contact_email || "",
        contact_telephone: tender.contact_telephone || "",
        submission_method: tender.submission_method || "",
        person_responsible: tender.person_responsible || "",
        notes: tender.notes || "",
        outcome: tender.outcome || "Pending",
        unsuccessful_reason: tender.unsuccessful_reason || "",
      });
    }
  }, [open, tender]);

  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateTender(tender.id, {
        ...form,
        issue_date: form.issue_date || null,
        closing_date: form.closing_date || null,
        estimated_value: form.estimated_value ? parseFloat(form.estimated_value) : null,
      });
      toast.success("Tender updated");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader><DialogTitle>Edit tender</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <Field2 label="Reference number"><Input value={form.reference_number || ""} onChange={(e) => set("reference_number", e.target.value)} /></Field2>
          <Field2 label="Title"><Input value={form.title || ""} onChange={(e) => set("title", e.target.value)} /></Field2>
          <Field2 label="Client"><Input value={form.client_company || ""} onChange={(e) => set("client_company", e.target.value)} /></Field2>
          <Field2 label="Category"><Input value={form.category || ""} onChange={(e) => set("category", e.target.value)} /></Field2>
          <Field2 label="Location"><Input value={form.location_site || ""} onChange={(e) => set("location_site", e.target.value)} /></Field2>
          <Field2 label="Estimated value (ZAR)"><Input type="number" value={form.estimated_value || ""} onChange={(e) => set("estimated_value", e.target.value)} /></Field2>
          <Field2 label="Issue date"><Input type="date" value={form.issue_date || ""} onChange={(e) => set("issue_date", e.target.value)} /></Field2>
          <Field2 label="Closing date"><Input type="date" value={form.closing_date || ""} onChange={(e) => set("closing_date", e.target.value)} /></Field2>
          <Field2 label="Closing time"><Input type="time" value={form.closing_time || ""} onChange={(e) => set("closing_time", e.target.value)} /></Field2>
          <Field2 label="Validity period"><Input value={form.validity_period || ""} onChange={(e) => set("validity_period", e.target.value)} /></Field2>
          <Field2 label="Contract period"><Input value={form.contract_period || ""} onChange={(e) => set("contract_period", e.target.value)} /></Field2>
          <Field2 label="Status">
            <Select value={form.status || ""} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TENDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field2>
          <Field2 label="Outcome">
            <Select value={form.outcome || "Pending"} onValueChange={(v) => set("outcome", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TENDER_OUTCOMES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field2>
          <Field2 label="Person responsible"><Input value={form.person_responsible || ""} onChange={(e) => set("person_responsible", e.target.value)} /></Field2>
          <Field2 label="Contact person"><Input value={form.contact_person || ""} onChange={(e) => set("contact_person", e.target.value)} /></Field2>
          <Field2 label="Contact email"><Input value={form.contact_email || ""} onChange={(e) => set("contact_email", e.target.value)} /></Field2>
          <Field2 label="Contact telephone"><Input value={form.contact_telephone || ""} onChange={(e) => set("contact_telephone", e.target.value)} /></Field2>
          <Field2 label="Submission method"><Input value={form.submission_method || ""} onChange={(e) => set("submission_method", e.target.value)} /></Field2>
          <div className="sm:col-span-2"><Field2 label="Description"><Textarea value={form.description || ""} onChange={(e) => set("description", e.target.value)} rows={2} /></Field2></div>
          <div className="sm:col-span-2"><Field2 label="Scope of work"><Textarea value={form.scope_of_work || ""} onChange={(e) => set("scope_of_work", e.target.value)} rows={3} /></Field2></div>
          <div className="sm:col-span-2"><Field2 label="Notes"><Textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={2} /></Field2></div>
          {form.outcome === "Unsuccessful" && (
            <div className="sm:col-span-2"><Field2 label="Unsuccessful reason"><Textarea value={form.unsuccessful_reason || ""} onChange={(e) => set("unsuccessful_reason", e.target.value)} rows={2} /></Field2></div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field2({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// ============== Generated Documents Section ==============
const DOC_ICON_MAP: Record<string, React.ElementType> = {
  cover_letter: FileSignature,
  company_profile: Building2,
  compliance_docs: Shield,
  technical_proposal: FileCheck,
  method_statement: FileText,
  implementation_plan: FileText,
  risk_assessment: AlertTriangle,
  sops: ListChecks,
  organogram: Users,
  pricing_schedule: Calculator,
  references: User,
  signed_declarations: FileCheck,
  appendices: FileStack,
  table_of_contents: FileSignature,
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string; order: number }> = {
  essential: { label: "Essential", color: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300", order: 0 },
  recommended: { label: "Recommended", color: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300", order: 1 },
  optional: { label: "Optional", color: "bg-muted text-muted-foreground border-border", order: 2 },
};

function GeneratedDocumentsSection({ tender, onChanged }: { tender: any; onChanged: () => void }) {
  const [generated, setGenerated] = useState<any[]>(tender.generated_documents || []);
  const [generating, setGenerating] = useState<string | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const [smartDocs, setSmartDocs] = useState<any[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    setGenerated(tender.generated_documents || []);
  }, [tender.generated_documents]);

  // Run smart analysis on mount
  useEffect(() => {
    setAnalyzing(true);
    api.smartAnalyzeDocuments(tender.id).then((data) => {
      setSmartDocs(data.required || []);
      setAnalyzed(data.analyzed);
    }).catch(() => {
      // Fallback: use all doc types
      setSmartDocs(Object.entries(DOC_ICON_MAP).map(([key, _]) => ({
        doc_type: key,
        title: key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        description: "",
        reason: "Available for generation",
        priority: "recommended",
      })));
    }).finally(() => setAnalyzing(false));
  }, [tender.id]);

  const handleGenerate = async (docType: string) => {
    setGenerating(docType);
    toast.info("AI is generating your document…");
    try {
      const result = await api.generateDocument(tender.id, docType);
      setGenerated((arr) => {
        const filtered = arr.filter((d) => d.doc_type !== docType);
        return [...filtered, result];
      });
      toast.success("Document generated!");
      onChanged();
      setViewing(result);
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally {
      setGenerating(null);
    }
  };

  const handleDelete = async (docId: number) => {
    try {
      await api.deleteGeneratedDocument(tender.id, docId);
      setGenerated((arr) => arr.filter((d) => d.id !== docId));
      if (viewing?.id === docId) setViewing(null);
      toast.success("Document deleted");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
  };

  const handleCopy = () => {
    if (viewing?.content) {
      navigator.clipboard.writeText(viewing.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Document copied to clipboard");
    }
  };

  const handleDownload = () => {
    if (viewing?.content) {
      const blob = new Blob([viewing.content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${viewing.doc_type}_${tender.reference_number}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Document downloaded");
    }
  };

  const handleReanalyze = async () => {
    setAnalyzing(true);
    try {
      const data = await api.smartAnalyzeDocuments(tender.id);
      setSmartDocs(data.required || []);
      setAnalyzed(data.analyzed);
      await loadPack();
      toast.success("AI re-analyzed required documents");
    } catch (e: any) {
      toast.error(e.message || "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  // --- Document pack: what this tender needs, and where each one stands ---
  const [pack, setPack] = useState<PackItem[]>([]);
  const [packSummary, setPackSummary] = useState<DocumentPackResponse["summary"] | null>(null);
  const [packLibraryDocs, setPackLibraryDocs] = useState<any[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [aiEditOpen, setAiEditOpen] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiEditing, setAiEditing] = useState(false);

  const loadPack = useCallback(async () => {
    try {
      const data = await api.getDocumentPack(tender.id);
      setPack(data.items || []);
      setPackSummary(data.summary || null);
      setPackLibraryDocs(data.library_documents || []);
    } catch {
      // The pack is an enhancement; the document list below still works.
    }
  }, [tender.id]);

  useEffect(() => {
    loadPack();
  }, [loadPack]);

  const handlePrepareAll = async () => {
    setPreparing(true);
    toast.info("Bringing together the documents this tender needs…", {
      description: "Linking your library documents and writing the rest from your knowledge base.",
    });
    try {
      const res = await api.prepareDocuments(tender.id);
      setPack(res.items || []);
      setPackSummary(res.summary || null);
      setGenerated((arr) => {
        const merged = [...arr];
        for (const d of res.items || []) {
          if (d.doc_type && d.generated_id) {
            const i = merged.findIndex((x) => x.doc_type === d.doc_type);
            const stub = { id: d.generated_id, doc_type: d.doc_type, title: d.title };
            if (i >= 0) merged[i] = { ...merged[i], ...stub };
            else merged.push(stub);
          }
        }
        return merged;
      });
      onChanged();
      const written = (res.written || []).length;
      const missing = res.summary?.missing ?? 0;
      toast.success(written ? `${written} document(s) prepared` : "Everything possible is already in place", {
        description: missing
          ? `${missing} document(s) you must still obtain yourself — they are marked Missing.`
          : "Your tender pack is complete.",
      });
    } catch (e: any) {
      toast.error(e.message || "Could not prepare documents");
    } finally {
      setPreparing(false);
    }
  };

  const handleAiEdit = async () => {
    if (!viewing || !aiInstruction.trim()) return;
    setAiEditing(true);
    try {
      const res = await api.aiEditDocument(tender.id, viewing.id, aiInstruction);
      if (!res.updated) {
        toast.error(res.message || "The AI could not edit this document right now");
        return;
      }
      // Hand the revised draft straight to the editor so the user reviews it.
      setEditTitle(viewing.title || "");
      setEditContent(res.content || "");
      setEditing(true);
      setAiEditOpen(false);
      setAiInstruction("");
      toast.success("AI revised the document — review and edit before saving");
    } catch (e: any) {
      toast.error(e.message || "AI edit failed");
    } finally {
      setAiEditing(false);
    }
  };

  const openLibrary = (filePath?: string | null) => {
    if (!filePath) return;
    window.open(`/uploads/${filePath}`, "_blank", "noopener,noreferrer");
  };

  const handleStartEdit = () => {
    if (viewing) {
      setEditTitle(viewing.title || "");
      setEditContent(viewing.content || "");
      setEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!viewing) return;
    setSavingEdit(true);
    try {
      const updated = await api.updateGeneratedDocument(tender.id, viewing.id, {
        title: editTitle,
        content: editContent,
      });
      setGenerated((arr) => arr.map((d) => d.id === viewing.id ? { ...d, title: editTitle, content: editContent } : d));
      setViewing({ ...viewing, title: editTitle, content: editContent });
      setEditing(false);
      toast.success("Document saved");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSavingEdit(false);
    }
  };

  const getGenerated = (docType: string) => generated.find((d) => d.doc_type === docType);

  // Sort smart docs by priority
  const sortedDocs = [...smartDocs].sort((a, b) => {
    const pa = PRIORITY_CONFIG[a.priority]?.order ?? 2;
    const pb = PRIORITY_CONFIG[b.priority]?.order ?? 2;
    return pa - pb;
  });

  // Group by priority
  const essential = sortedDocs.filter((d) => d.priority === "essential");
  const recommended = sortedDocs.filter((d) => d.priority === "recommended");
  const optional = sortedDocs.filter((d) => d.priority === "optional");

  const renderDocCard = (doc: any) => {
    const Icon = DOC_ICON_MAP[doc.doc_type] || FileText;
    const existing = getGenerated(doc.doc_type);
    const isGenerating = generating === doc.doc_type;
    return (
      <Card key={doc.doc_type} className={cn("transition-all", existing && "border-emerald-300 dark:border-emerald-800")}>
        <CardContent className="p-4">
          <div className="flex items-start gap-2 mb-2">
            <div className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              existing ? "bg-emerald-100 dark:bg-emerald-950" : "bg-primary/10"
            )}>
              {existing ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Icon className="h-4 w-4 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{doc.title}</div>
              <div className="text-xs text-muted-foreground">{doc.description}</div>
            </div>
          </div>
          {/* AI reason */}
          {doc.reason && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2 mb-2 italic">
              <Sparkles className="h-3 w-3 inline mr-1 text-primary" />
              {doc.reason}
            </div>
          )}
          {existing && (
            <div className="text-xs text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Generated · {Math.round((existing.content?.length || 0) / 1000)}K chars
            </div>
          )}
          <div className="flex items-center gap-2">
            {existing ? (
              <>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setViewing(existing)}>
                  <FileText className="h-3.5 w-3.5" />
                  View
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleGenerate(doc.doc_type)} disabled={isGenerating} title="Regenerate">
                  {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                </Button>
                <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => handleDelete(existing.id)} title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <Button size="sm" className="w-full" onClick={() => handleGenerate(doc.doc_type)} disabled={isGenerating}>
                {isGenerating ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5" /> Generate with AI</>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const STATUS_META: Record<string, { label: string; className: string; icon: any }> = {
    ready: {
      label: "From your library",
      className: "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300",
      icon: CheckCircle2,
    },
    generated: {
      label: "Written by AI",
      className: "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300",
      icon: Sparkles,
    },
    expiring: {
      label: "Expiring soon",
      className: "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300",
      icon: AlertTriangle,
    },
    expired: {
      label: "Expired",
      className: "border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300",
      icon: AlertTriangle,
    },
    missing: {
      label: "Missing",
      className: "border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300",
      icon: X,
    },
  };

  const renderPackItem = (item: PackItem) => {
    const meta = STATUS_META[item.status] ?? STATUS_META.missing;
    const Icon = meta.icon;
    const isGenerating = item.doc_type ? generating === item.doc_type : false;
    const existing = item.generated_id
      ? generated.find((d) => d.id === item.generated_id) ||
        (item.doc_type ? generated.find((d) => d.doc_type === item.doc_type) : undefined)
      : item.doc_type
        ? generated.find((d) => d.doc_type === item.doc_type)
        : undefined;
    const libraryDoc =
      item.library_document_id != null
        ? (tender?.id && packLibraryDocs.find((d: any) => d.id === item.library_document_id))
        : undefined;

    return (
      <Card
        key={item.key}
        className={cn(
          "transition-all",
          (item.status === "ready" || item.status === "generated") &&
            "border-emerald-300 dark:border-emerald-800",
          item.status === "missing" && item.mandatory && "border-rose-300 dark:border-rose-800"
        )}
      >
        <CardContent className="p-4">
          <div className="mb-2 flex items-start gap-2">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                item.status === "ready" || item.status === "generated"
                  ? "bg-emerald-100 dark:bg-emerald-950"
                  : item.status === "missing" || item.status === "expired"
                    ? "bg-rose-100 dark:bg-rose-950"
                    : "bg-amber-100 dark:bg-amber-950"
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{item.title}</div>
              <div className="text-xs text-muted-foreground">
                {item.kind === "compliance" ? "Certificate / compliance document" : "Document written for this tender"}
              </div>
            </div>
            <Badge variant="outline" className={cn("shrink-0 text-[11px]", meta.className)}>
              {meta.label}
            </Badge>
          </div>

          {item.requirement_reason && (
            <div className="mb-2 rounded-lg bg-muted/30 p-2 text-xs italic text-muted-foreground">
              <Sparkles className="mr-1 inline h-3 w-3 text-primary" />
              {item.requirement_reason}
            </div>
          )}

          {item.status === "expired" && libraryDoc?.expiry_date && (
            <div className="mb-2 text-xs text-rose-600">
              Expired {item.library_expiry} — renew it before you bid.
            </div>
          )}

          <div className="flex items-center gap-2">
            {item.kind === "compliance" ? (
              libraryDoc ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => openLibrary(libraryDoc.file_path)}
                >
                  <FileText className="h-3.5 w-3.5" />
                  View document
                </Button>
              ) : (
                <div className="flex-1">
                  <Badge variant="outline" className="border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300">
                    Not in your library — upload it
                  </Badge>
                </div>
              )
            ) : existing ? (
              <>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setViewing(existing)}>
                  <FileText className="h-3.5 w-3.5" />
                  View &amp; edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleGenerate(item.doc_type!)}
                  disabled={isGenerating}
                  title="Rewrite with AI"
                >
                  {isGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                className="w-full"
                onClick={() => handleGenerate(item.doc_type!)}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" /> Write it for me
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderPriorityGroup = (docs: any[], label: string, color: string) => {
    if (docs.length === 0) return null;
    const generatedCount = docs.filter((d) => getGenerated(d.doc_type)).length;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("text-xs font-medium", color)}>
            {label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {generatedCount}/{docs.length} generated
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {docs.map(renderDocCard)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <FileSignature className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold">Documents this tender needs</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Certificates are pulled from your Compliance Library, and anything the AI can
                write is written for you from your knowledge base. Anything it cannot source
                is clearly marked Missing.
              </p>
              {packSummary && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-[11px]">
                    {packSummary.total} required
                  </Badge>
                  {(packSummary.ready + packSummary.generated) > 0 && (
                    <Badge
                      variant="outline"
                      className="border-emerald-300 text-[11px] text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
                    >
                      {packSummary.ready + packSummary.generated} in hand
                    </Badge>
                  )}
                  {packSummary.outstanding > 0 && (
                    <Badge
                      variant="outline"
                      className="border-rose-300 text-[11px] text-rose-700 dark:border-rose-800 dark:text-rose-300"
                    >
                      {packSummary.outstanding} outstanding
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <Button size="sm" onClick={handlePrepareAll} disabled={preparing}>
                {preparing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {preparing ? "Preparing…" : "Prepare all documents"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleReanalyze} disabled={analyzing}>
                <RefreshCw className={cn("h-3.5 w-3.5", analyzing && "animate-spin")} />
                Re-analyze
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Smart document pack */}
      {!analyzing && pack.length > 0 && (
        <div className="space-y-6">
          {(["Compliance & certificates", "Documents to write"] as const).map((label, idx) => {
            const items = pack.filter((p) => (idx === 0 ? p.kind === "compliance" : p.kind === "content"));
            if (items.length === 0) return null;
            return (
              <div key={label} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs font-medium">
                    {label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{items.length} item(s)</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map(renderPackItem)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Analyzing state */}
      {analyzing && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">AI is reading your tender and determining which documents are required…</p>
          </CardContent>
        </Card>
      )}

      {/* Legacy smart list (kept as a fallback when the pack is unavailable) */}
      {!analyzing && pack.length === 0 && sortedDocs.length > 0 && (
        <div className="space-y-6">
          {renderPriorityGroup(essential, "Essential", PRIORITY_CONFIG.essential.color)}
          {renderPriorityGroup(recommended, "Recommended", PRIORITY_CONFIG.recommended.color)}
          {renderPriorityGroup(optional, "Optional", PRIORITY_CONFIG.optional.color)}
        </div>
      )}

      {/* Custom AI-generated documents (from prompt-based generation) */}
      {generated.filter((d) => d.doc_type === "custom").length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-violet-600" />
              AI-Generated Documents
              <Badge variant="outline" className="text-xs ml-auto">
                {generated.filter((d) => d.doc_type === "custom").length} document{generated.filter((d) => d.doc_type === "custom").length === 1 ? "" : "s"}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
                Custom documents generated by AI from your prompts. Click to view, edit, or download.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {generated.filter((d) => d.doc_type === "custom").map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-violet-100 dark:border-violet-900 hover:bg-violet-50/30 dark:hover:bg-violet-950/10 transition-colors group">
                <div className="h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-950/30 flex items-center justify-center shrink-0">
                  <FileSignature className="h-4 w-4 text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{doc.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {Math.round((doc.content?.length || 0) / 1000)}K chars · Created {formatDate(doc.created_at)}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => setViewing(doc)}>
                    <Eye className="h-3.5 w-3.5 mr-1" /> View
                  </Button>
                  <Button size="sm" variant="ghost" className="text-rose-600 opacity-0 group-hover:opacity-100" onClick={() => handleDelete(doc.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Document viewer dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) { setViewing(null); setEditing(false); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-primary" />
              {editing ? (
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="h-8 text-base font-semibold"
                />
              ) : (
                viewing?.title
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 pb-2 border-b">
            {editing ? (
              <>
                <Button size="sm" onClick={handleSaveEdit} disabled={savingEdit} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {savingEdit ? "Saving…" : "Save"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={savingEdit}>
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={handleStartEdit}>
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAiEditOpen((o) => !o)}
                  title="Ask the AI to revise this document"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Ask AI to edit
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
                <Button variant="outline" size="sm" className="text-rose-600 hover:bg-rose-50" onClick={() => { if (viewing) handleDelete(viewing.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
                <Badge variant="outline" className="text-xs ml-auto">
                  {Math.round((viewing?.content?.length || 0) / 1000)}K chars
                </Badge>
              </>
            )}
          </div>
          {aiEditOpen && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Tell the AI what to change
              </div>
              <Input
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                placeholder="e.g. Shorten this to two pages and add a quality-control section"
                className="text-xs"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleAiEdit} disabled={aiEditing || !aiInstruction.trim()}>
                  {aiEditing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {aiEditing ? "Revising…" : "Revise with AI"}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  You review and edit the result before it is saved.
                </span>
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {editing ? (
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-[60vh] text-xs font-mono resize-none"
                placeholder="Edit document content…"
              />
            ) : (
              <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/30 rounded-lg p-4">
                {viewing?.content}
              </pre>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
