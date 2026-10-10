"use client";

import * as React from "react";
import { useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  FileText,
  ArrowLeft,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Building2,
  Loader2,
  CheckCircle2,
  ShieldCheck,
  ScanText,
  ListChecks,
  CalendarClock,
  Quote,
  AlertCircle,
  Gavel,
  Hammer,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth-context";

interface AuthPageProps {
  initialMode?: "signin" | "signup";
  onBack: () => void;
  onSuccess: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SignInErrors = Partial<Record<"email" | "password", string>>;
type SignUpErrors = Partial<
  Record<
    "fullName" | "email" | "password" | "confirmPassword" | "terms",
    string
  >
>;

/* -------------------------------------------------------------------------- */
/*  AuthPage                                                                   */
/* -------------------------------------------------------------------------- */

export function AuthPage({
  initialMode = "signin",
  onBack,
  onSuccess,
}: AuthPageProps) {
  const { login, register } = useAuth();

  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Sign-in form state
  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");
  const [siErrors, setSiErrors] = useState<SignInErrors>({});

  // Sign-up form state
  const [suFullName, setSuFullName] = useState("");
  const [suCompany, setSuCompany] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  const [suAgree, setSuAgree] = useState(false);
  const [suErrors, setSuErrors] = useState<SignUpErrors>({});
  const [accountType, setAccountType] = useState<"applicant" | "issuer">("applicant");

  // Show / hide toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  function switchMode(next: "signin" | "signup") {
    if (next === mode) return;
    setMode(next);
    setServerError(null);
    setSiErrors({});
    setSuErrors({});
  }

  function validateSignIn(): boolean {
    const errs: SignInErrors = {};
    if (!siEmail.trim()) errs.email = "Email is required.";
    else if (!EMAIL_RE.test(siEmail))
      errs.email = "Enter a valid email address.";
    if (!siPassword) errs.password = "Password is required.";
    else if (siPassword.length < 6)
      errs.password = "Password must be at least 6 characters.";
    setSiErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateSignUp(): boolean {
    const errs: SignUpErrors = {};
    if (!suFullName.trim()) errs.fullName = "Full name is required.";
    if (!suEmail.trim()) errs.email = "Email is required.";
    else if (!EMAIL_RE.test(suEmail))
      errs.email = "Enter a valid email address.";
    if (!suPassword) errs.password = "Password is required.";
    else if (suPassword.length < 6)
      errs.password = "Password must be at least 6 characters.";
    if (!suConfirm) errs.confirmPassword = "Please confirm your password.";
    else if (suConfirm !== suPassword)
      errs.confirmPassword = "Passwords do not match.";
    if (!suAgree) errs.terms = "You must accept the Terms & Privacy Policy.";
    setSuErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validateSignIn()) return;
    setLoading(true);
    try {
      await login(siEmail.trim(), siPassword);
      toast.success("Welcome back to TM Flow.");
      onSuccess();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Sign in failed. Please try again.";
      setServerError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    if (!validateSignUp()) return;
    setLoading(true);
    try {
      await register(
        suEmail.trim(),
        suFullName.trim(),
        suPassword,
        suCompany.trim() || undefined,
        accountType
      );
      toast.success("Account created. Welcome to TM Flow.");
      setLoading(false);
      setSuccess(true);
      // Celebratory micro-animation: button morphs to a checkmark for 800ms
      // before the parent redirects to the dashboard.
      window.setTimeout(() => {
        onSuccess();
      }, 800);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Registration failed. Please try again.";
      setServerError(msg);
      toast.error(msg);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full grid md:grid-cols-2 bg-background">
      {/* LEFT panel — hidden on mobile */}
      <aside className="hidden md:block relative overflow-y-auto bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white">
        <LeftPanel />
      </aside>

      {/* RIGHT panel — form */}
      <main className="relative flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          {/* Back button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>

          <Card className="rounded-2xl border-border/60 shadow-lg shadow-emerald-900/5">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-2.5">
                <img src="/logo.jpg" alt="TM Flow" className="size-9 rounded-lg shadow-sm" />
                <span className="text-lg font-semibold tracking-tight">
                  Tender<span className="text-primary">Flow</span>
                </span>
              </div>
              <div className="space-y-1">
                <CardTitle className="text-2xl">
                  {mode === "signin"
                    ? "Sign in to your account"
                    : "Create your account"}
                </CardTitle>
                <CardDescription>
                  {mode === "signin"
                    ? "Welcome back. Pick up where you left off."
                    : "Start managing every tender in one place."}
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent>
              <Tabs
                value={mode}
                onValueChange={(v) => switchMode(v as "signin" | "signup")}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign In</TabsTrigger>
                  <TabsTrigger value="signup">Create Account</TabsTrigger>
                </TabsList>

                {/* Server-side error alert */}
                <AnimatePresence initial={false}>
                  {serverError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <Alert variant="destructive" className="mt-4">
                        <AlertCircle className="size-4" />
                        <AlertDescription>{serverError}</AlertDescription>
                      </Alert>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ---------------------------------------------------------------- Sign In */}
                <TabsContent value="signin" className="mt-4">
                  <form onSubmit={handleSignIn} className="space-y-4" noValidate>
                    <FieldWithError
                      label="Email"
                      htmlFor="signin-email"
                      error={siErrors.email}
                    >
                      <IconInput
                        id="signin-email"
                        type="email"
                        icon={Mail}
                        placeholder="you@company.com"
                        value={siEmail}
                        onChange={(e) => setSiEmail(e.target.value)}
                        autoComplete="email"
                      />
                    </FieldWithError>

                    <FieldWithError
                      label="Password"
                      htmlFor="signin-password"
                      error={siErrors.password}
                      trailing={
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.preventDefault()}
                              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Forgot password?
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Coming soon</TooltipContent>
                        </Tooltip>
                      }
                    >
                      <PasswordInput
                        id="signin-password"
                        value={siPassword}
                        onChange={(e) => setSiPassword(e.target.value)}
                        show={showPassword}
                        onToggle={() => setShowPassword((v) => !v)}
                        autoComplete="current-password"
                      />
                    </FieldWithError>

                    <SubmitButton
                      type="signin"
                      loading={loading}
                      success={false}
                    />
                  </form>
                </TabsContent>

                {/* ---------------------------------------------------------------- Sign Up */}
                <TabsContent value="signup" className="mt-4">
                  <form onSubmit={handleSignUp} className="space-y-4" noValidate>
                    {/* Account-type selector */}
                    <div className="space-y-2">
                      <Label>I am registering as a…</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setAccountType("applicant")}
                          className={`relative rounded-xl border p-3 text-left transition-all ${
                            accountType === "applicant"
                              ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/30 dark:bg-emerald-950/30"
                              : "border-border hover:border-emerald-300 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`flex size-8 items-center justify-center rounded-lg ${accountType === "applicant" ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}>
                              <Hammer className="size-4" />
                            </div>
                            <span className="text-sm font-semibold">Bidder</span>
                            {accountType === "applicant" && (
                              <CheckCircle2 className="ml-auto size-4 text-emerald-600" />
                            )}
                          </div>
                          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                            I find &amp; submit bids on tenders.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setAccountType("issuer")}
                          className={`relative rounded-xl border p-3 text-left transition-all ${
                            accountType === "issuer"
                              ? "border-amber-500 bg-amber-50 ring-2 ring-amber-500/30 dark:bg-amber-950/30"
                              : "border-border hover:border-amber-300 hover:bg-amber-50/40 dark:hover:bg-amber-950/10"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className={`flex size-8 items-center justify-center rounded-lg ${accountType === "issuer" ? "bg-amber-600 text-white" : "bg-muted text-muted-foreground"}`}>
                              <Gavel className="size-4" />
                            </div>
                            <span className="text-sm font-semibold">Issuer</span>
                            {accountType === "issuer" && (
                              <CheckCircle2 className="ml-auto size-4 text-amber-600" />
                            )}
                          </div>
                          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                            I create &amp; publish tenders, evaluate bids.
                          </p>
                        </button>
                      </div>
                    </div>

                    <FieldWithError
                      label="Full name"
                      htmlFor="signup-name"
                      error={suErrors.fullName}
                    >
                      <IconInput
                        id="signup-name"
                        type="text"
                        icon={User}
                        placeholder="Jane Mokoena"
                        value={suFullName}
                        onChange={(e) => setSuFullName(e.target.value)}
                        autoComplete="name"
                      />
                    </FieldWithError>

                    <FieldWithError
                      label="Company name"
                      htmlFor="signup-company"
                      optional
                    >
                      <IconInput
                        id="signup-company"
                        type="text"
                        icon={Building2}
                        placeholder="Acme Security (Pty) Ltd"
                        value={suCompany}
                        onChange={(e) => setSuCompany(e.target.value)}
                        autoComplete="organization"
                      />
                    </FieldWithError>

                    <FieldWithError
                      label="Email"
                      htmlFor="signup-email"
                      error={suErrors.email}
                    >
                      <IconInput
                        id="signup-email"
                        type="email"
                        icon={Mail}
                        placeholder="you@company.com"
                        value={suEmail}
                        onChange={(e) => setSuEmail(e.target.value)}
                        autoComplete="email"
                      />
                    </FieldWithError>

                    <FieldWithError
                      label="Password"
                      htmlFor="signup-password"
                      error={suErrors.password}
                    >
                      <PasswordInput
                        id="signup-password"
                        value={suPassword}
                        onChange={(e) => setSuPassword(e.target.value)}
                        show={showPassword}
                        onToggle={() => setShowPassword((v) => !v)}
                        autoComplete="new-password"
                        placeholder="At least 6 characters"
                      />
                    </FieldWithError>

                    <FieldWithError
                      label="Confirm password"
                      htmlFor="signup-confirm"
                      error={suErrors.confirmPassword}
                    >
                      <PasswordInput
                        id="signup-confirm"
                        value={suConfirm}
                        onChange={(e) => setSuConfirm(e.target.value)}
                        show={showConfirm}
                        onToggle={() => setShowConfirm((v) => !v)}
                        autoComplete="new-password"
                        placeholder="Re-enter password"
                      />
                    </FieldWithError>

                    <div className="space-y-1.5">
                      <div className="flex items-start gap-2.5">
                        <Checkbox
                          id="signup-agree"
                          checked={suAgree}
                          onCheckedChange={(v) => setSuAgree(v === true)}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor="signup-agree"
                          className="text-sm font-normal leading-snug text-muted-foreground"
                        >
                          I agree to the{" "}
                          <span className="font-medium text-foreground">
                            Terms of Service
                          </span>{" "}
                          and{" "}
                          <span className="font-medium text-foreground">
                            Privacy Policy
                          </span>
                          .
                        </Label>
                      </div>
                      {suErrors.terms && (
                        <p role="alert" className="text-xs text-rose-600">
                          {suErrors.terms}
                        </p>
                      )}
                    </div>

                    <SubmitButton type="signup" loading={loading} success={success} />
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Trust badge */}
          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-emerald-600" />
            <span>Secured by JWT · bcrypt password hashing</span>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helper subcomponents                                                       */
/* -------------------------------------------------------------------------- */

type IconType = React.ComponentType<{ className?: string }>;

function IconInput(props: {
  id: string;
  type: string;
  icon: IconType;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
}) {
  const { id, type, icon: Icon, placeholder, value, onChange, autoComplete } =
    props;
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        className="pl-9"
      />
    </div>
  );
}

function PasswordInput(props: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete?: string;
  placeholder?: string;
}) {
  const { id, value, onChange, show, onToggle, autoComplete, placeholder } =
    props;
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        className="pl-9 pr-9"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function FieldWithError(props: {
  label: string;
  htmlFor: string;
  error?: string;
  optional?: boolean;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { label, htmlFor, error, optional, trailing, children } = props;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={htmlFor}>
          {label}
          {optional && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              (optional)
            </span>
          )}
        </Label>
        {trailing}
      </div>
      {children}
      {error && (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

function SubmitButton(props: {
  type: "signin" | "signup";
  loading: boolean;
  success: boolean;
}) {
  const { type, loading, success } = props;
  const defaultLabel = type === "signin" ? "Sign In" : "Create Account";
  const loadingLabel =
    type === "signin" ? "Signing in…" : "Creating account…";
  const successLabel = "Account created";

  return (
    <Button
      type="submit"
      className="mt-2 w-full focus-visible:ring-emerald-500/40"
      size="lg"
      disabled={loading || success}
      aria-busy={loading}
    >
      <AnimatePresence mode="wait" initial={false}>
        {success ? (
          <motion.span
            key="success"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 18 }}
            className="flex items-center gap-2"
          >
            <CheckCircle2 className="size-5" />
            {successLabel}
          </motion.span>
        ) : loading ? (
          <motion.span
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2"
          >
            <Loader2 className="size-4 animate-spin" />
            {loadingLabel}
          </motion.span>
        ) : (
          <motion.span
            key="default"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {defaultLabel}
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Left panel                                                                 */
/* -------------------------------------------------------------------------- */

const LEFT_FEATURES: { icon: IconType; text: string }[] = [
  {
    icon: ScanText,
    text: "AI reads your tender documents and builds the checklist for you.",
  },
  {
    icon: ListChecks,
    text: "Track 20 tender statuses from New Opportunity to Awarded.",
  },
  {
    icon: CalendarClock,
    text: "Never miss a deadline with 30/14/7/3/1-day reminders.",
  },
];

function LeftPanel() {
  return (
    <div className="relative flex min-h-screen flex-col p-10 lg:p-12">
      {/* Decorative dot-grid pattern */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      {/* Floating soft circles */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.18, scale: 1 }}
        transition={{ duration: 1.2 }}
        className="absolute -left-20 -top-20 size-72 rounded-full bg-white/20 blur-3xl"
      />
      <motion.div
        aria-hidden
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.15, scale: 1 }}
        transition={{ duration: 1.4, delay: 0.2 }}
        className="absolute bottom-10 right-0 size-80 rounded-full bg-teal-300/30 blur-3xl"
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <img src="/logo.jpg" alt="TM Flow" className="size-10 rounded-xl shadow-sm" />
          <span className="text-xl font-semibold tracking-tight">TM Flow</span>
        </div>

        {/* Headline */}
        <div className="mt-16 max-w-md lg:mt-24">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-3xl leading-tight font-semibold tracking-tight lg:text-4xl"
          >
            The central system for every tender you pursue.
          </motion.h2>
        </div>

        {/* Feature bullets */}
        <ul className="mt-10 max-w-md space-y-5">
          {LEFT_FEATURES.map((f, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.25 + i * 0.12 }}
              className="flex items-start gap-3"
            >
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25">
                <f.icon className="size-4" />
              </div>
              <p className="text-sm leading-relaxed text-emerald-50/95">
                {f.text}
              </p>
            </motion.li>
          ))}
        </ul>

        {/* Testimonial */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mt-auto max-w-md border-l-2 border-white/40 pl-4"
        >
          <Quote className="mb-2 size-5 text-white/60" />
          <p className="text-base leading-relaxed font-medium italic">
            &ldquo;We stopped losing tenders to paperwork.&rdquo;
          </p>
          <p className="mt-2 text-xs tracking-wider text-emerald-100/80 uppercase">
            — Tender team lead
          </p>
        </motion.div>
      </div>
    </div>
  );
}
