"use client";

/**
 * Issuer Portal — TM Flow
 * Amber-themed portal for tender buyers / issuers.
 *
 * 8 tabs:
 *   1. Overview       — dashboard stats
 *   2. Tenders        — list / create / edit / publish / delete
 *   3. AI Tender Writer
 *   4. Bid Management — all bids across tenders
 *   5. Top Bidders    — ranked list + per-tender breakdown
 *   6. Bid Review     — two-panel tender→bids + AI review + award
 *   7. Members        — team management
 *   8. Settings       — company profile (read-only display)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { issuerApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Building2,
  LayoutDashboard,
  FileStack,
  Bot,
  Inbox,
  Trophy,
  Gavel,
  Users,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Eye,
  CheckCircle2,
  XCircle,
  Search,
  ShieldCheck,
  Clock,
  Award,
  TrendingUp,
  FileText,
  Sparkles,
  Save,
  X,
  ChevronRight,
  AlertCircle,
  UserPlus,
  Send,
  Ban,
  Crown,
  Mail,
  Phone,
  Globe,
  MapPin,
} from "lucide-react";

// ============================================================
// Helpers
// ============================================================

const SECTORS = [
  "Security & PSIRA",
  "Construction & CIDB",
  "Cleaning & Hygiene",
  "IT & Software",
  "Engineering & Consulting",
  "Transport & Logistics",
  "Health & Medical",
  "Education & Training",
  "Agriculture & Farming",
  "Manufacturing",
  "Mining & Resources",
  "Energy & Renewables",
  "Telecommunications",
  "Financial Services",
  "Real Estate & Facilities",
  "Catering & Hospitality",
  "Marketing & Advertising",
  "Legal Services",
  "Environmental Services",
  "Waste Management",
  "Water & Sanitation",
  "Human Resources & Recruitment",
  "General/Other",
];

const fmtRand = (n: unknown): string => {
  const v = Number(n ?? 0);
  if (!isFinite(v)) return "R 0";
  return (
    "R " +
    v.toLocaleString("en-ZA", { maximumFractionDigits: 0 })
  );
};

const fmtDate = (d?: string | Date | null): string => {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  return dt
    .toLocaleDateString("en-ZA", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .toUpperCase();
};

const fmtDateTime = (d?: string | Date | null): string => {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const initials = (name?: string): string => {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const toInputDate = (d?: string | null): string => {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
};

// ============================================================
// Tab definitions
// ============================================================

type TabId =
  | "overview"
  | "tenders"
  | "ai-writer"
  | "bids"
  | "top-bidders"
  | "review"
  | "members"
  | "settings";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "tenders", label: "Tenders", icon: FileStack },
  { id: "ai-writer", label: "AI Tender Writer", icon: Bot },
  { id: "bids", label: "Bid Management", icon: Inbox },
  { id: "top-bidders", label: "Top Bidders", icon: Trophy },
  { id: "review", label: "Bid Review", icon: Gavel },
  { id: "members", label: "Members", icon: Users },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

// ============================================================
// Main component
// ============================================================

export function IssuerPortal() {
  const { user, logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any | null>(null);
  const [member, setMember] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const loadCompany = useCallback(async () => {
    setLoading(true);
    try {
      const res = await issuerApi.getCompany();
      setCompany(res?.company ?? null);
      setMember(res?.member ?? null);
    } catch (err: any) {
      // 404 means no company yet
      if (/404|not found/i.test(err?.message || "")) {
        setCompany(null);
        setMember(null);
      } else {
        toast.error("Failed to load company", { description: err?.message });
        setCompany(null);
        setMember(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCompany();
  }, [loadCompany]);

  // ---- Loading screen ----
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50/40">
        <div className="flex flex-col items-center gap-3 text-amber-700">
          <Loader2 className="h-9 w-9 animate-spin" />
          <p className="text-sm font-medium">Loading Issuer Portal…</p>
        </div>
      </div>
    );
  }

  // ---- No company → setup screen ----
  if (!company) {
    return <CompanySetup onDone={loadCompany} onLogout={logout} userName={user?.full_name} />;
  }

  // ---- Pending approval ----
  if (member && member.status !== "approved") {
    return (
      <PortalShell
        user={user}
        company={company}
        onLogout={logout}
        activeTab="overview"
        onTabChange={() => {}}
        mobileNavOpen={false}
        setMobileNavOpen={() => {}}
        disabled
      >
        <PendingApproval company={company} />
      </PortalShell>
    );
  }

  // ---- Full portal ----
  return (
    <PortalShell
      user={user}
      company={company}
      onLogout={logout}
      activeTab={activeTab}
      onTabChange={(t) => {
        setActiveTab(t);
        setMobileNavOpen(false);
      }}
      mobileNavOpen={mobileNavOpen}
      setMobileNavOpen={setMobileNavOpen}
    >
      {activeTab === "overview" && <OverviewTab onJump={setActiveTab} />}
      {activeTab === "tenders" && <TendersTab />}
      {activeTab === "ai-writer" && <AIWriterTab />}
      {activeTab === "bids" && <BidManagementTab />}
      {activeTab === "top-bidders" && <TopBiddersTab />}
      {activeTab === "review" && <BidReviewTab />}
      {activeTab === "members" && <MembersTab company={company} currentUser={user} />}
      {activeTab === "settings" && <SettingsTab company={company} />}
    </PortalShell>
  );
}

// ============================================================
// Portal Shell (header + sidebar + content + footer)
// ============================================================

function PortalShell({
  user,
  company,
  onLogout,
  activeTab,
  onTabChange,
  mobileNavOpen,
  setMobileNavOpen,
  disabled,
  children,
}: {
  user: any;
  company: any;
  onLogout: () => void;
  activeTab: TabId;
  onTabChange: (t: TabId) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const SidebarContent = (
    <nav className="flex flex-col gap-1 p-3">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            disabled={disabled}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              active
                ? "bg-amber-600 text-white shadow-sm"
                : "text-amber-900 hover:bg-amber-100"
            )}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex flex-col bg-amber-50/30">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-amber-600 text-white shadow-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            {/* Mobile nav trigger */}
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="lg:hidden inline-flex items-center justify-center rounded-md p-2 hover:bg-amber-700/50"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-white p-0">
                <SheetHeader className="px-4 pt-4">
                  <SheetTitle className="flex items-center gap-2 text-amber-700">
                    <Building2 className="h-5 w-5" />
                    TM Flow Issuer
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-2">{SidebarContent}</div>
              </SheetContent>
            </Sheet>

            <Building2 className="h-6 w-6 shrink-0" />
            <div className="flex flex-col leading-tight">
              <span className="text-base font-semibold">TM Flow — Issuer Portal</span>
              <span className="text-[11px] text-amber-100/90 hidden sm:block">
                {company?.name || "Your organisation"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-sm font-medium">{user?.full_name || "User"}</span>
              <span className="text-[11px] text-amber-100/90">{user?.email}</span>
            </div>
            <Avatar className="h-9 w-9 border-2 border-amber-300">
              <AvatarFallback className="bg-amber-700 text-white text-xs font-semibold">
                {initials(user?.full_name || user?.email)}
              </AvatarFallback>
            </Avatar>
            <Button
              variant="secondary"
              size="sm"
              onClick={onLogout}
              className="bg-white text-amber-700 hover:bg-amber-50"
            >
              <LogOut className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="mx-auto flex w-full max-w-7xl flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-64 shrink-0 border-r border-amber-100 bg-white">
          <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto">
            {SidebarContent}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      {/* Footer */}
      <footer className="mt-auto border-t border-amber-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-amber-600" />
            TM Flow — Issuer Portal
          </span>
          <span>© {new Date().getFullYear()} TM Flow · Tender Management, simplified.</span>
        </div>
      </footer>
    </div>
  );
}

// ============================================================
// Company Setup (create / join)
// ============================================================

function CompanySetup({
  onDone,
  onLogout,
  userName,
}: {
  onDone: () => void;
  onLogout: () => void;
  userName?: string;
}) {
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");

  // Create form
  const [createForm, setCreateForm] = useState({
    name: "",
    registration_number: "",
    description: "",
    industry: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    job_title: "",
  });
  const [creating, setCreating] = useState(false);

  // Join form
  const [joinQuery, setJoinQuery] = useState("");
  const [joinResults, setJoinResults] = useState<any[]>([]);
  const [joinSelected, setJoinSelected] = useState<any | null>(null);
  const [joinTitle, setJoinTitle] = useState("");
  const [joining, setJoining] = useState(false);
  const [searching, setSearching] = useState(false);

  // Debounced search
  useEffect(() => {
    if (mode !== "join" || !joinQuery.trim()) {
      setJoinResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(() => {
      issuerApi
        .searchCompanies(joinQuery.trim())
        .then((res) => setJoinResults(res.items || []))
        .catch(() => setJoinResults([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(t);
  }, [joinQuery, mode]);

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      toast.error("Company name is required");
      return;
    }
    setCreating(true);
    try {
      await issuerApi.registerCompany(createForm);
      toast.success("Company created", {
        description: "You are now the admin of " + createForm.name,
      });
      onDone();
    } catch (err: any) {
      toast.error("Failed to create company", { description: err?.message });
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!joinSelected) {
      toast.error("Please select a company to join");
      return;
    }
    setJoining(true);
    try {
      await issuerApi.joinCompany(joinSelected.name, joinTitle || undefined);
      toast.success("Join request submitted", {
        description: "An admin of " + joinSelected.name + " will review your request.",
      });
      onDone();
    } catch (err: any) {
      toast.error("Failed to join company", { description: err?.message });
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-amber-50 to-white">
      <header className="bg-amber-600 text-white shadow">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            <span className="text-base font-semibold">TM Flow — Issuer Portal</span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={onLogout}
            className="bg-white text-amber-700 hover:bg-amber-50"
          >
            <LogOut className="h-4 w-4 mr-1.5" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <Building2 className="h-6 w-6 text-amber-600" />
            </div>
            <CardTitle className="text-2xl">
              Welcome{userName ? `, ${userName.split(" ")[0]}` : ""}!
            </CardTitle>
            <CardDescription>
              Set up your issuer company to start creating tenders and receiving bids.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {mode === "choose" && (
              <div className="grid sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setMode("create")}
                  className="group rounded-xl border border-amber-200 bg-amber-50/50 p-6 text-left hover:border-amber-400 hover:bg-amber-100 transition-colors"
                >
                  <Building2 className="h-8 w-8 text-amber-600 mb-3" />
                  <h3 className="font-semibold text-amber-900">Create a Company</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Register a new organisation. You will become the company admin and can
                    invite team members.
                  </p>
                  <span className="inline-flex items-center gap-1 text-sm text-amber-700 mt-3 font-medium">
                    Get started <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setMode("join")}
                  className="group rounded-xl border border-amber-200 bg-amber-50/50 p-6 text-left hover:border-amber-400 hover:bg-amber-100 transition-colors"
                >
                  <UserPlus className="h-8 w-8 text-amber-600 mb-3" />
                  <h3 className="font-semibold text-amber-900">Join a Company</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Search for your employer and request to join. An admin will need to
                    approve your request.
                  </p>
                  <span className="inline-flex items-center gap-1 text-sm text-amber-700 mt-3 font-medium">
                    Find company <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </button>
              </div>
            )}

            {mode === "create" && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Company Name *">
                    <Input
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      placeholder="Acme Procurement Pty Ltd"
                    />
                  </Field>
                  <Field label="Registration Number">
                    <Input
                      value={createForm.registration_number}
                      onChange={(e) =>
                        setCreateForm({ ...createForm, registration_number: e.target.value })
                      }
                      placeholder="2018/123456/07"
                    />
                  </Field>
                </div>

                <Field label="Industry">
                  <Select
                    value={createForm.industry}
                    onValueChange={(v) => setCreateForm({ ...createForm, industry: v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select industry…" />
                    </SelectTrigger>
                    <SelectContent>
                      {SECTORS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Description">
                  <Textarea
                    rows={3}
                    value={createForm.description}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, description: e.target.value })
                    }
                    placeholder="Brief description of your organisation…"
                  />
                </Field>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Address">
                    <Input
                      value={createForm.address}
                      onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                      placeholder="123 Main Street, Sandton"
                    />
                  </Field>
                  <Field label="Phone">
                    <Input
                      value={createForm.phone}
                      onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                      placeholder="+27 11 123 4567"
                    />
                  </Field>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Email">
                    <Input
                      type="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      placeholder="info@acme.co.za"
                    />
                  </Field>
                  <Field label="Website">
                    <Input
                      value={createForm.website}
                      onChange={(e) => setCreateForm({ ...createForm, website: e.target.value })}
                      placeholder="https://acme.co.za"
                    />
                  </Field>
                </div>

                <Field label="Your Job Title">
                  <Input
                    value={createForm.job_title}
                    onChange={(e) => setCreateForm({ ...createForm, job_title: e.target.value })}
                    placeholder="Procurement Manager"
                  />
                </Field>

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setMode("choose")}>
                    Back
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={creating}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {creating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Building2 className="h-4 w-4 mr-2" />
                    )}
                    Create Company
                  </Button>
                </div>
              </div>
            )}

            {mode === "join" && (
              <div className="space-y-4">
                <Field label="Search for your company">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      value={joinQuery}
                      onChange={(e) => {
                        setJoinQuery(e.target.value);
                        setJoinSelected(null);
                      }}
                      placeholder="Type your company name…"
                    />
                    {searching && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-amber-600" />
                    )}
                  </div>
                </Field>

                <div className="max-h-72 overflow-y-auto rounded-lg border border-amber-100 bg-amber-50/30 divide-y divide-amber-100">
                  {joinResults.length === 0 && joinQuery.trim() && !searching && (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No companies found. Try a different search.
                    </div>
                  )}
                  {joinResults.length === 0 && !joinQuery.trim() && (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      Start typing to search for companies.
                    </div>
                  )}
                  {joinResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setJoinSelected(c)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 text-left hover:bg-amber-100/60 transition-colors",
                        joinSelected?.id === c.id && "bg-amber-100"
                      )}
                    >
                      <div>
                        <div className="font-medium text-sm text-amber-900">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.industry || "Industry not specified"}
                        </div>
                      </div>
                      {joinSelected?.id === c.id && (
                        <CheckCircle2 className="h-4 w-4 text-amber-600" />
                      )}
                    </button>
                  ))}
                </div>

                {joinSelected && (
                  <Field label="Your Job Title (optional)">
                    <Input
                      value={joinTitle}
                      onChange={(e) => setJoinTitle(e.target.value)}
                      placeholder="Procurement Officer"
                    />
                  </Field>
                )}

                <div className="flex justify-between pt-2">
                  <Button variant="ghost" onClick={() => setMode("choose")}>
                    Back
                  </Button>
                  <Button
                    onClick={handleJoin}
                    disabled={joining || !joinSelected}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {joining ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4 mr-2" />
                    )}
                    Request to Join
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <footer className="mt-auto border-t border-amber-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-muted-foreground text-center">
          TM Flow — Issuer Portal
        </div>
      </footer>
    </div>
  );
}

// ============================================================
// Pending Approval
// ============================================================

function PendingApproval({ company }: { company: any }) {
  return (
    <div className="max-w-2xl mx-auto py-10">
      <Card className="border-amber-200">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <Clock className="h-7 w-7 text-amber-600" />
          </div>
          <CardTitle className="text-2xl">Pending Approval</CardTitle>
          <CardDescription>
            Your access to <span className="font-semibold text-amber-800">{company?.name}</span>{" "}
            is awaiting admin approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
            <p className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                A company administrator must approve your membership before you can access the
                Issuer Portal. Please contact your organisation's admin to expedite this.
              </span>
            </p>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Once approved, you will see the full portal with all 8 tabs.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// 1. Overview Tab
// ============================================================

function OverviewTab({ onJump }: { onJump: (t: TabId) => void }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await issuerApi.getStats();
      setStats(s);
    } catch (err: any) {
      toast.error("Failed to load stats", { description: err?.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <CenteredSpinner label="Loading dashboard…" />
    );
  }

  const cards: { label: string; value: number | string; icon: React.ElementType; tone: string }[] = [
    { label: "Total Tenders", value: stats?.total_tenders ?? 0, icon: FileStack, tone: "amber" },
    { label: "Published", value: stats?.published_tenders ?? 0, icon: Send, tone: "emerald" },
    { label: "Drafts", value: stats?.draft_tenders ?? 0, icon: FileText, tone: "slate" },
    { label: "Open", value: stats?.open_tenders ?? 0, icon: Clock, tone: "amber" },
    { label: "Awarded", value: stats?.awarded_tenders ?? 0, icon: Award, tone: "emerald" },
    { label: "Total Bids", value: stats?.total_bids ?? 0, icon: Inbox, tone: "amber" },
    { label: "Pending Bids", value: stats?.pending_bids ?? 0, icon: AlertCircle, tone: "rose" },
    { label: "Awarded Bids", value: stats?.awarded_bids ?? 0, icon: Trophy, tone: "emerald" },
    { label: "Team Members", value: stats?.member_count ?? 0, icon: Users, tone: "amber" },
  ];

  const toneClass: Record<string, string> = {
    amber: "bg-amber-100 text-amber-700",
    emerald: "bg-emerald-100 text-emerald-700",
    slate: "bg-slate-100 text-slate-700",
    rose: "bg-rose-100 text-rose-700",
  };

  const topBidders: any[] = stats?.top_bidders ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-amber-900">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Your tender portfolio at a glance.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-amber-100">
              <CardContent className="p-4 flex flex-col gap-2">
                <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", toneClass[c.tone])}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="text-2xl font-bold text-amber-900">{c.value}</div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="border-amber-100">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-amber-600" /> Top Bidders
            </CardTitle>
            <CardDescription>By number of bids submitted</CardDescription>
          </CardHeader>
          <CardContent>
            {topBidders.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title="No bids yet"
                description="Bidders will appear here once tenders receive bids."
              />
            ) : (
              <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {topBidders.slice(0, 10).map((b, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/40 p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                          i === 0 && "bg-amber-500 text-white",
                          i === 1 && "bg-slate-400 text-white",
                          i === 2 && "bg-orange-400 text-white",
                          i > 2 && "bg-amber-100 text-amber-700"
                        )}
                      >
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate text-amber-900">
                          {b.company_name || b.bidder_name || "Unknown"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {b.bid_count ?? 0} bid{(b.bid_count ?? 0) === 1 ? "" : "s"}
                        </div>
                      </div>
                    </div>
                    {b.bbbee_level && (
                      <Badge variant="outline" className="border-amber-300 text-amber-700">
                        B-BBEE L{b.bbbee_level}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-amber-100">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-amber-600" /> Quick Actions
            </CardTitle>
            <CardDescription>Jump to common workflows</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <QuickAction
              icon={Bot}
              title="Generate a tender with AI"
              description="Draft a full tender in seconds"
              onClick={() => onJump("ai-writer")}
            />
            <QuickAction
              icon={Plus}
              title="Create a tender manually"
              description="Build a tender from scratch"
              onClick={() => onJump("tenders")}
            />
            <QuickAction
              icon={Gavel}
              title="Review bids"
              description="Run AI bid reviews and award"
              onClick={() => onJump("review")}
            />
            <QuickAction
              icon={Users}
              title="Manage team members"
              description="Approve pending members"
              onClick={() => onJump("members")}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/40 p-3 text-left hover:bg-amber-100 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-8 w-8 rounded-lg bg-amber-600 text-white flex items-center justify-center">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="font-medium text-sm text-amber-900">{title}</div>
          <div className="text-xs text-muted-foreground truncate">{description}</div>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-amber-600 shrink-0" />
    </button>
  );
}

// ============================================================
// 2. Tenders Tab
// ============================================================

const EMPTY_TENDER = {
  title: "",
  description: "",
  scope_of_work: "",
  category: "",
  location: "",
  closing_date: "",
  budget: "",
  contract_period: "",
  evaluation_criteria: "",
  contact_person: "",
  contact_email: "",
  contact_phone: "",
  ai_generated_content: "",
};

function TendersTab() {
  const [loading, setLoading] = useState(true);
  const [tenders, setTenders] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({ ...EMPTY_TENDER });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await issuerApi.listTenders();
      setTenders(res.items || []);
    } catch (err: any) {
      toast.error("Failed to load tenders", { description: err?.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_TENDER });
    setDialogOpen(true);
  };

  const openEdit = (t: any) => {
    setEditing(t);
    setForm({
      title: t.title || "",
      description: t.description || "",
      scope_of_work: t.scope_of_work || "",
      category: t.category || "",
      location: t.location || "",
      closing_date: toInputDate(t.closing_date),
      budget: t.budget ?? "",
      contract_period: t.contract_period || "",
      evaluation_criteria: t.evaluation_criteria || "",
      contact_person: t.contact_person || "",
      contact_email: t.contact_email || "",
      contact_phone: t.contact_phone || "",
      ai_generated_content: t.ai_generated_content || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Tender title is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        budget: form.budget === "" ? null : Number(form.budget),
        closing_date: form.closing_date ? new Date(form.closing_date).toISOString() : null,
      };
      if (editing) {
        await issuerApi.updateTender(editing.id, payload);
        toast.success("Tender updated");
      } else {
        await issuerApi.createTender(payload);
        toast.success("Tender created");
      }
      setDialogOpen(false);
      load();
    } catch (err: any) {
      toast.error("Failed to save tender", { description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: any) => {
    if (!confirm(`Delete tender "${t.title}"? This cannot be undone.`)) return;
    setDeletingId(t.id);
    try {
      await issuerApi.deleteTender(t.id);
      toast.success("Tender deleted");
      load();
    } catch (err: any) {
      toast.error("Failed to delete tender", { description: err?.message });
    } finally {
      setDeletingId(null);
    }
  };

  const handleTogglePublish = async (t: any) => {
    setTogglingId(t.id);
    try {
      if (t.is_published) {
        await issuerApi.unpublishTender(t.id);
        toast.success("Tender unpublished");
      } else {
        await issuerApi.publishTender(t.id);
        toast.success("Tender published — bidders can now submit bids");
      }
      load();
    } catch (err: any) {
      toast.error("Failed to change publish state", { description: err?.message });
    } finally {
      setTogglingId(null);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return tenders;
    const q = search.toLowerCase();
    return tenders.filter(
      (t) =>
        (t.title || "").toLowerCase().includes(q) ||
        (t.reference_number || "").toLowerCase().includes(q) ||
        (t.category || "").toLowerCase().includes(q)
    );
  }, [tenders, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-amber-900">Tenders</h1>
          <p className="text-sm text-muted-foreground">
            {tenders.length} tender{tenders.length === 1 ? "" : "s"} in your register
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          <Plus className="h-4 w-4 mr-1.5" /> Create Tender
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by title, reference, category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <CenteredSpinner label="Loading tenders…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileStack}
          title={search ? "No matches" : "No tenders yet"}
          description={
            search
              ? "Try a different search term."
              : "Click 'Create Tender' to publish your first tender."
          }
          action={
            !search && (
              <Button
                onClick={openCreate}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Plus className="h-4 w-4 mr-1.5" /> Create Tender
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((t) => (
            <Card key={t.id} className="border-amber-100 hover:border-amber-300 transition-colors">
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                        {t.reference_number || `T-${t.id}`}
                      </span>
                      {t.is_published ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Published
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-600">
                          Draft
                        </Badge>
                      )}
                      {t.category && (
                        <Badge variant="outline" className="border-amber-300 text-amber-700">
                          {t.category}
                        </Badge>
                      )}
                      {t.awarded_bid_id && (
                        <Badge className="bg-amber-600 text-white hover:bg-amber-600">
                          <Award className="h-3 w-3 mr-1" /> Awarded
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-semibold text-amber-900 truncate">{t.title}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                      {t.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {t.location}
                        </span>
                      )}
                      {t.closing_date && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Closes {fmtDate(t.closing_date)}
                        </span>
                      )}
                      {t.budget != null && Number(t.budget) > 0 && (
                        <span className="flex items-center gap-1">
                          <Award className="h-3 w-3" /> {fmtRand(t.budget)}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Inbox className="h-3 w-3" /> {t.bid_count ?? 0} bid
                        {(t.bid_count ?? 0) === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(t)}
                      className="border-amber-300 text-amber-700 hover:bg-amber-50"
                    >
                      <Eye className="h-4 w-4 mr-1" /> View / Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTogglePublish(t)}
                      disabled={togglingId === t.id}
                      className={
                        t.is_published
                          ? "border-rose-300 text-rose-700 hover:bg-rose-50"
                          : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      }
                    >
                      {togglingId === t.id ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : t.is_published ? (
                        <Ban className="h-4 w-4 mr-1" />
                      ) : (
                        <Send className="h-4 w-4 mr-1" />
                      )}
                      {t.is_published ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(t)}
                      disabled={deletingId === t.id}
                      className="border-rose-300 text-rose-700 hover:bg-rose-50"
                    >
                      {deletingId === t.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-amber-900">
              {editing ? "Edit Tender" : "Create Tender"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Update the tender details below."
                : "Fill in the tender details. You can publish it once ready."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Title *">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Provision of security guarding services…"
              />
            </Field>
            <Field label="Category">
              <Select
                value={form.category}
                onValueChange={(v) => setForm({ ...form, category: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select sector…" />
                </SelectTrigger>
                <SelectContent>
                  {SECTORS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Description">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Short summary of the tender…"
            />
          </Field>

          <Field label="Scope of Work">
            <Textarea
              rows={4}
              value={form.scope_of_work}
              onChange={(e) => setForm({ ...form, scope_of_work: e.target.value })}
              placeholder="Detailed scope of work to be performed…"
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Location">
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="Sandton, Gauteng"
              />
            </Field>
            <Field label="Closing Date">
              <Input
                type="date"
                value={form.closing_date}
                onChange={(e) => setForm({ ...form, closing_date: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Budget (ZAR)">
              <Input
                type="number"
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value })}
                placeholder="5000000"
              />
            </Field>
            <Field label="Contract Period">
              <Input
                value={form.contract_period}
                onChange={(e) => setForm({ ...form, contract_period: e.target.value })}
                placeholder="24 months"
              />
            </Field>
          </div>

          <Field label="Evaluation Criteria">
            <Textarea
              rows={3}
              value={form.evaluation_criteria}
              onChange={(e) => setForm({ ...form, evaluation_criteria: e.target.value })}
              placeholder="e.g. Functionality 60%, Price 30%, B-BBEE 10%"
            />
          </Field>

          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Contact Person">
              <Input
                value={form.contact_person}
                onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                placeholder="Jane Doe"
              />
            </Field>
            <Field label="Contact Email">
              <Input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                placeholder="tenders@org.co.za"
              />
            </Field>
            <Field label="Contact Phone">
              <Input
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                placeholder="+27 11 123 4567"
              />
            </Field>
          </div>

          <Field label="Full Tender Document (AI-generated content)">
            <Textarea
              rows={6}
              value={form.ai_generated_content}
              onChange={(e) => setForm({ ...form, ai_generated_content: e.target.value })}
              placeholder="Paste or edit the full tender document text…"
              className="font-mono text-xs"
            />
          </Field>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {editing ? "Save Changes" : "Create Tender"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// 3. AI Tender Writer Tab
// ============================================================

interface AIGenResult {
  title?: string;
  description?: string;
  scope_of_work?: string;
  category?: string;
  location?: string;
  contract_period?: string;
  budget?: number | string;
  evaluation_criteria?: string;
  submission_method?: string;
  compulsory_documents?: string[];
  mandatory_requirements?: string[];
  functionality_requirements?: string[];
  ai_generated_content?: string;
}

function AIWriterTab() {
  const [prompt, setPrompt] = useState("");
  const [industry, setIndustry] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<AIGenResult | null>(null);
  const [saving, setSaving] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt describing the tender");
      return;
    }
    setGenerating(true);
    try {
      const r = await issuerApi.aiGenerateTender(prompt, industry || undefined);
      setResult(r as AIGenResult);
      toast.success("Tender generated!", {
        description: "Review the fields and save as a tender.",
      });
    } catch (err: any) {
      toast.error("AI generation failed", { description: err?.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    if (!result.title?.trim()) {
      toast.error("A title is required to save");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        title: result.title,
        description: result.description || "",
        scope_of_work: result.scope_of_work || "",
        category: result.category || industry || "",
        location: result.location || "",
        budget: result.budget === "" || result.budget == null ? null : Number(result.budget),
        contract_period: result.contract_period || "",
        evaluation_criteria: result.evaluation_criteria || "",
        ai_generated_content: result.ai_generated_content || "",
      };
      await issuerApi.createTender(payload);
      toast.success("Saved as a draft tender");
      setResult(null);
      setPrompt("");
    } catch (err: any) {
      toast.error("Failed to save tender", { description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  const set = (patch: Partial<AIGenResult>) =>
    setResult((prev) => (prev ? { ...prev, ...patch } : prev));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-amber-900">AI Tender Writer</h1>
        <p className="text-sm text-muted-foreground">
          Describe what you need procured and let AI draft a complete tender for you.
        </p>
      </div>

      <Card className="border-amber-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-amber-600" /> Prompt
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="What do you need to procure?">
            <Textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Provision of security guarding services for a shopping centre in Sandton for 24 months. Require Grade C guards, 24/7 cover, panic response, and PSIRA registration."
            />
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Industry (optional)">
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select sector…" />
                </SelectTrigger>
                <SelectContent>
                  {SECTORS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-end">
              <Button
                onClick={handleGenerate}
                disabled={generating || !prompt.trim()}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating (20-30s)…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Tender
                  </>
                )}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Tip: Be specific about scope, location, duration, and any compliance requirements
            (e.g. PSIRA, CIDB grading) for the best results.
          </p>
        </CardContent>
      </Card>

      {generating && !result && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-8 flex flex-col items-center text-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-amber-600" />
            <div>
              <p className="font-medium text-amber-900">Generating your tender…</p>
              <p className="text-sm text-muted-foreground">
                The AI is researching, structuring, and writing your tender. This usually takes
                20-30 seconds.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="border-amber-300">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-amber-600" /> Generated Tender
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setResult(null)}>
                  <X className="h-4 w-4 mr-1" /> Discard
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1" />
                  )}
                  Save as Tender
                </Button>
              </div>
            </div>
            <CardDescription>Edit any field below before saving.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Title">
                <Input
                  value={result.title || ""}
                  onChange={(e) => set({ title: e.target.value })}
                />
              </Field>
              <Field label="Category">
                <Input
                  value={result.category || ""}
                  onChange={(e) => set({ category: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Description">
              <Textarea
                rows={3}
                value={result.description || ""}
                onChange={(e) => set({ description: e.target.value })}
              />
            </Field>

            <Field label="Scope of Work">
              <Textarea
                rows={5}
                value={result.scope_of_work || ""}
                onChange={(e) => set({ scope_of_work: e.target.value })}
              />
            </Field>

            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Location">
                <Input
                  value={result.location || ""}
                  onChange={(e) => set({ location: e.target.value })}
                />
              </Field>
              <Field label="Contract Period">
                <Input
                  value={result.contract_period || ""}
                  onChange={(e) => set({ contract_period: e.target.value })}
                />
              </Field>
              <Field label="Budget (ZAR)">
                <Input
                  type="number"
                  value={result.budget ?? ""}
                  onChange={(e) => set({ budget: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Evaluation Criteria">
              <Textarea
                rows={2}
                value={result.evaluation_criteria || ""}
                onChange={(e) => set({ evaluation_criteria: e.target.value })}
              />
            </Field>

            <Field label="Submission Method">
              <Textarea
                rows={2}
                value={result.submission_method || ""}
                onChange={(e) => set({ submission_method: e.target.value })}
              />
            </Field>

            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Compulsory Documents">
                <Textarea
                  rows={5}
                  value={(result.compulsory_documents || []).join("\n")}
                  onChange={(e) =>
                    set({
                      compulsory_documents: e.target.value.split("\n").filter(Boolean),
                    })
                  }
                  placeholder="One per line…"
                  className="text-xs"
                />
              </Field>
              <Field label="Mandatory Requirements">
                <Textarea
                  rows={5}
                  value={(result.mandatory_requirements || []).join("\n")}
                  onChange={(e) =>
                    set({
                      mandatory_requirements: e.target.value.split("\n").filter(Boolean),
                    })
                  }
                  placeholder="One per line…"
                  className="text-xs"
                />
              </Field>
              <Field label="Functionality Requirements">
                <Textarea
                  rows={5}
                  value={(result.functionality_requirements || []).join("\n")}
                  onChange={(e) =>
                    set({
                      functionality_requirements: e.target.value.split("\n").filter(Boolean),
                    })
                  }
                  placeholder="One per line…"
                  className="text-xs"
                />
              </Field>
            </div>

            <Field label="Full Tender Document">
              <Textarea
                rows={10}
                value={result.ai_generated_content || ""}
                onChange={(e) => set({ ai_generated_content: e.target.value })}
                className="font-mono text-xs"
              />
            </Field>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// 4. Bid Management Tab
// ============================================================

function BidManagementTab() {
  const [loading, setLoading] = useState(true);
  const [bids, setBids] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [detailBid, setDetailBid] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await issuerApi.listAllBids();
      setBids(res.items || []);
    } catch (err: any) {
      toast.error("Failed to load bids", { description: err?.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (b: any) => {
    if (!confirm(`Delete bid from "${b.bidder_company || b.contact_person}"?`)) return;
    setDeletingId(b.id);
    try {
      await issuerApi.deleteBid(b.id);
      toast.success("Bid deleted");
      setDetailBid(null);
      load();
    } catch (err: any) {
      toast.error("Failed to delete bid", { description: err?.message });
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return bids;
    const q = search.toLowerCase();
    return bids.filter(
      (b) =>
        (b.bidder_company || "").toLowerCase().includes(q) ||
        (b.contact_person || "").toLowerCase().includes(q) ||
        (b.tender_title || "").toLowerCase().includes(q) ||
        (b.tender_reference || "").toLowerCase().includes(q)
    );
  }, [bids, search]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-amber-900">Bid Management</h1>
        <p className="text-sm text-muted-foreground">
          All bids received across all your tenders.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by bidder, contact, tender…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <CenteredSpinner label="Loading bids…" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={search ? "No matches" : "No bids yet"}
          description={
            search
              ? "Try a different search term."
              : "Publish tenders to start receiving bids."
          }
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((b) => (
            <Card key={b.id} className="border-amber-100 hover:border-amber-300 transition-colors">
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <BidStatusBadge status={b.status} awarded={!!b.awarded} />
                      {b.bbbee_level && (
                        <Badge variant="outline" className="border-amber-300 text-amber-700">
                          B-BBEE L{b.bbbee_level}
                        </Badge>
                      )}
                      <span className="font-mono text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                        {b.tender_reference || `T-${b.tender_id}`}
                      </span>
                    </div>
                    <h3 className="font-semibold text-amber-900 truncate">
                      {b.bidder_company || "Unknown bidder"}
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                      <span>{b.contact_person || "—"}</span>
                      <span>{b.contact_email || ""}</span>
                      <span>Submitted {fmtDate(b.submitted_at || b.created_at)}</span>
                      <span className="font-medium text-amber-800">
                        {fmtRand(b.total_amount)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      Tender: {b.tender_title || "—"}
                    </p>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDetailBid(b)}
                      className="border-amber-300 text-amber-700 hover:bg-amber-50"
                    >
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(b)}
                      disabled={deletingId === b.id}
                      className="border-rose-300 text-rose-700 hover:bg-rose-50"
                    >
                      {deletingId === b.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BidDetailDialog bid={detailBid} onClose={() => setDetailBid(null)} />
    </div>
  );
}

function BidStatusBadge({ status, awarded }: { status?: string; awarded?: boolean }) {
  if (awarded || status === "awarded") {
    return (
      <Badge className="bg-amber-600 text-white hover:bg-amber-600">
        <Crown className="h-3 w-3 mr-1" /> Awarded
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge variant="outline" className="border-rose-300 text-rose-700">
        <XCircle className="h-3 w-3 mr-1" /> Rejected
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
      <Clock className="h-3 w-3 mr-1" /> Pending
    </Badge>
  );
}

function BidDetailDialog({ bid, onClose }: { bid: any | null; onClose: () => void }) {
  return (
    <Dialog open={!!bid} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {bid && (
          <>
            <DialogHeader>
              <DialogTitle className="text-amber-900">Bid Details</DialogTitle>
              <DialogDescription>
                From <span className="font-semibold">{bid.bidder_company}</span> for{" "}
                {bid.tender_title || bid.tender_reference}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <DetailItem label="Bidder Company" value={bid.bidder_company} />
                <DetailItem label="Contact Person" value={bid.contact_person} />
                <DetailItem label="Contact Email" value={bid.contact_email} />
                <DetailItem label="Contact Phone" value={bid.contact_phone} />
                <DetailItem label="Tender" value={bid.tender_title || bid.tender_reference} />
                <DetailItem label="Submitted" value={fmtDateTime(bid.submitted_at || bid.created_at)} />
                <DetailItem label="Total Amount" value={fmtRand(bid.total_amount)} highlight />
                <DetailItem label="B-BBEE Level" value={bid.bbbee_level ? `Level ${bid.bbbee_level}` : "—"} />
                <DetailItem label="Status" value={bid.awarded ? "Awarded" : bid.status || "Pending"} />
                <DetailItem label="Validity (days)" value={bid.validity_days ?? "—"} />
              </div>

              {bid.proposal_summary && (
                <div>
                  <h4 className="text-sm font-semibold text-amber-900 mb-1">Proposal Summary</h4>
                  <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-3 text-sm whitespace-pre-wrap">
                    {bid.proposal_summary}
                  </div>
                </div>
              )}

              {bid.ai_review && (
                <div>
                  <h4 className="text-sm font-semibold text-amber-900 mb-1 flex items-center gap-1.5">
                    <Bot className="h-4 w-4 text-amber-600" /> AI Review
                  </h4>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm whitespace-pre-wrap">
                    {bid.ai_review}
                  </div>
                  {(bid.technical_score != null || bid.financial_score != null) && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <ScoreCard label="Technical" value={bid.technical_score} />
                      <ScoreCard label="Financial" value={bid.financial_score} />
                    </div>
                  )}
                </div>
              )}

              {bid.documents && bid.documents.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-amber-900 mb-1">
                    Documents ({bid.documents.length})
                  </h4>
                  <ul className="space-y-1">
                    {bid.documents.map((d: any, i: number) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 rounded border border-amber-100 bg-amber-50/40 px-3 py-1.5 text-sm"
                      >
                        <FileText className="h-3.5 w-3.5 text-amber-600" />
                        <span className="truncate">{d.filename || d.name || `Document ${i + 1}`}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailItem({
  label,
  value,
  highlight,
}: {
  label: string;
  value?: string | number | null;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "font-medium",
          highlight ? "text-amber-700 text-base" : "text-amber-900"
        )}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

function ScoreCard({ label, value }: { label: string; value?: number | null }) {
  const v = typeof value === "number" ? value : 0;
  return (
    <div className="rounded-lg border border-amber-200 bg-white p-3">
      <div className="text-xs text-muted-foreground">{label} Score</div>
      <div className="text-2xl font-bold text-amber-700">{v}/100</div>
      <Progress value={v} className="h-1.5 mt-2 [&>div]:bg-amber-600" />
    </div>
  );
}

// ============================================================
// 5. Top Bidders Tab
// ============================================================

function TopBiddersTab() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any | null>(null);
  const [tenders, setTenders] = useState<any[]>([]);
  const [selectedTenderId, setSelectedTenderId] = useState<number | null>(null);
  const [tenderBids, setTenderBids] = useState<any[]>([]);
  const [loadingBids, setLoadingBids] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([issuerApi.getStats(), issuerApi.listTenders()]);
      setStats(s);
      setTenders(t.items || []);
    } catch (err: any) {
      toast.error("Failed to load bidders", { description: err?.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedTenderId) {
      setTenderBids([]);
      return;
    }
    setLoadingBids(true);
    issuerApi
      .listTenderBids(selectedTenderId)
      .then((r) => setTenderBids(r.items || []))
      .catch((err) => toast.error("Failed to load bids for tender", { description: err?.message }))
      .finally(() => setLoadingBids(false));
  }, [selectedTenderId]);

  if (loading) return <CenteredSpinner label="Loading bidders…" />;

  const topBidders: any[] = stats?.top_bidders ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-amber-900">Top Bidders</h1>
        <p className="text-sm text-muted-foreground">
          Most active bidders on your tenders and per-tender bid breakdowns.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="border-amber-100">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-amber-600" /> Leaderboard
            </CardTitle>
            <CardDescription>Ranked by number of bids submitted</CardDescription>
          </CardHeader>
          <CardContent>
            {topBidders.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title="No bidders yet"
                description="Once tenders start receiving bids, your top bidders will appear here."
              />
            ) : (
              <ul className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {topBidders.map((b, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-amber-100 bg-amber-50/40 p-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0",
                          i === 0 && "bg-amber-500 text-white",
                          i === 1 && "bg-slate-400 text-white",
                          i === 2 && "bg-orange-400 text-white",
                          i > 2 && "bg-amber-100 text-amber-700"
                        )}
                      >
                        {i === 0 ? <Crown className="h-4 w-4" /> : i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate text-amber-900">
                          {b.company_name || b.bidder_name || "Unknown"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {b.bid_count ?? 0} bid{(b.bid_count ?? 0) === 1 ? "" : "s"}
                          {b.total_value ? ` · ${fmtRand(b.total_value)}` : ""}
                        </div>
                      </div>
                    </div>
                    {b.bbbee_level && (
                      <Badge variant="outline" className="border-amber-300 text-amber-700">
                        B-BBEE L{b.bbbee_level}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="border-amber-100">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileStack className="h-4 w-4 text-amber-600" /> Bids Per Tender
            </CardTitle>
            <CardDescription>Click a tender to see its bids</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {tenders.length === 0 ? (
              <EmptyState
                icon={FileStack}
                title="No tenders"
                description="Create tenders to start receiving bids."
              />
            ) : (
              <>
                <ul className="space-y-1 max-h-64 overflow-y-auto pr-1">
                  {tenders.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedTenderId(t.id)}
                        className={cn(
                          "w-full flex items-center justify-between rounded-lg p-2.5 text-left text-sm transition-colors",
                          selectedTenderId === t.id
                            ? "bg-amber-600 text-white"
                            : "hover:bg-amber-100 text-amber-900"
                        )}
                      >
                        <span className="truncate">
                          <span className="font-mono text-xs opacity-70 mr-2">
                            {t.reference_number || `T-${t.id}`}
                          </span>
                          {t.title}
                        </span>
                        <Badge
                          className={cn(
                            "shrink-0 ml-2",
                            selectedTenderId === t.id
                              ? "bg-white/20 text-white"
                              : "bg-amber-100 text-amber-800"
                          )}
                        >
                          {t.bid_count ?? 0}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>

                <Separator />

                {!selectedTenderId ? (
                  <div className="text-center text-sm text-muted-foreground py-6">
                    Select a tender above to view its bids.
                  </div>
                ) : loadingBids ? (
                  <CenteredSpinner label="Loading bids…" small />
                ) : tenderBids.length === 0 ? (
                  <EmptyState icon={Inbox} title="No bids" description="This tender has no bids yet." />
                ) : (
                  <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {tenderBids.map((b) => (
                      <li
                        key={b.id}
                        className="rounded-lg border border-amber-100 bg-amber-50/40 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate text-amber-900">
                              {b.bidder_company || "Unknown"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {b.contact_person || "—"} · {fmtDate(b.submitted_at || b.created_at)}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-semibold text-amber-800 text-sm">
                              {fmtRand(b.total_amount)}
                            </div>
                            {b.awarded && (
                              <Badge className="bg-amber-600 text-white hover:bg-amber-600 mt-1">
                                <Crown className="h-3 w-3 mr-1" /> Awarded
                              </Badge>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// 6. Bid Review Tab
// ============================================================

function BidReviewTab() {
  const [loading, setLoading] = useState(true);
  const [tenders, setTenders] = useState<any[]>([]);
  const [selectedTenderId, setSelectedTenderId] = useState<number | null>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [loadingBids, setLoadingBids] = useState(false);
  const [reviewingBidId, setReviewingBidId] = useState<number | null>(null);
  const [awardingBidId, setAwardingBidId] = useState<number | null>(null);
  const [expandedBidId, setExpandedBidId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await issuerApi.listTenders();
      const items = res.items || [];
      setTenders(items);
      if (items.length > 0 && !selectedTenderId) {
        setSelectedTenderId(items[0].id);
      }
    } catch (err: any) {
      toast.error("Failed to load tenders", { description: err?.message });
    } finally {
      setLoading(false);
    }
  }, [selectedTenderId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadBids = useCallback(async (tenderId: number) => {
    setLoadingBids(true);
    try {
      const r = await issuerApi.listTenderBids(tenderId);
      setBids(r.items || []);
    } catch (err: any) {
      toast.error("Failed to load bids", { description: err?.message });
      setBids([]);
    } finally {
      setLoadingBids(false);
    }
  }, []);

  useEffect(() => {
    if (selectedTenderId) loadBids(selectedTenderId);
    else setBids([]);
  }, [selectedTenderId, loadBids]);

  const handleReview = async (bid: any) => {
    setReviewingBidId(bid.id);
    try {
      const res = await issuerApi.aiReviewBid(bid.id);
      // Update the bid in state
      setBids((prev) =>
        prev.map((b) =>
          b.id === bid.id
            ? {
                ...b,
                ai_review: res.ai_review ?? res.review ?? res.summary ?? "",
                technical_score: res.technical_score ?? b.technical_score,
                financial_score: res.financial_score ?? b.financial_score,
                status: res.status ?? b.status,
              }
            : b
        )
      );
      setExpandedBidId(bid.id);
      toast.success("AI review complete");
    } catch (err: any) {
      toast.error("AI review failed", { description: err?.message });
    } finally {
      setReviewingBidId(null);
    }
  };

  const handleAward = async (bid: any, awarded: boolean) => {
    setAwardingBidId(bid.id);
    try {
      await issuerApi.awardBid(bid.id, awarded);
      setBids((prev) =>
        prev.map((b) =>
          b.id === bid.id ? { ...b, awarded } : b.tender_id === bid.tender_id ? { ...b, awarded: false } : b
        )
      );
      toast.success(awarded ? "Bid awarded" : "Award revoked");
    } catch (err: any) {
      toast.error("Failed to update award", { description: err?.message });
    } finally {
      setAwardingBidId(null);
    }
  };

  const recommended = useMemo(() => {
    const reviewed = bids.filter((b) => b.ai_review || b.technical_score != null);
    if (reviewed.length === 0) return null;
    return reviewed.sort((a, b) => {
      const sa = (a.technical_score ?? 0) + (a.financial_score ?? 0);
      const sb = (b.technical_score ?? 0) + (b.financial_score ?? 0);
      return sb - sa;
    })[0];
  }, [bids]);

  if (loading) return <CenteredSpinner label="Loading tenders…" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-amber-900">Bid Review</h1>
        <p className="text-sm text-muted-foreground">
          Run AI reviews on each bid and award the winning tender.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left panel: tenders */}
        <Card className="border-amber-100 lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileStack className="h-4 w-4 text-amber-600" /> Tenders
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tenders.length === 0 ? (
              <EmptyState
                icon={FileStack}
                title="No tenders"
                description="Create tenders first to receive bids."
              />
            ) : (
              <ul className="space-y-1 max-h-[70vh] overflow-y-auto pr-1">
                {tenders.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedTenderId(t.id)}
                      className={cn(
                        "w-full flex items-start justify-between gap-2 rounded-lg p-3 text-left transition-colors",
                        selectedTenderId === t.id
                          ? "bg-amber-600 text-white"
                          : "hover:bg-amber-100 text-amber-900"
                      )}
                    >
                      <div className="min-w-0">
                        <div
                          className={cn(
                            "font-mono text-[11px]",
                            selectedTenderId === t.id ? "text-amber-100" : "text-amber-700"
                          )}
                        >
                          {t.reference_number || `T-${t.id}`}
                        </div>
                        <div className="text-sm font-medium truncate">{t.title}</div>
                      </div>
                      <Badge
                        className={cn(
                          "shrink-0",
                          selectedTenderId === t.id
                            ? "bg-white/20 text-white"
                            : "bg-amber-100 text-amber-800"
                        )}
                      >
                        {t.bid_count ?? 0}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Right panel: bids */}
        <div className="lg:col-span-2 space-y-3">
          {!selectedTenderId ? (
            <EmptyState
              icon={Gavel}
              title="Select a tender"
              description="Pick a tender from the left to review its bids."
            />
          ) : loadingBids ? (
            <CenteredSpinner label="Loading bids…" />
          ) : bids.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No bids"
              description="This tender has not received any bids yet."
            />
          ) : (
            <>
              {recommended && (
                <Card className="border-amber-400 bg-gradient-to-br from-amber-50 to-amber-100/50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                      <Crown className="h-4 w-4" /> Recommended Winner
                    </div>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="font-bold text-amber-900">
                          {recommended.bidder_company || "Unknown"}
                        </div>
                        <div className="text-sm text-amber-700">
                          {recommended.contact_person || "—"} · {fmtRand(recommended.total_amount)}
                        </div>
                      </div>
                      <div className="flex gap-4">
                        {recommended.technical_score != null && (
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">Technical</div>
                            <div className="text-lg font-bold text-amber-800">
                              {recommended.technical_score}
                            </div>
                          </div>
                        )}
                        {recommended.financial_score != null && (
                          <div className="text-center">
                            <div className="text-xs text-muted-foreground">Financial</div>
                            <div className="text-lg font-bold text-amber-800">
                              {recommended.financial_score}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {bids.map((b) => (
                <Card key={b.id} className="border-amber-100">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-amber-900">
                            {b.bidder_company || "Unknown bidder"}
                          </h3>
                          <BidStatusBadge status={b.status} awarded={!!b.awarded} />
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {b.contact_person || "—"} · {fmtDate(b.submitted_at || b.created_at)} ·{" "}
                          <span className="font-medium text-amber-800">
                            {fmtRand(b.total_amount)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReview(b)}
                          disabled={reviewingBidId === b.id}
                          className="border-amber-300 text-amber-700 hover:bg-amber-50"
                        >
                          {reviewingBidId === b.id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Reviewing…
                            </>
                          ) : (
                            <>
                              <Bot className="h-4 w-4 mr-1" /> AI Review
                            </>
                          )}
                        </Button>
                        {b.awarded ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAward(b, false)}
                            disabled={awardingBidId === b.id}
                            className="border-rose-300 text-rose-700 hover:bg-rose-50"
                          >
                            {awardingBidId === b.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Ban className="h-4 w-4 mr-1" /> Revoke
                              </>
                            )}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleAward(b, true)}
                            disabled={awardingBidId === b.id}
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                          >
                            {awardingBidId === b.id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Award className="h-4 w-4 mr-1" />
                            )}
                            Award
                          </Button>
                        )}
                      </div>
                    </div>

                    {(b.technical_score != null || b.financial_score != null) && (
                      <div className="grid grid-cols-2 gap-2">
                        {b.technical_score != null && (
                          <ScoreCard label="Technical" value={b.technical_score} />
                        )}
                        {b.financial_score != null && (
                          <ScoreCard label="Financial" value={b.financial_score} />
                        )}
                      </div>
                    )}

                    {b.ai_review && (
                      <div>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedBidId(expandedBidId === b.id ? null : b.id)
                          }
                          className="flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900"
                        >
                          <Bot className="h-3.5 w-3.5" />
                          {expandedBidId === b.id ? "Hide" : "Show"} AI Review
                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 transition-transform",
                              expandedBidId === b.id && "rotate-90"
                            )}
                          />
                        </button>
                        {expandedBidId === b.id && (
                          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                            {b.ai_review}
                          </div>
                        )}
                      </div>
                    )}

                    {b.proposal_summary && !b.ai_review && (
                      <div className="text-xs text-muted-foreground italic line-clamp-2">
                        {b.proposal_summary}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 7. Members Tab
// ============================================================

function MembersTab({ company, currentUser }: { company: any; currentUser: any }) {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<any[]>([]);
  const [actingId, setActingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await issuerApi.listMembers();
      setMembers(res.items || []);
    } catch (err: any) {
      toast.error("Failed to load members", { description: err?.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (m: any) => {
    setActingId(m.id);
    try {
      await issuerApi.updateMember(m.id, "approved");
      toast.success(`${m.user_name || "Member"} approved`);
      load();
    } catch (err: any) {
      toast.error("Failed to approve member", { description: err?.message });
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (m: any) => {
    setActingId(m.id);
    try {
      await issuerApi.updateMember(m.id, "rejected");
      toast.success(`${m.user_name || "Member"} rejected`);
      load();
    } catch (err: any) {
      toast.error("Failed to reject member", { description: err?.message });
    } finally {
      setActingId(null);
    }
  };

  const handleRemove = async (m: any) => {
    if (!confirm(`Remove ${m.user_name || m.user_email} from the team?`)) return;
    setActingId(m.id);
    try {
      await issuerApi.removeMember(m.id);
      toast.success("Member removed");
      load();
    } catch (err: any) {
      toast.error("Failed to remove member", { description: err?.message });
    } finally {
      setActingId(null);
    }
  };

  const currentMember = members.find((m) => m.user_id === currentUser?.id);
  const isAdmin = currentMember?.role === "admin";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-amber-900">Team Members</h1>
        <p className="text-sm text-muted-foreground">
          {company?.name} · {members.length} member{members.length === 1 ? "" : "s"}
        </p>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900">
        <p className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Team members who register with your company name will appear here as pending —
            approve them to grant access.
          </span>
        </p>
      </div>

      {loading ? (
        <CenteredSpinner label="Loading members…" />
      ) : members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members"
          description="You are the only member so far."
        />
      ) : (
        <div className="grid gap-3">
          {members.map((m) => {
            const isCurrent = m.user_id === currentUser?.id;
            return (
              <Card key={m.id} className="border-amber-100">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-10 w-10 border border-amber-200">
                        <AvatarFallback className="bg-amber-100 text-amber-700 text-xs font-semibold">
                          {initials(m.user_name || m.user_email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-amber-900">
                            {m.user_name || "Unknown"}
                          </span>
                          {isCurrent && (
                            <Badge variant="outline" className="border-amber-400 text-amber-700">
                              You
                            </Badge>
                          )}
                          {m.role === "admin" && (
                            <Badge className="bg-amber-600 text-white hover:bg-amber-600">
                              <ShieldCheck className="h-3 w-3 mr-1" /> Admin
                            </Badge>
                          )}
                          {m.status === "pending" && (
                            <Badge variant="outline" className="border-orange-300 text-orange-700">
                              <Clock className="h-3 w-3 mr-1" /> Pending
                            </Badge>
                          )}
                          {m.status === "approved" && (
                            <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Approved
                            </Badge>
                          )}
                          {m.status === "rejected" && (
                            <Badge variant="outline" className="border-rose-300 text-rose-700">
                              <XCircle className="h-3 w-3 mr-1" /> Rejected
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {m.user_email || "—"}
                          {m.job_title && ` · ${m.job_title}`}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 shrink-0">
                      {m.status === "pending" && isAdmin && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleApprove(m)}
                            disabled={actingId === m.id}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            {actingId === m.id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                            )}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(m)}
                            disabled={actingId === m.id}
                            className="border-rose-300 text-rose-700 hover:bg-rose-50"
                          >
                            <XCircle className="h-4 w-4 mr-1" /> Reject
                          </Button>
                        </>
                      )}
                      {m.status === "approved" && isAdmin && !isCurrent && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRemove(m)}
                          disabled={actingId === m.id}
                          className="border-rose-300 text-rose-700 hover:bg-rose-50"
                        >
                          {actingId === m.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 8. Settings Tab
// ============================================================

function SettingsTab({ company }: { company: any }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-amber-900">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Company profile and portal configuration.
        </p>
      </div>

      <Card className="border-amber-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-amber-600" /> Company Profile
          </CardTitle>
          <CardDescription>
            Read-only view of your company details.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <SettingsItem icon={Building2} label="Company Name" value={company?.name} />
            <SettingsItem
              icon={FileText}
              label="Registration Number"
              value={company?.registration_number}
            />
            <SettingsItem icon={Sparkles} label="Industry" value={company?.industry} />
            <SettingsItem icon={MapPin} label="Address" value={company?.address} />
            <SettingsItem icon={Phone} label="Phone" value={company?.phone} />
            <SettingsItem icon={Mail} label="Email" value={company?.email} />
            <SettingsItem icon={Globe} label="Website" value={company?.website} />
            <SettingsItem
              icon={Users}
              label="Member Count"
              value={company?.member_count != null ? String(company.member_count) : undefined}
            />
          </div>

          {company?.description && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Description</div>
              <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-3 text-sm">
                {company.description}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <p className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                <span className="font-semibold">Heads up:</span> Company settings editing is
                coming soon. For now this view is read-only.
              </span>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-lg border border-amber-100 bg-white p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 font-medium text-amber-900 break-words">{value || "—"}</div>
    </div>
  );
}

// ============================================================
// Reusable bits
// ============================================================

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-amber-900">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function CenteredSpinner({ label, small }: { label: string; small?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 text-amber-700", small ? "py-6" : "py-16")}>
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="border-dashed border-amber-200 bg-amber-50/30">
      <CardContent className="p-8 flex flex-col items-center text-center gap-3">
        <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
          <Icon className="h-6 w-6 text-amber-600" />
        </div>
        <div>
          <h3 className="font-semibold text-amber-900">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  );
}
