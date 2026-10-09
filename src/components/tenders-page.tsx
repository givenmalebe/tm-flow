"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Search,
  MapPin,
  CalendarClock,
  Download,
  Eye,
  ArrowLeft,
  ArrowRight,
  Menu,
  X,
  Building2,
  Inbox,
  Printer,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

interface TendersPageProps {
  onBack: () => void;
  onSignIn: () => void;
  onGetStarted: () => void;
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <FileText className="size-5" />
      </div>
      <span className="text-lg font-semibold tracking-tight text-foreground">
        TM <span className="text-primary">Flow</span>
      </span>
    </div>
  );
}

function formatRand(v: number) {
  return v ? "R " + v.toLocaleString("en-ZA") : "—";
}

function formatDate(d: string) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
  } catch { return d; }
}

function daysRemaining(d: string) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function TendersPage({ onBack, onSignIn, onGetStarted }: TendersPageProps) {
  const { user } = useAuth();
  const [tenders, setTenders] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [selectedTender, setSelectedTender] = React.useState<any>(null);
  const [fullTender, setFullTender] = React.useState<any>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/public/tenders")
      .then((r) => r.json())
      .then((data) => { setTenders(data.items || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = tenders.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.title?.toLowerCase().includes(q) ||
      t.reference_number?.toLowerCase().includes(q) ||
      t.company_name?.toLowerCase().includes(q) ||
      t.category?.toLowerCase().includes(q)
    );
  });

  const downloadPDF = async (tender: any) => {
    try {
      const res = await fetch(`/api/public/tenders/${tender.id}`);
      const full = await res.json();
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
      doc.text("TM FLOW", m, 13); doc.setFontSize(7); doc.setFont("helvetica", "normal");
      doc.text("TENDER NOTICE", m, 19);
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.text("TENDER NOTICE", pw - m, 13, { align: "right" });

      y = 40;
      doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(115, 115, 115);
      doc.text(`Reference: ${full.reference_number || "N/A"}`, m, y); y += 5;
      doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(24, 24, 27);
      const tLines = doc.splitTextToSize(full.title || "Untitled Tender", cw);
      doc.text(tLines, m, y); y += tLines.length * 8 + 4;
      doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(115, 115, 115);
      doc.text(`Issued by: ${full.company_name || "—"}`, m, y); y += 8;

      // Key details
      doc.setFillColor(250, 250, 250); doc.setDrawColor(228, 228, 231);
      doc.roundedRect(m, y, cw, 36, 2, 2, "FD");
      doc.setFontSize(6); doc.setFont("helvetica", "bold"); doc.setTextColor(115, 115, 115);
      doc.text("KEY DETAILS", m + 4, y + 6);
      doc.setFont("helvetica", "normal"); doc.setTextColor(51, 51, 51); doc.setFontSize(9);
      const details = [
        `Category: ${full.category || "—"}`,
        `Budget: R ${(full.budget || 0).toLocaleString("en-ZA")}`,
        `Location: ${full.location || "—"}`,
        `Contract: ${full.contract_period || "—"}`,
        `Closing: ${formatDate(full.closing_date)}`,
        `Status: ${full.status || "Open"}`,
      ];
      details.forEach((d, i) => {
        const col = i % 2, row = Math.floor(i / 2);
        doc.text(d, m + 4 + col * (cw / 2 - 4), y + 12 + row * 6);
      });
      y += 42;

      // Contact
      if (full.contact_person || full.contact_email) {
        doc.setFont("helvetica", "bold"); doc.setTextColor(60, 60, 60); doc.setFontSize(9);
        doc.text("CONTACT", m, y); y += 5;
        doc.setFont("helvetica", "normal"); doc.setTextColor(51, 51, 51);
        if (full.contact_person) { doc.text(`Person: ${full.contact_person}`, m, y); y += 5; }
        if (full.contact_email) { doc.text(`Email: ${full.contact_email}`, m, y); y += 5; }
        if (full.contact_phone) { doc.text(`Phone: ${full.contact_phone}`, m, y); y += 5; }
        y += 5;
      }

      // Body sections
      const sections = [
        ["DESCRIPTION", full.description],
        ["SCOPE OF WORK", full.scope_of_work],
        ["EVALUATION CRITERIA", full.evaluation_criteria],
        ["SUBMISSION METHOD", full.submission_method],
        ["FULL TENDER DOCUMENT", full.ai_generated_content],
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
    } catch (e) {
      console.error("PDF download failed:", e);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button onClick={onBack} className="flex items-center gap-2 group">
            <Logo />
          </button>
          <div className="hidden md:flex items-center gap-2">
            <Button variant="ghost" onClick={onSignIn}>Sign In</Button>
            <Button onClick={onGetStarted}>Get Started <ArrowRight className="size-4" /></Button>
          </div>
          <div className="md:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu"><Menu className="size-5" /></Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80">
                <div className="flex items-center justify-between p-4 border-b">
                  <Logo />
                  <SheetClose asChild><Button variant="ghost" size="icon"><X className="size-5" /></Button></SheetClose>
                </div>
                <div className="flex flex-col gap-2 p-4">
                  <Button variant="outline" onClick={() => { setMobileOpen(false); onBack(); }}><ArrowLeft className="size-4 mr-1.5" />Back to Home</Button>
                  <Button variant="outline" onClick={() => { setMobileOpen(false); onSignIn(); }}>Sign In</Button>
                  <Button onClick={() => { setMobileOpen(false); onGetStarted(); }}>Get Started <ArrowRight className="size-4" /></Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b bg-gradient-to-b from-emerald-50/30 via-background to-amber-50/10">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <motion.div initial="hidden" animate="show" variants={fadeUp} className="flex items-center gap-2 mb-4">
              <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="size-4 mr-1.5" />Back to Home</Button>
            </motion.div>
            <motion.div initial="hidden" animate="show" variants={fadeUp} transition={{ delay: 0.1 }}>
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700"><FileText className="size-3.5" /> Open Tenders</Badge>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">Available Tenders</h1>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                Browse live tender opportunities published by procurement organisations across South Africa. Download the full tender document as a PDF, or sign in to submit your bid.
              </p>
            </motion.div>

            <motion.div initial="hidden" animate="show" variants={fadeUp} transition={{ delay: 0.2 }} className="mt-6 max-w-xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tenders by title, reference, company, or category..."
                  className="w-full rounded-lg border border-border bg-background pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </div>
            </motion.div>

            {!loading && (
              <motion.div initial="hidden" animate="show" variants={fadeUp} transition={{ delay: 0.3 }} className="mt-6 flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Inbox className="h-4 w-4 text-amber-600" />
                  <span className="font-semibold text-foreground">{tenders.length}</span> tenders available
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Building2 className="h-4 w-4 text-amber-600" />
                  <span className="font-semibold text-foreground">{new Set(tenders.map((t) => t.company_name)).size}</span> issuing organisations
                </div>
              </motion.div>
            )}
          </div>
        </section>

        {/* Tenders grid */}
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[1,2,3,4,5,6].map((i) => <Card key={i} className="h-64 animate-pulse bg-muted/40" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-1">{tenders.length === 0 ? "No tenders published yet" : "No results found"}</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                {tenders.length === 0 ? "Check back soon for new opportunities." : "Try a different search term."}
              </p>
              {search && <Button variant="outline" className="mt-4" onClick={() => setSearch("")}>Clear search</Button>}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((t, i) => {
                const days = daysRemaining(t.closing_date);
                return (
                  <motion.div key={t.id} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.1 }} variants={fadeUp} transition={{ delay: Math.min(i * 0.05, 0.3) }}>
                    <Card className="h-full hover:shadow-lg hover:border-emerald-300 transition-all">
                      <CardContent className="p-5 flex flex-col h-full">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-mono text-muted-foreground">{t.reference_number}</span>
                          {t.category && <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-emerald-50 text-emerald-700 border-emerald-200">{t.category}</Badge>}
                        </div>
                        <h3 className="text-sm font-semibold text-foreground line-clamp-2 mb-1">{t.title}</h3>
                        <p className="text-xs text-muted-foreground mb-3">{t.company_name}{t.company_industry ? ` · ${t.company_industry}` : ""}</p>
                        <div className="space-y-1.5 text-xs text-muted-foreground flex-1">
                          <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{t.location || "Location not specified"}</span></div>
                          <div className="flex items-center gap-1.5">
                            <CalendarClock className="h-3 w-3 shrink-0" />
                            <span>Closes {formatDate(t.closing_date)}</span>
                            {days !== null && days >= 0 && (
                              <Badge variant="outline" className={cn("text-[9px] h-4 px-1 ml-1", days <= 7 ? "bg-rose-50 text-rose-700 border-rose-200" : days <= 30 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200")}>{days}d left</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5"><FileText className="h-3 w-3 shrink-0" /><span>{t.bid_count || 0} bids submitted</span></div>
                        </div>
                        <div className="flex gap-2 mt-4">
                          <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => {
                            setSelectedTender(t); setFullTender(null); setLoadingDetail(true);
                            fetch(`/api/public/tenders/${t.id}`).then((r) => r.json()).then((d) => { setFullTender(d); setLoadingDetail(false); }).catch(() => setLoadingDetail(false));
                          }}><Eye className="h-3.5 w-3.5 mr-1" />View Details</Button>
                          <Button size="sm" className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={() => downloadPDF(t)}><Download className="h-3.5 w-3.5 mr-1" />Download</Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Detail dialog */}
      {selectedTender && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setSelectedTender(null); setFullTender(null); }}>
          <div className="bg-background rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {loadingDetail ? (
              <div className="p-12 flex flex-col items-center">
                <div className="h-8 w-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm text-muted-foreground">Loading tender details…</p>
              </div>
            ) : (
              <div className="p-6 space-y-5">
                <div className="flex items-start justify-between gap-4 pb-4 border-b">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-mono text-muted-foreground px-2 py-0.5 rounded bg-muted">{selectedTender.reference_number}</span>
                      {selectedTender.category && <Badge variant="outline" className="text-[9px] h-5 px-1.5 bg-emerald-50 text-emerald-700 border-emerald-200">{selectedTender.category}</Badge>}
                      <Badge variant="outline" className="text-[9px] h-5 px-1.5 bg-amber-50 text-amber-700 border-amber-200">{selectedTender.bid_count || 0} bids</Badge>
                    </div>
                    <h3 className="text-xl font-bold text-foreground">{selectedTender.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">Issued by <span className="font-medium text-foreground">{selectedTender.company_name}</span>{selectedTender.company_industry ? ` · ${selectedTender.company_industry}` : ""}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => { setSelectedTender(null); setFullTender(null); }}>✕</Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-md border p-3"><div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" /> Category</div><div className="text-sm font-medium mt-1">{selectedTender.category || "—"}</div></div>
                  <div className="rounded-md border p-3"><div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><FileText className="h-3 w-3" /> Budget</div><div className="text-sm font-bold mt-1 text-amber-700">{formatRand(selectedTender.budget)}</div></div>
                  <div className="rounded-md border p-3"><div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Closing</div><div className="text-sm font-medium mt-1">{formatDate(selectedTender.closing_date)}</div></div>
                  <div className="rounded-md border p-3"><div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> Location</div><div className="text-sm font-medium mt-1 line-clamp-2">{selectedTender.location || "—"}</div></div>
                </div>

                {(fullTender?.description || selectedTender.description) && (
                  <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 font-medium">Description</div><p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{fullTender?.description || selectedTender.description}</p></div>
                )}
                {fullTender?.scope_of_work && (
                  <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 font-medium">Scope of Work</div><p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{fullTender.scope_of_work}</p></div>
                )}
                {fullTender?.evaluation_criteria && (
                  <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 font-medium">Evaluation Criteria</div><p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{fullTender.evaluation_criteria}</p></div>
                )}
                {(fullTender?.submission_method || selectedTender.submission_method) && (
                  <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 font-medium">Submission Method</div><p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{fullTender?.submission_method || selectedTender.submission_method}</p></div>
                )}
                {fullTender?.ai_generated_content && (
                  <div><div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 font-medium flex items-center gap-1"><FileText className="h-3 w-3" /> Full Tender Document</div><div className="rounded-md border border-border bg-muted/30 p-4 max-h-[300px] overflow-y-auto"><pre className="text-xs whitespace-pre-wrap font-sans text-foreground leading-relaxed">{fullTender.ai_generated_content}</pre></div></div>
                )}
                {(fullTender?.contact_person || fullTender?.contact_email || fullTender?.contact_phone) && (
                  <div className="rounded-md border border-border p-4 bg-muted/20">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 font-medium">Contact Details</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      {fullTender?.contact_person && <div><span className="text-[10px] text-muted-foreground">Person</span><div className="font-medium">{fullTender.contact_person}</div></div>}
                      {fullTender?.contact_email && <div><span className="text-[10px] text-muted-foreground">Email</span><div className="font-medium">{fullTender.contact_email}</div></div>}
                      {fullTender?.contact_phone && <div><span className="text-[10px] text-muted-foreground">Phone</span><div className="font-medium">{fullTender.contact_phone}</div></div>}
                    </div>
                  </div>
                )}
                {fullTender?.company_description && (
                  <div className="rounded-md border border-border p-4 bg-muted/20">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 font-medium">About {selectedTender.company_name}</div>
                    <p className="text-sm text-foreground">{fullTender.company_description}</p>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-2 border-t sticky bottom-0 bg-background">
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => downloadPDF(selectedTender)}><Download className="h-4 w-4 mr-1.5" />Download Tender PDF</Button>
                    <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1.5" />Print</Button>
                  </div>
                  {user ? (
                    <Button size="sm" className="w-full bg-amber-600 hover:bg-amber-700" onClick={() => { window.location.reload(); }}><ArrowRight className="h-4 w-4 mr-1.5" />Submit Bid in Dashboard</Button>
                  ) : (
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-center">
                      <p className="text-xs text-muted-foreground mb-2">You must be registered and signed in to submit a bid online.</p>
                      <div className="flex gap-2 justify-center">
                        <Button size="sm" variant="outline" onClick={onSignIn}>Sign In</Button>
                        <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={onGetStarted}>Register</Button>
                      </div>
                    </div>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => { setSelectedTender(null); setFullTender(null); }}>Close</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-auto border-t bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
            <Logo />
            <p>TM Flow — Tender Management for South Africa</p>
            <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="size-4 mr-1" />Back to Home</Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
