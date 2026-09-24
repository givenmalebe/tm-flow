"use client";

import { useState, useRef, useCallback } from "react";
import {
  ScanText,
  Upload,
  FileText,
  Loader2,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Plus,
  Building2,
  Calendar,
  MapPin,
  Users,
  Shield,
  Package,
  ListChecks,
  FileCheck,
  DollarSign,
  Clock,
  AlertTriangle,
  FileWarning,
  Copy,
  Check,
  RefreshCw,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { useDashboardStore } from "@/lib/dashboard-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ExtractionResult {
  filename: string;
  file_size: number;
  extracted_text_preview: string;
  extraction: any;
  summary: string;
}

const ACCEPTED_TYPES = ".pdf,.doc,.docx,.txt,.csv,.md";
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

export function ReaderTab() {
  const { setTab, selectTender, refresh } = useDashboardStore();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setError(null);
    setResult(null);
    if (f.size > MAX_SIZE) {
      setError("File too large. Maximum size is 20 MB.");
      return;
    }
    setFile(f);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const handleRead = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.readDocument(file);
      setResult(res);
      if (res.extraction?._error) {
        setError(res.extraction._error);
      } else {
        toast.success("AI document reading complete!");
      }
    } catch (e: any) {
      setError(e.message || "Failed to read document. Please try again.");
      toast.error(e.message || "Failed to read document");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTender = async () => {
    if (!file) return;
    setCreating(true);
    setError(null);
    try {
      const newTender = await api.readDocumentAndCreate(file);
      toast.success(`Tender "${newTender.reference_number}" created with AI extraction!`);
      refresh();
      setTab("tenders");
      setTimeout(() => selectTender(newTender.id), 50);
    } catch (e: any) {
      setError(e.message || "Failed to create tender. Please try again.");
      toast.error(e.message || "Failed to create tender");
    } finally {
      setCreating(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleCopySummary = () => {
    if (result?.summary) {
      navigator.clipboard.writeText(result.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Summary copied to clipboard");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ScanText className="h-6 w-6 text-primary" />
            AI Tender Document Reader
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload any tender document (PDF, DOCX, TXT) and the AI will read it and extract all the important information automatically.
          </p>
        </div>
      </div>

      {/* What the AI extracts */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold">The AI reads your document and extracts:</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  "Tender number", "Client", "Tender title", "Closing date & time", "Scope of work",
                  "Contract period", "Site locations", "Personnel/guards required", "Qualifications",
                  "PSIRA grades", "Equipment", "Mandatory requirements", "Functionality requirements",
                  "Evaluation criteria", "Pricing requirements", "Compulsory documents",
                  "Compulsory briefing", "Briefing date & time", "Submission requirements",
                  "Submission method", "Important conditions", "Important deadlines",
                  "Disqualification requirements",
                ].map((item) => (
                  <Badge key={item} variant="outline" className="text-[10px] bg-background">
                    {item}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Plus a plain-English summary so you don't have to read the entire document.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload zone */}
      {!result && !loading && (
        <Card
          className={cn(
            "border-2 border-dashed transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-border"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <CardContent className="py-12">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={handleInputChange}
              className="hidden"
            />
            <div className="flex flex-col items-center text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold">
                {file ? "Document ready to read" : "Drop your tender document here"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                {file
                  ? `${file.name} (${formatSize(file.size)})`
                  : "Drag and drop a PDF, DOCX, or TXT file — or click to browse. Max 20 MB."}
              </p>
              <div className="flex items-center gap-2 mt-4">
                {!file ? (
                  <Button onClick={() => inputRef.current?.click()} size="lg">
                    <Upload className="h-4 w-4" />
                    Choose Document
                  </Button>
                ) : (
                  <>
                    <Button onClick={handleRead} size="lg" disabled={loading}>
                      <ScanText className="h-4 w-4" />
                      Read Document with AI
                    </Button>
                    <Button onClick={handleReset} variant="outline" size="lg">
                      Choose Different File
                    </Button>
                  </>
                )}
              </div>
              {!file && (
                <p className="text-xs text-muted-foreground mt-4">
                  Supported formats: PDF, DOCX, DOC, TXT, CSV, MD
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {loading && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <div className="relative">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <ScanText className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <div className="absolute -inset-2 rounded-2xl border-2 border-primary/20 animate-ping" style={{ animationDuration: "2s" }} />
            </div>
            <h3 className="font-semibold mt-4">AI is reading your document…</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              The AI is extracting the tender number, client, closing date, scope of work, PSIRA grades,
              mandatory requirements, disqualification risks and more from <strong>{file?.name}</strong>.
            </p>
            <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              This usually takes 20-40 seconds for a full document
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => setError(null)}>Dismiss</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Success banner */}
          <Card className="border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
            <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">Document read successfully</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {result.filename} ({formatSize(result.file_size)}) · AI extracted all key information below
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button onClick={handleCreateTender} disabled={creating} className="flex-1 sm:flex-none">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {creating ? "Creating…" : "Create Tender from This"}
                </Button>
                <Button onClick={handleReset} variant="outline">
                  <RefreshCw className="h-4 w-4" />
                  Read Another
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* AI Summary */}
          {result.summary && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI Tender Summary
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={handleCopySummary}>
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <CardDescription className="text-xs">
                  A plain-English summary so you don't have to read the entire document
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-sm whitespace-pre-wrap font-sans bg-muted/30 rounded-lg p-4">
                  {result.summary}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Extracted fields */}
          {result.extraction && !result.extraction._error && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-primary" />
                  Extracted Information
                </CardTitle>
                <CardDescription className="text-xs">
                  All 23 fields automatically identified by the AI
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Key fields grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <ExtractedField icon={FileText} label="Tender number" value={result.extraction.tender_number} />
                  <ExtractedField icon={Building2} label="Client" value={result.extraction.client} />
                  <ExtractedField icon={FileText} label="Tender title" value={result.extraction.tender_title} />
                  <ExtractedField icon={Calendar} label="Closing date" value={result.extraction.closing_date} />
                  <ExtractedField icon={Clock} label="Closing time" value={result.extraction.closing_time} />
                  <ExtractedField icon={Clock} label="Contract period" value={result.extraction.contract_period} />
                  <ExtractedField icon={MapPin} label="Site locations" value={result.extraction.site_locations} isList />
                  <ExtractedField icon={Users} label="Personnel/guards required" value={result.extraction.number_of_personnel_guards} />
                  <ExtractedField icon={Shield} label="Required PSIRA grades" value={result.extraction.required_psira_grades} isList highlight="emerald" />
                  <ExtractedField icon={FileCheck} label="Required qualifications" value={result.extraction.required_qualifications} isList />
                  <ExtractedField icon={Package} label="Required equipment" value={result.extraction.required_equipment} isList />
                  <ExtractedField icon={FileText} label="Submission method" value={result.extraction.submission_method} />
                </div>

                <Separator />

                {/* Scope of work */}
                {result.extraction.scope_of_work && (
                  <ExtractedSection icon={FileText} label="Scope of work" value={result.extraction.scope_of_work} />
                )}

                {/* Briefing info */}
                {(result.extraction.compulsory_briefing_site_inspection || result.extraction.briefing_date) && (
                  <ExtractedSection
                    icon={MapPin}
                    label="Compulsory briefing / site inspection"
                    value={
                      result.extraction.compulsory_briefing_site_inspection +
                      (result.extraction.briefing_date ? `\nBriefing date: ${result.extraction.briefing_date}` : "") +
                      (result.extraction.briefing_time ? `\nBriefing time: ${result.extraction.briefing_time}` : "")
                    }
                    highlight="amber"
                  />
                )}

                {/* Lists */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ExtractedList icon={ListChecks} label="Mandatory requirements" items={result.extraction.mandatory_requirements} />
                  <ExtractedList icon={ListChecks} label="Functionality requirements" items={result.extraction.functionality_requirements} />
                  <ExtractedList icon={ListChecks} label="Evaluation criteria" items={result.extraction.evaluation_criteria} />
                  <ExtractedList icon={DollarSign} label="Pricing requirements" items={result.extraction.pricing_requirements} />
                  <ExtractedList icon={FileCheck} label="Compulsory documents" items={result.extraction.compulsory_documents} highlight="emerald" />
                  <ExtractedList icon={FileText} label="Submission requirements" items={result.extraction.submission_requirements} />
                  <ExtractedList icon={AlertTriangle} label="Important conditions" items={result.extraction.important_conditions} />
                  <ExtractedList icon={Clock} label="Important deadlines" items={result.extraction.important_deadlines} highlight="amber" />
                  <ExtractedList icon={FileWarning} label="Disqualification requirements" items={result.extraction.disqualification_requirements} highlight="rose" />
                  {result.extraction.checklist_suggestions?.length > 0 && (
                    <ExtractedList icon={ListChecks} label="AI checklist suggestions" items={result.extraction.checklist_suggestions} />
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Document text preview */}
          {result.extracted_text_preview && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Document Text Preview
                </CardTitle>
                <CardDescription className="text-xs">
                  First 2000 characters extracted from the document
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/30 rounded-lg p-4 max-h-64 overflow-y-auto scrollbar-thin">
                  {result.extracted_text_preview}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* CTA at bottom */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-sm">
                <strong>Ready to act on this tender?</strong>
                <p className="text-muted-foreground mt-0.5">
                  Create a tender record with all this information auto-filled, plus a checklist built from the compulsory documents.
                </p>
              </div>
              <Button onClick={handleCreateTender} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {creating ? "Creating tender…" : "Create Tender Now"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ---- Sub-components ----

function ExtractedField({ icon: Icon, label, value, isList, highlight }: {
  icon: any; label: string; value: any; isList?: boolean; highlight?: string;
}) {
  const display = isList
    ? (Array.isArray(value) && value.length > 0 ? value.join(", ") : null)
    : (value && value !== null && value !== "" ? String(value) : null);

  const highlightClass = highlight === "emerald" ? "text-emerald-700 dark:text-emerald-400 font-medium"
    : highlight === "amber" ? "text-amber-700 dark:text-amber-400 font-medium"
    : highlight === "rose" ? "text-rose-700 dark:text-rose-400 font-medium"
    : "text-foreground";

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      {display ? (
        <div className={cn("text-sm", highlightClass)}>{display}</div>
      ) : (
        <div className="text-sm text-muted-foreground/50 italic">Not specified</div>
      )}
    </div>
  );
}

function ExtractedSection({ icon: Icon, label, value, highlight }: {
  icon: any; label: string; value: string; highlight?: string;
}) {
  if (!value) return null;
  const borderClass = highlight === "amber" ? "border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20"
    : highlight === "rose" ? "border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20"
    : "border-border";
  return (
    <div className={cn("rounded-lg border p-3", borderClass)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="text-sm whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function ExtractedList({ icon: Icon, label, items, highlight }: {
  icon: any; label: string; items?: string[]; highlight?: string;
}) {
  if (!items || !Array.isArray(items) || items.length === 0) return null;
  const iconColor = highlight === "emerald" ? "text-emerald-600"
    : highlight === "amber" ? "text-amber-600"
    : highlight === "rose" ? "text-rose-600"
    : "text-primary";
  const borderClass = highlight === "rose" ? "border-rose-200 dark:border-rose-900 bg-rose-50/30 dark:bg-rose-950/10"
    : highlight === "amber" ? "border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/10"
    : highlight === "emerald" ? "border-emerald-200 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/10"
    : "border-border";
  return (
    <div className={cn("rounded-lg border p-3", borderClass)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
        <Icon className={cn("h-3.5 w-3.5", iconColor)} />
        {label}
        <Badge variant="outline" className="ml-auto text-[10px]">{items.length}</Badge>
      </div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm flex items-start gap-1.5">
            <span className={cn("mt-1.5 h-1 w-1 rounded-full shrink-0", iconColor.replace("text-", "bg-"))} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
