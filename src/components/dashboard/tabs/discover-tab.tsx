"use client";

import { useState } from "react";
import {
  Radar,
  Search,
  Loader2,
  ExternalLink,
  MapPin,
  Building2,
  Calendar,
  TrendingUp,
  Sparkles,
  Plus,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  RefreshCw,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/lib/api";
import { useDashboardStore, formatDate, daysUntil, deadlineColor } from "@/lib/dashboard-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DiscoveredTender {
  title: string;
  client: string;
  category: string;
  location: string;
  closing_date: string | null;
  description: string;
  source_site: string;
  url: string;
  reference_number: string | null;
  estimated_value: string | null;
  relevance: "high" | "medium" | "low";
}

const CATEGORY_PRESETS = [
  "Security Services",
  "Security Guards",
  "Cleaning Services",
  "Construction",
  "IT Services",
  "Consulting",
  "Landscaping",
  "Waste Management",
  "Transport",
  "Catering",
  "Maintenance",
  "Electrical",
  "Plumbing",
  "Gardening",
  "Pest Control",
];

const REGION_PRESETS = [
  "South Africa",
  "Gauteng",
  "Western Cape",
  "KwaZulu-Natal",
  "Eastern Cape",
  "Mpumalanga",
  "Limpopo",
  "North West",
  "Free State",
  "Northern Cape",
  "Cape Town",
  "Johannesburg",
  "Durban",
  "Pretoria",
];

export function DiscoverTab() {
  const { setTab, selectTender, refresh } = useDashboardStore();
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("South Africa");
  const [numResults, setNumResults] = useState("15");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<DiscoveredTender[]>([]);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [rawCount, setRawCount] = useState(0);
  const [sources, setSources] = useState<string[]>([]);
  const [scrapedCount, setScrapedCount] = useState(0);
  const [webSearchCount, setWebSearchCount] = useState(0);
  const [importing, setImporting] = useState<number | null>(null);
  const [importedIds, setImportedIds] = useState<Set<number>>(new Set());

  const effectiveCategory = customCategory.trim() || category;

  const handleSearch = async () => {
    if (!effectiveCategory) {
      toast.error("Please select or enter a tender category");
      return;
    }
    setLoading(true);
    setError(null);
    setResults([]);
    setImportedIds(new Set());
    try {
      const data = await api.discoverTenders({
        category: effectiveCategory,
        keywords: keywords.trim() || undefined,
        location: location,
        num_results: parseInt(numResults) || 15,
      });
      if (data.error) {
        setError(data.error);
      }
      setResults(data.results || []);
      setSearchedQuery(data.query || "");
      setRawCount(data.raw_count || 0);
      setSources(data.sources || []);
      setScrapedCount(data.scraped_count || 0);
      setWebSearchCount(data.web_search_count || 0);
      if ((data.results || []).length > 0) {
        toast.success(`Found ${data.results.length} real tender${data.results.length === 1 ? "" : "s"}`);
      } else {
        toast.info("No tenders found. Try different keywords.");
      }
    } catch (e: any) {
      setError(e.message || "Search failed. Please try again.");
      toast.error(e.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (tender: DiscoveredTender, index: number) => {
    setImporting(index);
    try {
      const created = await api.importDiscoveredTender({
        title: tender.title,
        client: tender.client,
        category: tender.category || effectiveCategory,
        location: tender.location,
        closing_date: tender.closing_date,
        description: tender.description,
        source_site: tender.source_site,
        url: tender.url,
        reference_number: tender.reference_number,
        estimated_value: tender.estimated_value,
      });
      toast.success(`Imported "${tender.title.slice(0, 50)}…" into your tenders`);
      setImportedIds((prev) => new Set(prev).add(index));
      refresh();
      // Offer to open the tender
      setTimeout(() => {
        setTab("tenders");
        setTimeout(() => selectTender(created.id), 50);
      }, 800);
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(null);
    }
  };

  const relevanceConfig = {
    high: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", label: "High relevance", icon: TrendingUp },
    medium: { color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", label: "Medium relevance", icon: TrendingUp },
    low: { color: "bg-muted text-muted-foreground", label: "Low relevance", icon: TrendingUp },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Radar className="h-6 w-6 text-primary" />
            Discover Tenders
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            AI-powered tender finder — searches the web for open tenders matching your criteria
          </p>
        </div>
      </div>

      {/* Search form */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            What are you looking for?
          </CardTitle>
          <CardDescription>
            Tell the AI what tenders you want. It will search the web and return a list of open opportunities with links to the source.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Category */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Tender category *</Label>
              <Select
                value={category}
                onValueChange={(v) => {
                  setCategory(v === "__custom" ? "" : v);
                  if (v !== "__custom") setCustomCategory("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_PRESETS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                  <SelectItem value="__custom">+ Custom category…</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom category */}
            {category === "" && customCategory !== "" || (category === "" && customCategory === "" && true) ? null : null}
            {category === "" && (
              <div className="space-y-1.5 lg:col-span-2">
                <Label className="text-xs font-medium">Or enter a custom category</Label>
                <Input
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="e.g. CCTV installation, Armed response, Event security…"
                />
              </div>
            )}

            {/* Location */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Location / Region</Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGION_PRESETS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Keywords */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-medium">Additional keywords (optional)</Label>
              <Input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. PSIRA, Grade B, 24-hour, armed response, government…"
                onKeyDown={(e) => e.key === "Enter" && !loading && handleSearch()}
              />
            </div>

            {/* Num results */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Max results</Label>
              <Select value={numResults} onValueChange={setNumResults}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 results</SelectItem>
                  <SelectItem value="15">15 results</SelectItem>
                  <SelectItem value="20">20 results</SelectItem>
                  <SelectItem value="30">30 results</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Filter className="h-3 w-3" />
              Python scrapers directly fetch live listings from real SA tender portals (security.co.za, tenderflow.co.za, etenders.gov.za) + AI web search for broader coverage.
            </p>
            <Button
              onClick={handleSearch}
              disabled={loading || (!effectiveCategory)}
              className="w-full sm:w-auto"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching the web…
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Find Tenders
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading state */}
      {loading && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <div className="relative">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Radar className="h-8 w-8 text-primary animate-pulse" />
              </div>
              <div className="absolute -inset-2 rounded-2xl border-2 border-primary/20 animate-ping" style={{ animationDuration: "2s" }} />
            </div>
            <h3 className="font-semibold mt-4">Scraping real tender portals…</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Python scrapers are fetching live listings from security.co.za, tenderflow.co.za, etenders.gov.za and more — looking for open {effectiveCategory.toLowerCase()} tenders in {location}.
            </p>
            <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Direct scraping + AI web search · Usually 10-20 seconds
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <div className="space-y-4">
          {/* Results header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                {results.length} real tender{results.length === 1 ? "" : "s"} found
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Searched: <span className="font-mono">"{searchedQuery}"</span>
              </p>
              {sources.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className="text-xs text-muted-foreground">Sources scraped:</span>
                  {sources.map((src, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                      {src}
                    </Badge>
                  ))}
                </div>
              )}
              {(scrapedCount > 0 || webSearchCount > 0) && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {scrapedCount > 0 && <span>Python scraper: {scrapedCount} tenders</span>}
                  {scrapedCount > 0 && webSearchCount > 0 && <span> · </span>}
                  {webSearchCount > 0 && <span>AI web search: {webSearchCount} tenders</span>}
                  {rawCount > 0 && <span> · {rawCount} total after dedup</span>}
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleSearch} disabled={loading}>
              <RefreshCw className="h-3.5 w-3.5" />
              Search again
            </Button>
          </div>

          {/* Tender cards */}
          <div className="grid grid-cols-1 gap-3">
            {results.map((tender, idx) => {
              const rel = relevanceConfig[tender.relevance] || relevanceConfig.medium;
              const RelIcon = rel.icon;
              const days = daysUntil(tender.closing_date);
              const isImported = importedIds.has(idx);
              const isImporting = importing === idx;

              return (
                <Card
                  key={idx}
                  className={cn(
                    "transition-all hover:shadow-md",
                    tender.relevance === "high" && "border-emerald-300 dark:border-emerald-800",
                    isImported && "opacity-60"
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3">
                      {/* Top row: title + relevance */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge className={cn("text-xs", rel.color)}>
                              <RelIcon className="h-3 w-3 mr-0.5" />
                              {rel.label}
                            </Badge>
                            {tender.reference_number && (
                              <Badge variant="outline" className="text-xs font-mono">
                                {tender.reference_number}
                              </Badge>
                            )}
                            {tender.source_site && (
                              <Badge variant="outline" className="text-xs">
                                {tender.source_site.replace(/^www\./, "")}
                              </Badge>
                            )}
                          </div>
                          <h3 className="font-semibold text-sm sm:text-base leading-snug">
                            {tender.title}
                          </h3>
                        </div>
                      </div>

                      {/* Details row */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {tender.client && tender.client !== "Unknown" && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {tender.client}
                          </span>
                        )}
                        {tender.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {tender.location}
                          </span>
                        )}
                        {tender.closing_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span className={deadlineColor(days)}>
                              Closes {formatDate(tender.closing_date)}
                              {days !== null && days >= 0 && ` (${days}d left)`}
                              {days !== null && days < 0 && " (closed)"}
                            </span>
                          </span>
                        )}
                        {tender.estimated_value && (
                          <span className="flex items-center gap-1 font-medium text-foreground">
                            <TrendingUp className="h-3 w-3" />
                            Est. {tender.estimated_value}
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      {tender.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {tender.description}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                        <Button
                          asChild
                          size="sm"
                          variant="default"
                          className="flex-1 sm:flex-none"
                        >
                          <a
                            href={tender.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            View Tender & Get Documents
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant={isImported ? "outline" : "secondary"}
                          onClick={() => handleImport(tender, idx)}
                          disabled={isImported || isImporting}
                          className="flex-1 sm:flex-none"
                        >
                          {isImporting ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Importing…
                            </>
                          ) : isImported ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                              Imported
                            </>
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5" />
                              Import to My Tenders
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Bottom note */}
          <Card className="border-dashed bg-muted/30">
            <CardContent className="py-4 flex items-start gap-3">
              <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">How to use these results</p>
                <p className="text-muted-foreground mt-1">
                  Click <strong>"View Tender & Get Documents"</strong> to open the source page and download the tender documents.
                  Then click <strong>"Import to My Tenders"</strong> to add it to your tender database —
                  once imported, you can upload the documents and let the AI extract requirements, build your checklist and track deadlines.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty state (not searched yet) */}
      {!loading && results.length === 0 && !error && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Radar className="h-8 w-8 text-primary" />
            </div>
            <h3 className="font-semibold text-lg">Find your next tender</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Select a category (or type your own), choose a region, and click <strong>Find Tenders</strong>.
              The AI will search real South African tender portals and return a list of open opportunities with direct links to the source documents.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-6 max-w-lg">
              {CATEGORY_PRESETS.slice(0, 8).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    "px-3 py-2 rounded-lg text-xs font-medium border transition-colors text-left",
                    category === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-accent border-border"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-6 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Powered by AI web search · Results update in real-time
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
