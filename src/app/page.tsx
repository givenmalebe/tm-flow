"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { LandingPage } from "@/components/landing-page";
import { AuthPage } from "@/components/auth-page";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Onboarding } from "@/components/onboarding";
import { IssuerPortal } from "@/components/issuer/issuer-portal";
import { TendersPage } from "@/components/tenders-page";
import { Loader2 } from "lucide-react";

type View = "landing" | "auth" | "tenders";

export default function Home() {
  const { user, loading } = useAuth();
  const [view, setView] = useState<View>("landing");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Loading TM Flow…</p>
        </div>
      </div>
    );
  }

  // Issuer accounts → Issuer Portal
  if (user && user.account_type === "issuer") {
    return <IssuerPortal />;
  }

  // Applicant accounts: onboarding then dashboard
  if (user && !user.onboarding_completed) {
    return <Onboarding />;
  }

  // Authenticated and onboarded → Dashboard
  if (user) {
    return <DashboardShell />;
  }

  // Tenders page (standalone, no auth required)
  if (view === "tenders") {
    return (
      <TendersPage
        onBack={() => setView("landing")}
        onSignIn={() => {
          setAuthMode("signin");
          setView("auth");
        }}
        onGetStarted={() => {
          setAuthMode("signup");
          setView("auth");
        }}
      />
    );
  }

  // Not authenticated
  if (view === "auth") {
    return (
      <AuthPage
        initialMode={authMode}
        onBack={() => setView("landing")}
        onSuccess={() => {
          window.location.reload();
        }}
      />
    );
  }

  return (
    <LandingPage
      onViewTenders={() => setView("tenders")}
      onGetStarted={() => {
        setAuthMode("signup");
        setView("auth");
      }}
      onSignIn={() => {
        setAuthMode("signin");
        setView("auth");
      }}
    />
  );
}
