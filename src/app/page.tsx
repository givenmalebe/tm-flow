"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { LandingPage } from "@/components/landing-page";
import { AuthPage } from "@/components/auth-page";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { Onboarding } from "@/components/onboarding";
import { Loader2 } from "lucide-react";

type View = "landing" | "auth";

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

  // Authenticated but onboarding not completed → Onboarding
  if (user && !user.onboarding_completed) {
    return <Onboarding />;
  }

  // Authenticated and onboarded → Dashboard
  if (user) {
    return <DashboardShell />;
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
