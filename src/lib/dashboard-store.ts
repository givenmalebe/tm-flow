"use client";

import { create } from "zustand";

export type DashboardTab =
  | "dashboard"
  | "tenders"
  | "discover"
  | "reader"
  | "library"
  | "briefings"
  | "pricing"
  | "submissions"
  | "clarifications"
  | "addendums"
  | "assistant";

interface DashboardState {
  activeTab: DashboardTab;
  selectedTenderId: number | null;
  refreshKey: number; // bump to trigger refetches across tabs
  setTab: (t: DashboardTab) => void;
  selectTender: (id: number | null) => void;
  refresh: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  activeTab: "dashboard",
  selectedTenderId: null,
  refreshKey: 0,
  setTab: (t) => set({ activeTab: t, selectedTenderId: null }),
  selectTender: (id) => set({ selectedTenderId: id }),
  refresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
}));

// ---- helpers ----

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-ZA", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-ZA", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function formatCurrency(value?: number | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function daysUntil(iso?: string | null): number | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    "New Opportunity": "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    "Under Review": "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    Interested: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    "Not Interested": "bg-muted text-muted-foreground",
    Preparing: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    "Documents Outstanding": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    "Pricing in Progress": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    "Awaiting Information": "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
    "Ready for Submission": "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
    Submitted: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
    "Clarification Requested": "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
    "Clarification Submitted": "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
    Shortlisted: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
    "Interview/Presentation": "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
    Negotiation: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-300",
    Awarded: "bg-emerald-600 text-white",
    Unsuccessful: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
    Cancelled: "bg-muted text-muted-foreground",
    Withdrawn: "bg-muted text-muted-foreground",
    Expired: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  };
  return map[status] || "bg-muted text-muted-foreground";
}

export function deadlineColor(days: number | null): string {
  if (days === null) return "text-muted-foreground";
  if (days < 0) return "text-rose-600 dark:text-rose-400";
  if (days <= 1) return "text-rose-600 dark:text-rose-400 font-semibold";
  if (days <= 3) return "text-orange-600 dark:text-orange-400 font-semibold";
  if (days <= 7) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}
