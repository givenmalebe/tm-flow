"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Send,
  Trash2,
  Sparkles,
  AlertCircle,
  ArrowRight,
  X,
  Loader2,
  Database,
  PanelLeft,
  RefreshCw,
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { useDashboardStore } from "@/lib/dashboard-store";
import { cn } from "@/lib/utils";

// ---- Types ----
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  contextTenders?: number;
  createdAt: number;
}

interface TenderOption {
  id: number;
  reference_number: string;
  title: string;
  client_company?: string | null;
  status?: string | null;
}

// ---- Suggested questions ----
// All 15 questions from the user's spec + additional helpful questions
const SUGGESTED_QUESTIONS: { q: string; label: string }[] = [
  // The user's 15 example questions (in order)
  {
    q: "Which tenders are closing this week?",
    label: "Closing this week",
  },
  {
    q: "What tenders do we currently have open?",
    label: "Open tenders",
  },
  {
    q: "What documents are missing for Tender E137?",
    label: "Missing docs (E137)",
  },
  {
    q: "Which tenders require a compulsory briefing?",
    label: "Compulsory briefings",
  },
  {
    q: "What are the requirements for Tender E137?",
    label: "Requirements (E137)",
  },
  {
    q: "Summarise this tender for me.",
    label: "Summarise tender",
  },
  {
    q: "What are the potential disqualification requirements?",
    label: "Disqualifications",
  },
  {
    q: "What PSIRA grades are required?",
    label: "PSIRA grades",
  },
  {
    q: "How many guards are required?",
    label: "Guards required",
  },
  {
    q: "What is the closing date?",
    label: "Closing date",
  },
  {
    q: "What is the evaluation criteria?",
    label: "Evaluation criteria",
  },
  {
    q: "Which of our documents are going to expire before this tender closes?",
    label: "Expiring before close",
  },
  {
    q: "Show me all tenders that we have submitted and are still waiting for an outcome.",
    label: "Awaiting outcome",
  },
  {
    q: "Which tenders have we won this year?",
    label: "Won this year",
  },
  {
    q: "Which tenders were unsuccessful and why?",
    label: "Unsuccessful & why",
  },
  // Additional helpful questions
  {
    q: "What should I do next to win my most urgent tender? Give me a prioritized action plan.",
    label: "Help me win",
  },
  {
    q: "What's in the tender document I uploaded? Give me the key details.",
    label: "Tender document",
  },
  {
    q: "What's our pricing for each tender?",
    label: "Pricing",
  },
  {
    q: "What changed in the addendums for my tenders?",
    label: "Addendum changes",
  },
  {
    q: "Which of our compliance documents are expiring soon?",
    label: "Expiring docs",
  },
];

// Subset shown in the empty-state hero
const HERO_QUESTIONS = SUGGESTED_QUESTIONS.slice(0, 6);

// ---- Helpers ----
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getUserInitials(): string {
  try {
    const raw = localStorage.getItem("tenderflow_user");
    if (!raw) return "U";
    const u = JSON.parse(raw);
    const name: string = u?.full_name || u?.email || "U";
    return name
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  } catch {
    return "U";
  }
}

function tenderLabel(t: TenderOption): string {
  const ref = t.reference_number || `#${t.id}`;
  const title = t.title ? ` — ${t.title}` : "";
  return `${ref}${title}`;
}

// ---- Bot avatar ----
function BotAvatar({
  size = "md",
  pulsing = false,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  pulsing?: boolean;
}) {
  const sizes: Record<string, string> = {
    sm: "h-8 w-8",
    md: "h-9 w-9",
    lg: "h-11 w-11",
    xl: "h-16 w-16",
  };
  const iconSizes: Record<string, string> = {
    sm: "h-4 w-4",
    md: "h-[18px] w-[18px]",
    lg: "h-5 w-5",
    xl: "h-8 w-8",
  };
  return (
    <div
      className={cn(
        "relative flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm ring-1 ring-emerald-600/20",
        sizes[size]
      )}
    >
      {pulsing && (
        <span className="absolute inset-0 rounded-full bg-emerald-400/40 animate-ping" />
      )}
      <Bot className={cn("relative", iconSizes[size])} />
    </div>
  );
}

// ---- User avatar ----
function UserAvatar({ initials }: { initials: string }) {
  return (
    <Avatar className="h-9 w-9 border border-border bg-muted">
      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
        {initials || "U"}
      </AvatarFallback>
    </Avatar>
  );
}

// ---- Typing indicator ----
function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 rounded-full bg-emerald-500/70"
          style={{
            animation: "tf-typing 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.18}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes tf-typing {
          0%,
          60%,
          100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          30% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

// ---- Message bubble ----
function MessageBubble({
  message,
  initials,
  onRetry,
}: {
  message: ChatMessage;
  initials: string;
  onRetry?: () => void;
}) {
  const isUser = message.role === "user";
  const isError = !!message.error;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "flex w-full gap-3 px-1",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="mt-1 shrink-0">
          <BotAvatar size="sm" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
          isUser
            ? "rounded-br-md bg-primary/10 text-foreground"
            : isError
              ? "rounded-bl-md border border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100"
              : "rounded-bl-md border border-border bg-card text-card-foreground"
        )}
      >
        <div
          className="whitespace-pre-wrap break-words leading-relaxed"
          style={{ overflowWrap: "anywhere" }}
        >
          {message.content}
        </div>

        {isError && onRetry && (
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-100 hover:text-rose-800 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/50"
              onClick={onRetry}
            >
              <RefreshCw className="h-3 w-3" />
              Try again
            </Button>
          </div>
        )}

        {!isUser && !isError && typeof message.contextTenders === "number" && (
          <div className="mt-2 flex items-center gap-1.5 border-t border-border/40 pt-1.5 text-[11px] text-muted-foreground">
            <Database className="h-3 w-3" />
            <span>
              Based on {message.contextTenders}{" "}
              {message.contextTenders === 1 ? "tender" : "tenders"}, all
              uploaded documents & your compliance library
            </span>
          </div>
        )}
      </div>

      {isUser && (
        <div className="mt-1 shrink-0">
          <UserAvatar initials={initials} />
        </div>
      )}
    </motion.div>
  );
}

// ---- Empty-state hero ----
function EmptyHero({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4 py-8 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex flex-col items-center gap-4"
      >
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-emerald-400/20 blur-2xl" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg ring-4 ring-emerald-500/10">
            <Bot className="h-10 w-10" />
            <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white dark:bg-zinc-900 shadow">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            How can I help you win your tenders today?
          </h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            I know everything in your system — every tender, every uploaded document's
            content, your compliance library, checklists, pricing, briefings, submissions
            and communications. My mission is to help you win. Ask me anything.
          </p>
        </div>

        <div className="mt-4 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
          {HERO_QUESTIONS.map((q) => (
            <button
              key={q.q}
              onClick={() => onPick(q.q)}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left text-sm transition-all hover:border-emerald-300 hover:bg-emerald-50/50 hover:shadow-sm dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 transition-colors group-hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:group-hover:bg-emerald-900">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="flex-1 text-foreground">{q.q}</span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600" />
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ---- Left rail content (shared between desktop & mobile sheet) ----
function LeftRailContent({
  tenders,
  tendersLoading,
  focusTenderId,
  onFocusChange,
  onPickQuestion,
  totalTenders,
  totalDocuments,
  totalLibraryDocs,
}: {
  tenders: TenderOption[];
  tendersLoading: boolean;
  focusTenderId: number | null;
  onFocusChange: (id: number | null, label?: string) => void;
  onPickQuestion: (q: string) => void;
  totalTenders: number | null;
  totalDocuments: number | null;
  totalLibraryDocs: number | null;
}) {
  const focusedTender = tenders.find((t) => t.id === focusTenderId) || null;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto scrollbar-thin p-4">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight">
              AI Tender Assistant
            </h2>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Ask questions about your tenders
            </p>
          </div>
        </div>
      </div>

      {/* Focus tender selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Focus on a tender (optional)
        </label>
        {tendersLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <Select
            value={focusTenderId ? String(focusTenderId) : "all"}
            onValueChange={(v) => {
              if (v === "all") {
                onFocusChange(null);
                return;
              }
              const id = Number(v);
              const t = tenders.find((t) => t.id === id);
              onFocusChange(id, t ? tenderLabel(t) : undefined);
            }}
          >
            <SelectTrigger className="w-full bg-background">
              <SelectValue placeholder="All tenders" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tenders</SelectItem>
              {tenders.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {tenderLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {focusedTender && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2 text-xs dark:border-emerald-900 dark:bg-emerald-950/30">
            <Badge className="bg-emerald-600 text-white">Focused</Badge>
            <span className="flex-1 text-emerald-900 dark:text-emerald-200">
              {tenderLabel(focusedTender)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 w-5 p-0 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-900"
              onClick={() => onFocusChange(null)}
              title="Clear focus"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Suggested questions */}
      <Card className="overflow-hidden border-dashed">
        <CardHeader className="bg-muted/40 px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            Suggested questions
          </CardTitle>
          <CardDescription className="text-xs">
            Tap any to ask instantly
          </CardDescription>
        </CardHeader>
        <CardContent className="p-2">
          <div className="flex flex-col gap-1">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q.q}
                onClick={() => onPickQuestion(q.q)}
                className="group flex items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-foreground transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              >
                <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600/60 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600" />
                <span className="flex-1 leading-relaxed">{q.q}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Stats footer */}
      <Card className="mt-auto bg-muted/30">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground">
            <Database className="h-3.5 w-3.5 text-emerald-600" />
            AI Knowledge Base
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-background p-1.5">
              <div className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {totalTenders ?? "—"}
              </div>
              <div className="text-[10px] text-muted-foreground">Tenders</div>
            </div>
            <div className="rounded-lg bg-background p-1.5">
              <div className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {totalDocuments ?? "—"}
              </div>
              <div className="text-[10px] text-muted-foreground">Documents</div>
            </div>
            <div className="rounded-lg bg-background p-1.5">
              <div className="text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {totalLibraryDocs ?? "—"}
              </div>
              <div className="text-[10px] text-muted-foreground">Library</div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground leading-tight">
            The AI has read all uploaded documents and knows every checklist, briefing, pricing version and communication.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Main component ----
export function AssistantTab() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [tenders, setTenders] = useState<TenderOption[]>([]);
  const [tendersLoading, setTendersLoading] = useState(true);
  const [focusTenderId, setFocusTenderId] = useState<number | null>(null);
  const [totalTenders, setTotalTenders] = useState<number | null>(null);
  const [totalDocuments, setTotalDocuments] = useState<number | null>(null);
  const [totalLibraryDocs, setTotalLibraryDocs] = useState<number | null>(null);
  const [showEmptyBanner, setShowEmptyBanner] = useState(false);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastUserQuestionRef = useRef<string>("");

  const setTab = useDashboardStore((s) => s.setTab);
  const [initials] = useState(getUserInitials);

  // Fetch tenders for the focus selector + total count
  useEffect(() => {
    let mounted = true;
    setTendersLoading(true);
    api
      .listTenders({ sort: "created_at", order: "desc" })
      .then((res) => {
        if (!mounted) return;
        setTenders(res.items || []);
        setTotalTenders(res.total ?? (res.items?.length || 0));
      })
      .catch(() => {
        if (!mounted) return;
        setTenders([]);
        setTotalTenders(0);
      })
      .finally(() => {
        if (mounted) setTendersLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Auto-scroll to bottom on messages / loading change
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = Math.min(ta.scrollHeight, 160); // ~5 rows
    ta.style.height = `${next}px`;
  }, [input]);

  const handleFocusChange = useCallback(
    (id: number | null, label?: string) => {
      setFocusTenderId(id);
      if (id && label) {
        toast.success(`AI now focused on ${label}`, {
          description: "All questions will be sent with this tender as context.",
        });
      } else if (id === null) {
        toast.info("Focus cleared — AI will consider all tenders.");
      }
    },
    []
  );

  const sendQuestion = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || loading) return;

      lastUserQuestionRef.current = trimmed;
      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);
      setShowEmptyBanner(false);

      try {
        const res = await api.askAssistant(trimmed, focusTenderId ?? undefined);
        const aiMsg: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: res.answer || "I couldn't generate an answer for that.",
          contextTenders: res.context_tenders,
          createdAt: Date.now(),
        };
        setMessages((prev) => [...prev, aiMsg]);
        if (typeof res.context_tenders === "number") {
          setTotalTenders(res.context_tenders);
        }
        if (typeof res.context_documents === "number") {
          setTotalDocuments(res.context_documents);
        }
        if (typeof res.context_library_docs === "number") {
          setTotalLibraryDocs(res.context_library_docs);
        }
        if (res.context_tenders === 0) {
          setShowEmptyBanner(true);
        }
      } catch (e: any) {
        const errText =
          e?.message || "Something went wrong while contacting the AI.";
        const errMsg: ChatMessage = {
          id: uid(),
          role: "assistant",
          content: errText,
          error: true,
          createdAt: Date.now(),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setLoading(false);
      }
    },
    [loading, focusTenderId]
  );

  const handleRetry = useCallback(() => {
    const q = lastUserQuestionRef.current;
    if (!q) return;
    // Drop the last error message before retrying
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].error) {
          next.splice(i, 1);
          break;
        }
      }
      return next;
    });
    sendQuestion(q);
  }, [sendQuestion]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuestion(input);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setShowEmptyBanner(false);
    toast.success("Chat cleared");
  };

  const handlePickQuestion = (q: string) => {
    setMobileRailOpen(false);
    // Slight delay so the sheet close doesn't interfere with focus
    setTimeout(() => sendQuestion(q), 30);
  };

  const hasMessages = messages.length > 0;
  const canSend = input.trim().length > 0 && !loading;

  // Suggested questions strip for mobile (above chat input)
  const mobileSuggestions = useMemo(
    () => SUGGESTED_QUESTIONS.slice(0, 4),
    []
  );

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col gap-4 lg:h-[calc(100vh-7.5rem)] lg:flex-row">
      {/* Desktop left rail */}
      <aside className="hidden w-80 shrink-0 overflow-hidden rounded-xl border bg-card lg:flex lg:flex-col">
        <LeftRailContent
          tenders={tenders}
          tendersLoading={tendersLoading}
          focusTenderId={focusTenderId}
          onFocusChange={handleFocusChange}
          onPickQuestion={handlePickQuestion}
          totalTenders={totalTenders}
          totalDocuments={totalDocuments}
          totalLibraryDocs={totalLibraryDocs}
        />
      </aside>

      {/* Main chat area */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
        {/* Header bar */}
        <div className="flex items-center gap-3 border-b bg-gradient-to-r from-emerald-50/60 via-card to-card px-4 py-3 dark:from-emerald-950/20">
          {/* Mobile rail toggle */}
          <Sheet open={mobileRailOpen} onOpenChange={setMobileRailOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                title="Open context panel"
              >
                <PanelLeft className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 overflow-hidden p-0">
              <SheetHeader className="border-b px-4 py-3">
                <SheetTitle className="flex items-center gap-2 text-left">
                  <Bot className="h-4 w-4 text-emerald-600" />
                  Assistant context
                </SheetTitle>
              </SheetHeader>
              <LeftRailContent
                tenders={tenders}
                tendersLoading={tendersLoading}
                focusTenderId={focusTenderId}
                onFocusChange={(id, label) => {
                  handleFocusChange(id, label);
                  setMobileRailOpen(false);
                }}
                onPickQuestion={handlePickQuestion}
                totalTenders={totalTenders}
                totalDocuments={totalDocuments}
                totalLibraryDocs={totalLibraryDocs}
              />
            </SheetContent>
          </Sheet>

          <div className="relative">
            <BotAvatar size="md" pulsing={loading} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold">TM Flow AI</h2>
              <Badge
                variant="outline"
                className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
              >
                <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {loading ? "Thinking" : "Ready"}
              </Badge>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              Powered by your tender data
              {focusTenderId
                ? " · focused on a single tender"
                : " · all tenders in scope"}
            </p>
          </div>

          {hasMessages && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearChat}
              className="gap-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
              title="Clear chat"
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Clear chat</span>
            </Button>
          )}
        </div>

        {/* Empty tender banner */}
        {showEmptyBanner && (
          <Alert className="mx-3 mt-3 border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-sm">No tenders yet</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-2 text-xs">
              <span>
                You have no tenders yet. Create one in the Tenders tab to get AI
                insights.
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-900/50"
                onClick={() => setTab("tenders")}
              >
                Go to Tenders
                <ArrowRight className="h-3 w-3" />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Messages area */}
        <div
          ref={scrollRef}
          className="relative flex-1 overflow-y-auto scrollbar-thin"
          style={{
            backgroundImage:
              "radial-gradient(circle, oklch(0.7 0.04 160 / 0.18) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-card via-transparent to-card" />
          <div className="relative min-h-full px-3 py-4 sm:px-5">
            <AnimatePresence initial={false}>
              {!hasMessages && !loading && (
                <EmptyHero key="empty" onPick={handlePickQuestion} />
              )}
            </AnimatePresence>

            <div className="flex flex-col gap-4">
              {messages.map((m, idx) => {
                // find the next user message after this AI message to wire retry
                const isLast = idx === messages.length - 1;
                return (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    initials={initials}
                    onRetry={
                      m.error && isLast ? handleRetry : undefined
                    }
                  />
                );
              })}

              {/* Loading bubble */}
              {loading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex w-full justify-start gap-3 px-1"
                >
                  <div className="mt-1 shrink-0">
                    <BotAvatar size="sm" pulsing />
                  </div>
                  <div className="max-w-[80%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <TypingDots />
                      <span className="text-sm text-muted-foreground">
                        Analyzing your tender data…
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile suggested questions strip */}
        {!hasMessages && (
          <div className="border-t bg-muted/30 px-3 py-2 lg:hidden">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Sparkles className="h-3 w-3 text-emerald-600" />
              Try one of these
            </div>
            <div className="flex flex-wrap gap-1.5">
              {mobileSuggestions.map((q) => (
                <button
                  key={q.q}
                  onClick={() => handlePickQuestion(q.q)}
                  className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-foreground transition-colors hover:border-emerald-300 hover:bg-emerald-50 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/30"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input bar */}
        <div className="border-t bg-card px-3 py-3 sm:px-4">
          <div className="flex items-end gap-2">
            <div className="relative flex-1">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  focusTenderId
                    ? "Ask about this tender…  (Enter to send, Shift+Enter for newline)"
                    : "Ask about your tenders…  (Enter to send, Shift+Enter for newline)"
                }
                rows={1}
                disabled={loading}
                className="min-h-[44px] resize-none pr-2 leading-relaxed"
                style={{ maxHeight: 160 }}
              />
              {focusTenderId && (
                <div className="pointer-events-none absolute -top-2 left-2 flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm">
                  <Sparkles className="h-2.5 w-2.5" />
                  Focused
                </div>
              )}
            </div>
            <Button
              size="icon"
              onClick={() => sendQuestion(input)}
              disabled={!canSend}
              className="h-11 w-11 shrink-0 rounded-xl bg-emerald-600 shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              title="Send message"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              <span className="sr-only">Send</span>
            </Button>
          </div>
          <div className="mt-1.5 flex items-center justify-between px-1 text-[10px] text-muted-foreground">
            <span className="hidden sm:inline">
              TM Flow AI can make mistakes. Verify important information
              against your tender data.
            </span>
            <span className="sm:hidden">Enter to send · Shift+Enter for new line</span>
            <span className="tabular-nums">{input.length}/2000</span>
          </div>
        </div>
      </div>
    </div>
  );
}
