"use client";

/**
 * Submission readiness gate.
 *
 * Shows exactly what still stands between the bidder and sending the bid:
 * every required document held, no expired certificates, checklist complete and
 * the tender still open. The submit/download action only unlocks at 100%.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Lock,
  Send,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { api, type SubmissionReadiness } from "@/lib/api";
import { cn } from "@/lib/utils";

function ScoreRing({ score, ready }: { score: number; ready: boolean }) {
  const tone = ready
    ? "text-emerald-600 dark:text-emerald-400"
    : score >= 60
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";
  return (
    <div className={cn("relative flex h-14 w-14 shrink-0 items-center justify-center", tone)}>
      <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
        <circle
          cx="18" cy="18" r="15.9155"
          fill="none" stroke="currentColor" strokeWidth="3" opacity="0.15"
        />
        <circle
          cx="18" cy="18" r="15.9155"
          fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * 100} 100`}
          pathLength="100"
        />
      </svg>
      <span className="absolute text-sm font-semibold">{score}%</span>
    </div>
  );
}

export function SubmissionReadinessPanel({
  tenderId,
  referenceNumber,
  onSubmitted,
  compact = false,
}: {
  tenderId: number;
  referenceNumber?: string | null;
  onSubmitted?: () => void;
  compact?: boolean;
}) {
  const [data, setData] = useState<SubmissionReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"submit" | "zip" | null>(null);
  const [expanded, setExpanded] = useState(!compact);

  const load = useCallback(async () => {
    try {
      setData(await api.getSubmissionReadiness(tenderId));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async () => {
    setBusy("submit");
    try {
      const res = await api.submitBid(tenderId);
      toast.success("Bid submitted", {
        description: `Reference ${res.reference_number}${res.issuer ? ` · sent to ${res.issuer}` : ""}`,
      });
      await load();
      onSubmitted?.();
    } catch (e: any) {
      const detail = e?.detail;
      const issues = Array.isArray(detail?.blocking_issues)
        ? detail.blocking_issues.join(", ")
        : detail?.message || e?.message;
      toast.error("Bid not submitted", { description: issues });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    setBusy("zip");
    try {
      await api.downloadSubmissionBundle(tenderId);
      toast.success("Submission bundle downloaded", {
        description: "Every certificate, the tender document and your written documents are in the ZIP.",
      });
    } catch (e: any) {
      toast.error(e?.message || "Could not build the bundle");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Checking submission readiness…</span>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const ready = data.ready_to_submit && !data.already_submitted;
  const isSystem = data.source === "system";

  return (
    <Card
      className={cn(
        "border-2",
        ready
          ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20"
          : "border-amber-300/70 bg-amber-50/20 dark:border-amber-800/60 dark:bg-amber-950/10"
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <ScoreRing score={data.score} ready={ready} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">
                {data.already_submitted
                  ? "Bid submitted"
                  : ready
                    ? "Ready to submit"
                    : "Not ready to submit"}
              </h3>
              <Badge
                variant="outline"
                className={cn(
                  "text-[11px]",
                  isSystem
                    ? "border-violet-300 text-violet-700 dark:border-violet-800 dark:text-violet-300"
                    : ""
                )}
              >
                {isSystem ? `Issuer on platform${data.issuer_company ? ` · ${data.issuer_company}` : ""}` : "External issuer"}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data.already_submitted
                ? "This tender has already been sent."
                : ready
                  ? "Every required document is in hand, nothing has expired and the tender is open."
                  : `${data.blocking_issues.length} thing(s) still to fix before this bid can be sent.`}
            </p>
            <Progress value={data.score} className="mt-2 h-1.5" />
          </div>
        </div>

        {/* Checks */}
        <div className="mt-3 space-y-1.5">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs font-semibold text-foreground"
          >
            {expanded ? "Hide" : "Show"} readiness checks ({data.checks.length})
          </button>
          {expanded && (
            <ul className="space-y-1.5">
              {data.checks.map((c) => {
                const Icon =
                  c.status === "pass" ? CheckCircle2 : c.status === "warn" ? AlertTriangle : XCircle;
                const tone =
                  c.status === "pass"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : c.status === "warn"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-rose-600 dark:text-rose-400";
                return (
                  <li key={c.key} className="flex items-start gap-2 text-xs">
                    <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", tone)} />
                    <div className="min-w-0">
                      <span className="font-medium">{c.label}</span>
                      <span className="text-muted-foreground"> — {c.detail}</span>
                      {c.items.length > 0 && (
                        <ul className="mt-1 space-y-0.5 pl-3 text-[11px] text-muted-foreground">
                          {c.items.slice(0, 8).map((item, i) => (
                            <li key={i} className="list-disc">{item}</li>
                          ))}
                          {c.items.length > 8 && (
                            <li className="list-disc">…and {c.items.length - 8} more</li>
                          )}
                        </ul>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Actions */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          {!data.already_submitted && (
            isSystem ? (
              <>
                <Button size="sm" onClick={handleSubmit} disabled={!ready || busy !== null}>
                  {busy === "submit" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : ready ? (
                    <Send className="h-3.5 w-3.5" />
                  ) : (
                    <Lock className="h-3.5 w-3.5" />
                  )}
                  Submit to issuer
                </Button>
                <Button size="sm" variant="outline" onClick={handleDownload} disabled={busy !== null}>
                  {busy === "zip" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Download bundle anyway
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={handleDownload} disabled={busy !== null}>
                {busy === "zip" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Download all files (ZIP)
              </Button>
            )
          )}
          {!ready && !data.already_submitted && (
            <span className="text-[11px] text-muted-foreground">
              {isSystem
                ? "The submit button unlocks automatically at 100%."
                : "Resolve the items above, then download a complete, submission-ready pack."}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}