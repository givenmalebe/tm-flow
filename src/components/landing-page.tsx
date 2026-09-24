"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Menu,
  X,
  Database,
  Activity,
  ScanText,
  ListChecks,
  FolderCheck,
  CalendarClock,
  MapPin,
  ClipboardCheck,
  Calculator,
  Send,
  MessageSquare,
  FileDiff,
  LayoutDashboard,
  Bot,
  Search,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Bell,
  ArrowRight,
  Github,
  Twitter,
  Linkedin,
  Zap,
  Clock,
  AlertTriangle,
  TrendingUp,
  Users,
  Building2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface LandingPageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Animation helpers                                                          */
/* -------------------------------------------------------------------------- */

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.6, ease: "easeOut" as const } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
      variants={{
        hidden: { opacity: 0, y: 24 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.55, ease: "easeOut", delay },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Data                                                                        */
/* -------------------------------------------------------------------------- */

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const TRUST_BADGES = [
  "PSIRA-ready",
  "B-BBEE aware",
  "POPIA compliant",
  "CIPC / SARS / COIDA tracking",
];

const STATS = [
  { value: "1", label: "Central tender database" },
  { value: "20", label: "Statuses tracked" },
  { value: "16", label: "AI extraction points" },
  { value: "5", label: "Deadline reminders" },
];

const FEATURES: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}[] = [
  { icon: Database, title: "Tender Database", desc: "One central place to capture every tender your team is chasing." },
  { icon: Activity, title: "Tender Status Tracking", desc: "20 statuses from discovery to award — know exactly where each bid stands." },
  { icon: ScanText, title: "AI Tender Document Reading", desc: "Upload the PDF; AI extracts the critical fields in seconds." },
  { icon: ListChecks, title: "Automatic Tender Checklist", desc: "A 16-point compliance checklist generated from the document itself." },
  { icon: FolderCheck, title: "Compliance Document Library", desc: "Reuse your CIPC, BEE, PSIRA and tax clearance docs across every bid." },
  { icon: CalendarClock, title: "Tender Deadline Management", desc: "Never miss closing dates, briefings or site inspections again." },
  { icon: MapPin, title: "Briefings & Site Inspections", desc: "Track compulsory briefings and site visits per tender." },
  { icon: ClipboardCheck, title: "Tender Preparation", desc: "Plan, assign and complete every requirement before submission day." },
  { icon: Calculator, title: "Pricing Tracking", desc: "Build multiple pricing versions and lock the winning number." },
  { icon: Send, title: "Submission Tracking", desc: "Record what was submitted, when, where and by whom." },
  { icon: MessageSquare, title: "Clarifications & Communication", desc: "Log every query and response with the client in one thread." },
  { icon: FileDiff, title: "Tender Addendums", desc: "AI detects what changed between addendum versions automatically." },
  { icon: LayoutDashboard, title: "Tender Dashboard", desc: "A live overview of every active tender, deadline and risk." },
  { icon: Bot, title: "AI Tender Assistant", desc: "Ask anything about a tender — the assistant answers from your data." },
  { icon: FileText, title: "AI Tender Summary", desc: "Get a one-page summary of any 200-page tender in seconds." },
  { icon: Search, title: "Search & Filtering", desc: "Find any tender, document or contact across the whole system." },
];

const HOW_IT_WORKS = [
  { step: "01", icon: FileText, title: "Capture the tender", desc: "Paste the details or upload the tender document — TenderFlow stores it in your database." },
  { step: "02", icon: ScanText, title: "AI reads & extracts", desc: "The checklist, deadlines and risks surface automatically. No more 4-hour reading sessions." },
  { step: "03", icon: Calculator, title: "Prepare & price", desc: "Pull docs from your compliance library, build pricing versions, assign tasks to your team." },
  { step: "04", icon: Send, title: "Submit & track", desc: "Record the submission, log clarifications, watch addendums, monitor the outcome." },
];

const AI_EXTRACTS = [
  "Tender number & client",
  "Closing date and time",
  "Scope of work",
  "Contract period",
  "Site locations",
  "Number of guards / personnel",
  "PSIRA grade requirements",
  "Equipment requirements",
  "Mandatory requirements",
  "Functionality criteria",
  "Evaluation criteria",
  "Pricing requirements",
  "Compulsory documents",
  "Briefing details",
  "Submission requirements",
  "Disqualification risks",
];

const REMINDERS = [
  { days: "30 days", label: "Initial review", desc: "Tender captured. Begin compliance gap analysis.", tone: "calm" },
  { days: "14 days", label: "Document gathering", desc: "Pull all compliance docs from your library.", tone: "calm" },
  { days: "7 days", label: "Briefing & site visit", desc: "Attend compulsory briefing. Confirm site inspection.", tone: "warn" },
  { days: "3 days", label: "Pricing lock", desc: "Finalise pricing versions. Get internal sign-off.", tone: "warn" },
  { days: "1 day", label: "Final submission", desc: "Submit. Confirm receipt. Log submission record.", tone: "urgent" },
];

const FAQS = [
  {
    q: "What types of documents can the AI read?",
    a: "TenderFlow's AI engine reads PDF, DOCX, DOC and TXT files. For scanned PDFs (images), it uses vision-mode to OCR and extract the same structured fields. You can also paste raw tender text directly into the system.",
  },
  {
    q: "Is my data secure?",
    a: "Yes. All data is stored in an encrypted SQLite database with JWT-based authentication and bcrypt password hashing. Documents are stored in a private uploads directory per tenant and never shared across accounts.",
  },
  {
    q: "Can I track multiple tender teams?",
    a: "Yes. The Pro plan manages up to 5 tenders with 5 users, Business manages 10+ tenders with unlimited users, and Custom supports 10+ tenders with dedicated support. You can organise tenders by team, region or client.",
  },
  {
    q: "Does it work for PSIRA / security tenders specifically?",
    a: "Absolutely. The extraction engine is tuned for the South African security industry — it pulls out PSIRA grades, guard counts, site locations, equipment lists and PSIRA compliance requirements automatically.",
  },
  {
    q: "Can I import existing tenders?",
    a: "Yes. You can import existing tenders by uploading their documents, pasting the tender text, or entering fields manually. The AI will then backfill the rest of the extraction for you.",
  },
  {
    q: "What happens to my data if I cancel?",
    a: "You own your data. On cancellation you can export every tender, document, checklist and communication log as a structured JSON or CSV file. After a 30-day grace period, your data is permanently deleted.",
  },
];

/* -------------------------------------------------------------------------- */
/*  Logo                                                                        */
/* -------------------------------------------------------------------------- */

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <FileText className="size-5" />
      </div>
      <span className="text-lg font-semibold tracking-tight text-foreground">
        Tender<span className="text-primary">Flow</span>
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Nav                                                                         */
/* -------------------------------------------------------------------------- */

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
    onNavigate?.();
  };
  return (
    <nav className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
      {NAV_LINKS.map((link) => (
        <a
          key={link.href}
          href={link.href}
          onClick={(e) => handleClick(e, link.href)}
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}

function NavBar({ onGetStarted, onSignIn }: LandingPageProps) {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b backdrop-blur transition-colors",
        scrolled
          ? "bg-background/85 border-border"
          : "bg-background/40 border-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />

        <div className="hidden md:flex items-center gap-8">
          <NavLinks />
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Button variant="ghost" onClick={onSignIn}>
            Sign In
          </Button>
          <Button onClick={onGetStarted}>
            Get Started
            <ArrowRight className="size-4" />
          </Button>
        </div>

        {/* Mobile */}
        <div className="md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-80">
              <div className="flex items-center justify-between p-4 border-b">
                <Logo />
                <SheetClose asChild>
                  <Button variant="ghost" size="icon" aria-label="Close menu">
                    <X className="size-5" />
                  </Button>
                </SheetClose>
              </div>
              <div className="flex flex-col gap-6 p-4">
                <NavLinks onNavigate={() => setOpen(false)} />
                <div className="flex flex-col gap-2">
                  <Button variant="outline" onClick={() => { setOpen(false); onSignIn(); }}>
                    Sign In
                  </Button>
                  <Button onClick={() => { setOpen(false); onGetStarted(); }}>
                    Get Started
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hero mock dashboard                                                         */
/* -------------------------------------------------------------------------- */

function HeroMockup() {
  return (
    <div className="relative">
      {/* glow */}
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-3xl bg-gradient-to-tr from-primary/20 via-emerald-300/10 to-transparent blur-2xl"
      />
      <Card className="overflow-hidden p-0 shadow-2xl">
        {/* window bar */}
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
          <span className="size-3 rounded-full bg-rose-400/70" />
          <span className="size-3 rounded-full bg-amber-400/70" />
          <span className="size-3 rounded-full bg-emerald-400/70" />
          <span className="ml-3 text-xs font-medium text-muted-foreground">
            tenderflow.app / dashboard
          </span>
        </div>

        <div className="grid gap-4 p-4 sm:p-6 md:grid-cols-5">
          {/* Active tenders */}
          <div className="md:col-span-2 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Active Tenders
              </span>
              <Badge variant="secondary" className="gap-1">
                <Activity className="size-3" /> Live
              </Badge>
            </div>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-4xl font-bold text-foreground">12</span>
              <span className="mb-1 text-xs text-emerald-600 font-medium">
                +3 this week
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-muted/50 py-2">
                <div className="text-sm font-semibold">5</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Preparing
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 py-2">
                <div className="text-sm font-semibold">4</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Submitted
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 py-2">
                <div className="text-sm font-semibold">3</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  At risk
                </div>
              </div>
            </div>
          </div>

          {/* Deadline countdown */}
          <div className="md:col-span-3 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Next deadline
              </span>
              <Badge className="gap-1 bg-rose-500/90 hover:bg-rose-500/90">
                <Clock className="size-3" /> Urgent
              </Badge>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight">E137</span>
              <span className="text-sm text-muted-foreground">
                — Department of Public Works
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-rose-600">3 days</span>
              <span className="text-sm text-muted-foreground">left to submit</span>
            </div>

            {/* progress */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Submission readiness</span>
                <span className="font-semibold text-emerald-600">73%</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                  style={{ width: "73%" }}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700">
                <Sparkles className="size-3" /> AI Summary ready
              </Badge>
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="size-3 text-emerald-600" /> Briefing attended
              </Badge>
              <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
                <AlertTriangle className="size-3" /> 2 docs missing
              </Badge>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hero section                                                                */
/* -------------------------------------------------------------------------- */

function Hero({ onGetStarted }: LandingPageProps) {
  return (
    <section
      id="top"
      className="relative isolate overflow-hidden border-b bg-background"
    >
      {/* animated gradient mesh background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(20,184,166,0.10) 25%, rgba(16,185,129,0.06) 50%, rgba(13,148,136,0.10) 75%, rgba(16,185,129,0.08) 100%)",
          backgroundSize: "400% 400%",
          animation: "tf-hero-gradient 12s ease infinite",
        }}
      />
      {/* animated floating orbs */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -top-20 left-[10%] z-0 h-72 w-72 rounded-full bg-emerald-400/30 blur-3xl"
        animate={{
          x: [0, 40, 0],
          y: [0, 30, 0],
          scale: [1, 1.15, 1],
          opacity: [0.4, 0.6, 0.4],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-10 right-[15%] z-0 h-96 w-96 rounded-full bg-teal-400/25 blur-3xl"
        animate={{
          x: [0, -50, 0],
          y: [0, 40, 0],
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-[40%] z-0 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl"
        animate={{
          x: [0, 30, -20, 0],
          y: [0, -20, 10, 0],
          scale: [1, 1.1, 0.95, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
      {/* dot grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(16,185,129,0.25) 1px, transparent 0)",
          backgroundSize: "24px 24px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%)",
        }}
      />
      {/* animated sweeping light beam */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      >
        <motion.div
          className="absolute top-0 -left-1/2 h-full w-1/2"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(16,185,129,0.08) 45%, rgba(20,184,166,0.15) 50%, rgba(16,185,129,0.08) 55%, transparent 100%)",
            filter: "blur(12px)",
          }}
          animate={{ x: ["0%", "300%"] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", repeatDelay: 3 }}
        />
      </motion.div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Copy */}
          <motion.div
            initial="hidden"
            animate="show"
            variants={stagger}
            className="text-center lg:text-left"
          >
            <motion.div variants={fadeUp} className="mb-5 flex justify-center lg:justify-start">
              <Badge variant="outline" className="gap-1.5 border-emerald-300 bg-emerald-50 text-emerald-700 px-3 py-1">
                <Sparkles className="size-3.5" />
                AI-powered tender management
              </Badge>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
            >
              Win more tenders with{" "}
              <span className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 bg-clip-text text-transparent">
                AI on your side
              </span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg lg:mx-0"
            >
              TenderFlow is the central system that takes you from tender
              discovery to submission — reading documents, building checklists,
              tracking deadlines and surfacing risks before they cost you the
              bid.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start"
            >
              <Button size="lg" onClick={onGetStarted} className="h-12 px-6 text-base">
                Start free trial
                <ArrowRight className="size-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-6 text-base"
                onClick={() =>
                  document
                    .querySelector("#how-it-works")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
              >
                See how it works
              </Button>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 lg:justify-start"
            >
              {TRUST_BADGES.map((b) => (
                <span
                  key={b}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                >
                  <ShieldCheck className="size-3.5 text-emerald-600" />
                  {b}
                </span>
              ))}
            </motion.div>
          </motion.div>

          {/* Visual */}
          <motion.div
            initial="hidden"
            animate="show"
            variants={fadeIn}
            className="relative"
          >
            <HeroMockup />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stats bar                                                                   */
/* -------------------------------------------------------------------------- */

function StatsBar() {
  return (
    <section className="border-b bg-gradient-to-b from-emerald-50/60 to-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08} className="text-center">
              <div className="text-4xl font-bold text-emerald-600 sm:text-5xl">
                {s.value}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {s.label}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Features grid                                                               */
/* -------------------------------------------------------------------------- */

function FeaturesGrid() {
  return (
    <section id="features" className="scroll-mt-20 border-b">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="border-emerald-300 text-emerald-700">
            <Zap className="size-3.5" /> 16 capabilities
          </Badge>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Everything your tender team needs
          </h2>
          <p className="mt-3 text-muted-foreground">
            From the first discovery email to the final submission receipt —
            one system, every step.
          </p>
        </Reveal>

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          variants={stagger}
          className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <motion.div key={f.title} variants={fadeUp}>
                <Card className="group h-full transition-shadow hover:shadow-md hover:border-emerald-300">
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex size-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {f.title}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        {f.desc}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  How it works                                                                */
/* -------------------------------------------------------------------------- */

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-b bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="border-emerald-300 text-emerald-700">
            <TrendingUp className="size-3.5" /> Workflow
          </Badge>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            From chaos to submission in 4 steps
          </h2>
          <p className="mt-3 text-muted-foreground">
            TenderFlow replaces your spreadsheets, sticky notes and shared
            drives with a single, repeatable pipeline.
          </p>
        </Reveal>

        <div className="relative mt-14">
          {/* connecting line on desktop */}
          <div
            aria-hidden
            className="absolute left-0 right-0 top-8 hidden h-0.5 bg-gradient-to-r from-emerald-200 via-emerald-400 to-emerald-200 lg:block"
          />
          <motion.ol
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            variants={stagger}
            className="grid gap-10 lg:grid-cols-4"
          >
            {HOW_IT_WORKS.map((s) => {
              const Icon = s.icon;
              return (
                <motion.li key={s.step} variants={fadeUp} className="relative text-center lg:text-left">
                  <div className="flex flex-col items-center lg:items-start">
                    <div className="relative z-10 flex size-16 items-center justify-center rounded-2xl border border-emerald-200 bg-background text-emerald-600 shadow-sm">
                      <Icon className="size-7" />
                      <span className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                        {s.step}
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-foreground">
                      {s.title}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {s.desc}
                    </p>
                  </div>
                </motion.li>
              );
            })}
          </motion.ol>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  AI highlight section                                                        */
/* -------------------------------------------------------------------------- */

function AIHighlight() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-emerald-50/40 to-teal-50/30 p-6 sm:p-10 lg:p-14">
            {/* decorative dot pattern */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, rgba(16,185,129,0.25) 1px, transparent 0)",
                backgroundSize: "22px 22px",
                maskImage:
                  "radial-gradient(ellipse 60% 60% at 80% 40%, #000 0%, transparent 80%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 60% 60% at 80% 40%, #000 0%, transparent 80%)",
              }}
            />
            <div className="relative grid gap-10 lg:grid-cols-2 lg:gap-16">
              {/* left: bullets */}
              <div>
                <Badge variant="outline" className="border-emerald-300 bg-background/70 text-emerald-700">
                  <Sparkles className="size-3.5" /> AI extraction
                </Badge>
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  The AI reads the tender for you
                </h2>
                <p className="mt-3 text-muted-foreground">
                  Stop spending your evenings reading 200-page tender PDFs.
                  TenderFlow extracts the 16 points that actually matter —
                  structured, searchable and ready to action.
                </p>

                <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {AI_EXTRACTS.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-sm text-foreground"
                    >
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* right: mock extracted card */}
              <div className="relative">
                <Card className="overflow-hidden p-0 shadow-xl">
                  <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Bot className="size-4 text-emerald-600" />
                      <span className="text-sm font-semibold">
                        AI Extracted — E137
                      </span>
                    </div>
                    <Badge className="gap-1">
                      <Sparkles className="size-3" /> Auto
                    </Badge>
                  </div>
                  <CardContent className="grid gap-3 p-4 font-mono text-xs">
                    {[
                      ["tender_number", "E137/2025"],
                      ["client", "Dept. of Public Works"],
                      ["closing_date", "2025-11-14T11:00:00"],
                      ["scope", "Guarding services — 3 sites"],
                      ["contract_period", "36 months"],
                      ["guard_count", "42"],
                      ["psira_grades", "B, C, D"],
                      ["briefing", "Compulsory — 2025-10-30"],
                      ["pricing_model", "Loaded monthly rate"],
                      ["risk_flags", "2 missing compulsory docs"],
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-start justify-between gap-3 border-b border-dashed border-border/60 pb-2 last:border-0 last:pb-0"
                      >
                        <span className="text-muted-foreground">{k}:</span>
                        <span className="flex items-center gap-1.5 text-right font-medium text-foreground">
                          <CheckCircle2 className="size-3 shrink-0 text-emerald-600" />
                          {v}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Deadline / reminder ladder                                                  */
/* -------------------------------------------------------------------------- */

function DeadlineLadder() {
  const toneStyles: Record<string, string> = {
    calm: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn: "border-amber-200 bg-amber-50 text-amber-700",
    urgent: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return (
    <section className="border-b bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="border-emerald-300 text-emerald-700">
            <Bell className="size-3.5" /> Reminders
          </Badge>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Never miss a deadline
          </h2>
          <p className="mt-3 text-muted-foreground">
            TenderFlow nudges you at five key milestones, including compulsory
            briefings and site inspections — so the only surprises are the good
            kind.
          </p>
        </Reveal>

        <motion.ol
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.15 }}
          variants={stagger}
          className="relative mt-12 space-y-6 before:absolute before:left-[27px] before:top-2 before:h-[calc(100%-1rem)] before:w-0.5 before:bg-gradient-to-b before:from-emerald-300 before:via-emerald-400 before:to-rose-400 sm:before:left-8"
        >
          {REMINDERS.map((r) => (
            <motion.li key={r.days} variants={fadeUp} className="relative pl-16 sm:pl-20">
              <div
                className={cn(
                  "absolute left-0 top-0 flex size-14 items-center justify-center rounded-full border-2 bg-background shadow-sm",
                  r.tone === "calm" && "border-emerald-400",
                  r.tone === "warn" && "border-amber-400",
                  r.tone === "urgent" && "border-rose-400"
                )}
              >
                <Clock
                  className={cn(
                    "size-5",
                    r.tone === "calm" && "text-emerald-500",
                    r.tone === "warn" && "text-amber-500",
                    r.tone === "urgent" && "text-rose-500"
                  )}
                />
              </div>
              <Card className="py-4">
                <CardContent className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {r.label}
                      </span>
                      <span
                        className={cn(
                          "rounded-md border px-2 py-0.5 text-xs font-medium",
                          toneStyles[r.tone]
                        )}
                      >
                        {r.days} before
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {r.desc}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Testimonial quote                                                           */
/* -------------------------------------------------------------------------- */

function Testimonial() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <Reveal>
          <Card className="relative overflow-hidden border-l-4 border-l-emerald-500 py-8 sm:py-10">
            <span className="absolute right-6 top-2 select-none font-serif text-7xl text-emerald-100">
              &ldquo;
            </span>
            <CardContent className="relative">
              <p className="text-lg font-medium leading-relaxed text-foreground sm:text-2xl sm:leading-relaxed">
                &ldquo;This is what the tender requires, this is what you have,
                this is what you are missing, these are the deadlines, these
                are the risks, and this is what needs to be done before
                submission.&rdquo;
              </p>
              <div className="mt-6 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Bot className="size-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    TenderFlow AI
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Your bid-readiness summary, on demand
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pricing                                                                     */
/* -------------------------------------------------------------------------- */

function Pricing({ onGetStarted }: LandingPageProps) {
  const tiers = [
    {
      name: "Solo",
      price: "R 0",
      period: "/month",
      tagline: "For managing a single tender at a time.",
      features: [
        "Manage 1 tender",
        "Tender database",
        "Deadline reminders",
        "Submission tracking",
        "1 user",
      ],
      cta: "Start free",
      highlighted: false,
    },
    {
      name: "Pro",
      price: "R 1,499",
      period: "/month",
      tagline: "For tender teams running up to 5 bids.",
      features: [
        "Everything in Solo, plus:",
        "Manage up to 5 tenders",
        "AI document reading",
        "AI tender assistant",
        "Compliance document library",
        "5 users",
      ],
      cta: "Get Pro",
      highlighted: true,
    },
    {
      name: "Business",
      price: "R 3,999",
      period: "/month",
      tagline: "For teams managing more than 10 tenders.",
      features: [
        "Everything in Pro, plus:",
        "Manage more than 10 tenders",
        "AI-generated tender documents",
        "AI readiness reports",
        "Tender discovery & scraper",
        "Excel export",
        "Unlimited users",
      ],
      cta: "Get Business",
      highlighted: false,
    },
    {
      name: "Custom",
      price: "Custom",
      period: "",
      tagline: "For organisations managing 10+ tenders with custom needs.",
      features: [
        "Everything in Business, plus:",
        "Manage 10+ tenders",
        "Custom workflows",
        "Priority support",
        "Dedicated account manager",
        "Custom integrations",
        "SLA & onboarding",
      ],
      cta: "Contact us",
      highlighted: false,
    },
  ];

  return (
    <section id="pricing" className="scroll-mt-20 border-b bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="border-emerald-300 text-emerald-700">
            <Users className="size-3.5" /> Pricing
          </Badge>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Simple pricing for serious tender teams
          </h2>
          <p className="mt-3 text-muted-foreground">
            From a single tender to your entire portfolio. Upgrade as you grow.
          </p>
        </Reveal>

        <div className="mx-auto mt-12 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {tiers.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.08}>
              <Card
                className={cn(
                  "relative h-full py-6",
                  t.highlighted
                    ? "border-emerald-400 shadow-lg ring-1 ring-emerald-200"
                    : ""
                )}
              >
                {t.highlighted && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gap-1 px-3 py-1 shadow-sm">
                    <Sparkles className="size-3" /> Most popular
                  </Badge>
                )}
                <CardContent className="flex h-full flex-col">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {t.name}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t.tagline}
                    </p>
                  </div>

                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight text-foreground">
                      {t.price}
                    </span>
                    {t.period && (
                      <span className="text-sm text-muted-foreground">
                        {t.period}
                      </span>
                    )}
                  </div>

                  <ul className="mt-6 flex-1 space-y-3">
                    {t.features.map((f, idx) => (
                      <li
                        key={f}
                        className={cn(
                          "flex items-start gap-2 text-sm",
                          idx === 0 && t.name !== "Solo"
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground"
                        )}
                      >
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="mt-8 w-full"
                    variant={t.highlighted ? "default" : "outline"}
                    size="lg"
                    onClick={onGetStarted}
                  >
                    {t.cta}
                    <ArrowRight className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  FAQ                                                                         */
/* -------------------------------------------------------------------------- */

function FAQ() {
  return (
    <section id="faq" className="scroll-mt-20 border-b">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <Reveal className="text-center">
          <Badge variant="outline" className="border-emerald-300 text-emerald-700">
            FAQ
          </Badge>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Questions, answered
          </h2>
          <p className="mt-3 text-muted-foreground">
            Everything you need to know before signing up.
          </p>
        </Reveal>

        <Reveal className="mt-10" delay={0.1}>
          <Card className="px-6">
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {FAQS.map((f, i) => (
                  <AccordionItem key={i} value={`item-${i}`}>
                    <AccordionTrigger className="text-left text-base font-medium">
                      {f.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                      {f.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Final CTA band                                                              */
/* -------------------------------------------------------------------------- */

function FinalCTA({ onGetStarted }: LandingPageProps) {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-600 px-6 py-14 text-center shadow-xl sm:px-12 sm:py-20">
            {/* dot pattern */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-25"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)",
                backgroundSize: "24px 24px",
              }}
            />
            {/* decorative blur */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/15 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-teal-300/20 blur-3xl"
            />

            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Stop managing tenders in spreadsheets.
                <br className="hidden sm:block" /> Start winning them with
                TenderFlow.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-emerald-50">
                Set up your workspace in under two minutes. Your first tender
                can be AI-read today.
              </p>
              <div className="mt-8 flex justify-center">
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-12 px-8 text-base shadow-lg"
                  onClick={onGetStarted}
                >
                  Get Started
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Footer                                                                      */
/* -------------------------------------------------------------------------- */

function Footer() {
  const cols = [
    {
      title: "Product",
      links: ["Features", "Pricing", "AI Assistant", "Dashboard", "Compliance Library"],
    },
    {
      title: "Resources",
      links: ["Documentation", "Tender Guide", "PSIRA Help", "Support"],
    },
    {
      title: "Company",
      links: ["About", "Contact", "Privacy", "Terms"],
    },
  ];

  return (
    <footer className="mt-auto border-t bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-5">
          {/* Brand col */}
          <div className="lg:col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              The central system that takes you from tender discovery to
              submission — with AI on your side.
            </p>
            <div className="mt-5 flex items-center gap-3">
              {[
                { Icon: Github, label: "GitHub" },
                { Icon: Twitter, label: "Twitter" },
                { Icon: Linkedin, label: "LinkedIn" },
              ].map(({ Icon, label }) => (
                <a
                  key={label}
                  href="#"
                  aria-label={label}
                  className="flex size-9 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:border-emerald-300 hover:text-emerald-600"
                >
                  <Icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link cols */}
          {cols.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-foreground">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l}>
                    <a
                      href="#"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © 2025 TenderFlow. Built for tender teams.
          </p>
          <Badge
            variant="outline"
            className="gap-1 border-emerald-300 text-emerald-700"
          >
            <Building2 className="size-3" />
            Made for South African tender teams
          </Badge>
        </div>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                         */
/* -------------------------------------------------------------------------- */

export function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <NavBar onGetStarted={onGetStarted} onSignIn={onSignIn} />
      <main className="flex-1">
        <Hero onGetStarted={onGetStarted} onSignIn={onSignIn} />
        <StatsBar />
        <FeaturesGrid />
        <HowItWorks />
        <AIHighlight />
        <DeadlineLadder />
        <Testimonial />
        <Pricing onGetStarted={onGetStarted} onSignIn={onSignIn} />
        <FAQ />
        <FinalCTA onGetStarted={onGetStarted} onSignIn={onSignIn} />
      </main>
      <Footer />
    </div>
  );
}
