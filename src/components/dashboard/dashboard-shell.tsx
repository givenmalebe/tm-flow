"use client";

import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FileStack,
  FolderCheck,
  MapPin,
  Calculator,
  Send,
  MessageSquare,
  FileDiff,
  Bot,
  LogOut,
  Menu,
  Bell,
  Search,
  User2,
  Radar,
  ScanText,
  Building,
  FileSignature,
  CalendarClock,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import { useDashboardStore, type DashboardTab } from "@/lib/dashboard-store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DashboardTab as DashboardTabView } from "./tabs/dashboard-tab";
import { TendersTab } from "./tabs/tenders-tab";
import { PreparationTab } from "./tabs/preparation-tab";
import { DiscoverTab } from "./tabs/discover-tab";
import { ReaderTab } from "./tabs/reader-tab";
import { LibraryTab } from "./tabs/library-tab";
import { CompanyTab } from "./tabs/company-tab";
import { DeadlinesTab } from "./tabs/deadlines-tab";
import { BriefingsTab } from "./tabs/briefings-tab";
import { PricingTab } from "./tabs/pricing-tab";
import { SubmissionsTab } from "./tabs/submissions-tab";
import { ClarificationsTab } from "./tabs/clarifications-tab";
import { AddendumsTab } from "./tabs/addendums-tab";
import { AssistantTab } from "./tabs/assistant-tab";
import { toast } from "sonner";

interface NavItem {
  id: DashboardTab;
  label: string;
  icon: React.ElementType;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Overview & alerts" },
  { id: "tenders", label: "Tenders", icon: FileStack, description: "Tender register" },
  { id: "preparation", label: "Preparation", icon: ClipboardCheck, description: "Completion tracking" },
  { id: "discover", label: "Discover Tenders", icon: Radar, description: "AI tender finder" },
  { id: "reader", label: "AI Document Reader", icon: ScanText, description: "Read & extract tenders" },
  { id: "deadlines", label: "Deadlines", icon: CalendarClock, description: "Track & remind" },
  { id: "library", label: "Compliance Library", icon: FolderCheck, description: "Company documents" },
  { id: "company", label: "Company Profile", icon: Building, description: "Branding & letterhead" },
  { id: "briefings", label: "Briefings", icon: MapPin, description: "Site inspections" },
  { id: "pricing", label: "Pricing", icon: Calculator, description: "Pricing versions" },
  { id: "submissions", label: "Submissions", icon: Send, description: "Submitted tenders" },
  { id: "clarifications", label: "Clarifications", icon: MessageSquare, description: "Communications" },
  { id: "addendums", label: "Addendums", icon: FileDiff, description: "Tender changes" },
  { id: "assistant", label: "AI Assistant", icon: Bot, description: "Ask about tenders" },
];

export function DashboardShell() {
  const { user, logout } = useAuth();
  const { activeTab, setTab } = useDashboardStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [alertsCount, setAlertsCount] = useState(0);

  // Fetch dashboard alerts count
  useEffect(() => {
    let mounted = true;
    api.dashboard().then((d) => {
      if (!mounted) return;
      setAlertsCount(d.docs_expiring_soon + d.docs_expired + d.closing_this_week);
    }).catch(() => {});
    return () => { mounted = false; };
  }, [activeTab]);

  // Debounced search — use the useEffect only to schedule the fetch, and
  // keep the immediate clearing inside the onChange handler of the input.
  useEffect(() => {
    if (!search.trim()) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await api.listTenders({ search });
        if (cancelled) return;
        setSearchResults(res.items.slice(0, 8));
        setShowSearchResults(true);
      } catch {
        // ignore
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (!value.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
    }
  };

  const handleNav = (id: DashboardTab) => {
    setTab(id);
    setMobileOpen(false);
  };

  const handleSearchClick = (tenderId: number) => {
    setTab("tenders");
    setTimeout(() => useDashboardStore.getState().selectTender(tenderId), 50);
    setSearch("");
    setShowSearchResults(false);
  };

  const initials = (user?.full_name || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center gap-3 px-4 lg:px-6">
          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="px-4 py-4 border-b">
                <SheetTitle className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                    <FileStack className="h-4 w-4 text-primary-foreground" />
                  </div>
                  TenderFlow
                </SheetTitle>
              </SheetHeader>
              <nav className="p-3 space-y-1">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNav(item.id)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      activeTab === item.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1 text-left">{item.label}</span>
                  </button>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          {/* Logo / brand */}
          <div className="flex items-center gap-2 lg:gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shadow-sm">
              <FileStack className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="hidden sm:block">
              <div className="text-base font-semibold leading-tight">TenderFlow</div>
              <div className="text-[10px] text-muted-foreground leading-tight">
                AI Tender Management
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-md mx-auto hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tenders by ref, title, client…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => search && setShowSearchResults(true)}
              onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
              className="pl-9"
            />
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute top-full mt-1 w-full rounded-md border bg-popover shadow-lg z-50 max-h-80 overflow-y-auto scrollbar-thin">
                {searchResults.map((t) => (
                  <button
                    key={t.id}
                    onMouseDown={() => handleSearchClick(t.id)}
                    className="w-full text-left px-3 py-2 hover:bg-accent transition-colors border-b last:border-b-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {t.reference_number} — {t.title}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {t.client_company}
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {t.status}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTab("dashboard")}
              className="relative"
              title="Alerts"
            >
              <Bell className="h-5 w-5" />
              {alertsCount > 0 && (
                <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center">
                  {alertsCount > 99 ? "99+" : alertsCount}
                </span>
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium max-w-[120px] truncate">
                    {user?.full_name}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium truncate">{user?.full_name}</span>
                    <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
                    {user?.company_name && (
                      <span className="text-xs text-muted-foreground truncate">{user.company_name}</span>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-rose-600 focus:text-rose-700 focus:bg-rose-50 dark:focus:bg-rose-950 cursor-pointer"
                  onClick={() => {
                    logout();
                    toast.success("Signed out");
                  }}
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-thin">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={cn(
                  "w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors group",
                  activeTab === item.id
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "hover:bg-sidebar-accent text-sidebar-foreground"
                )}
              >
                <item.icon className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium leading-tight">{item.label}</div>
                  <div
                    className={cn(
                      "text-[11px] leading-tight mt-0.5 truncate",
                      activeTab === item.id
                        ? "text-sidebar-primary-foreground/70"
                        : "text-sidebar-foreground/60"
                    )}
                  >
                    {item.description}
                  </div>
                </div>
              </button>
            ))}
          </nav>
          <div className="p-3 border-t border-sidebar-border">
            <div className="rounded-lg bg-sidebar-accent/50 p-3 text-xs">
              <div className="flex items-center gap-2 text-sidebar-foreground">
                <User2 className="h-3.5 w-3.5" />
                <span className="font-medium truncate">{user?.full_name}</span>
              </div>
              <div className="text-sidebar-foreground/60 mt-1 truncate">{user?.email}</div>
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto scrollbar-thin">
          <div className="p-4 lg:p-6 max-w-[1600px] mx-auto animate-fade-in">
            {activeTab === "dashboard" && <DashboardTabView />}
            {activeTab === "tenders" && <TendersTab />}
            {activeTab === "preparation" && <PreparationTab />}
            {activeTab === "discover" && <DiscoverTab />}
            {activeTab === "reader" && <ReaderTab />}
            {activeTab === "deadlines" && <DeadlinesTab />}
            {activeTab === "library" && <LibraryTab />}
            {activeTab === "company" && <CompanyTab />}
            {activeTab === "briefings" && <BriefingsTab />}
            {activeTab === "pricing" && <PricingTab />}
            {activeTab === "submissions" && <SubmissionsTab />}
            {activeTab === "clarifications" && <ClarificationsTab />}
            {activeTab === "addendums" && <AddendumsTab />}
            {activeTab === "assistant" && <AssistantTab />}
          </div>
        </main>
      </div>
    </div>
  );
}
