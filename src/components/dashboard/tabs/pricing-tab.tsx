"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calculator,
  Plus,
  Copy,
  Trash2,
  RefreshCw,
  Loader2,
  Sparkles,
  TrendingUp,
  DollarSign,
  FileText,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Hash,
  Receipt,
  Save,
  X,
  type LucideIcon,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import {
  useDashboardStore,
  formatCurrency,
  formatDateTime,
  statusColor,
} from "@/lib/dashboard-store";
import { cn } from "@/lib/utils";

// ---- Types ----
interface PricingLineItem {
  category: string;
  description: string;
  quantity: number;
  rate: number;
  total: number;
}

interface PricingVersion {
  id: number;
  tender_id: number;
  version_number: number;
  version_label: string | null;
  line_items: PricingLineItem[];
  subtotal: number;
  vat: number;
  total: number;
  notes: string | null;
  created_at: string | null;
}

interface TenderOption {
  id: number;
  reference_number: string;
  title: string;
  client_company: string | null;
  status: string;
  estimated_value: number | null;
}

// ---- Constants ----
const LINE_ITEM_CATEGORIES = [
  "Labour",
  "Equipment",
  "Consumables",
  "Transport",
  "Other",
] as const;

const VAT_RATE = 0.15;

// Per-category badge colour tokens (emerald-themed family)
const CATEGORY_COLORS: Record<string, string> = {
  Labour: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  Equipment: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  Consumables: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  Transport: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
  Other: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
};

// ---- Helpers ----
function lineTotal(qty: number, rate: number): number {
  const q = Number.isFinite(qty) ? qty : 0;
  const r = Number.isFinite(rate) ? rate : 0;
  return Math.round(q * r * 100) / 100;
}

function calcTotals(items: PricingLineItem[]) {
  const subtotal = items.reduce(
    (sum, it) => sum + lineTotal(it.quantity, it.rate),
    0
  );
  const vat = Math.round(subtotal * VAT_RATE * 100) / 100;
  const total = Math.round((subtotal + vat) * 100) / 100;
  return { subtotal, vat, total };
}

function categorySubtotals(items: PricingLineItem[]) {
  const map = new Map<string, number>();
  for (const c of LINE_ITEM_CATEGORIES) map.set(c, 0);
  for (const it of items) {
    const key = (it.category || "Other") as string;
    const prev = map.get(key) ?? 0;
    map.set(key, prev + lineTotal(it.quantity, it.rate));
  }
  return map;
}

function newLineItem(): PricingLineItem {
  return {
    category: "Labour",
    description: "",
    quantity: 1,
    rate: 0,
    total: 0,
  };
}

// ---- Empty state ----
function EmptyState({
  icon: Icon,
  message,
  hint,
  iconClass,
  children,
}: {
  icon: LucideIcon;
  message: string;
  hint?: string;
  iconClass?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-2xl",
          iconClass ||
            "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
        )}
      >
        <Icon className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{message}</p>
        {hint && (
          <p className="text-xs text-muted-foreground max-w-sm">{hint}</p>
        )}
      </div>
      {children && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  );
}

// ---- Stat card ----
function StatCard({
  icon: Icon,
  iconClass,
  value,
  label,
  sublabel,
}: {
  icon: LucideIcon;
  iconClass: string;
  value: string | number;
  label: string;
  sublabel?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
            {value}
          </div>
          <div className="mt-0.5 text-sm font-medium text-foreground">{label}</div>
          {sublabel && (
            <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>
          )}
        </div>
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            iconClass
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Category badge ----
function CategoryBadge({ category }: { category: string }) {
  const cls =
    CATEGORY_COLORS[category] ||
    "bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("text-[10px] font-medium", cls)}>
      {category}
    </Badge>
  );
}

// ---- Category subtotal strip ----
function CategorySubtotals({ items }: { items: PricingLineItem[] }) {
  const subs = categorySubtotals(items);
  const activeCategories = LINE_ITEM_CATEGORIES.filter(
    (c) => (subs.get(c) ?? 0) > 0
  );
  if (activeCategories.length === 0) return null;
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {activeCategories.map((c) => (
        <div
          key={c}
          className="flex-1 min-w-[120px] rounded-lg border bg-muted/20 px-3 py-2"
        >
          <div className="flex items-center gap-1.5">
            <CategoryBadge category={c} />
          </div>
          <div className="mt-1 text-sm font-semibold tabular-nums text-foreground">
            {formatCurrency(subs.get(c) ?? 0)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- Version Card ----
interface VersionCardProps {
  version: PricingVersion;
  onDelete: (id: number) => void;
  onCopy: (version: PricingVersion) => void;
  defaultOpen?: boolean;
  copyingId?: number | null;
}

function VersionCard({
  version,
  onDelete,
  onCopy,
  defaultOpen,
  copyingId,
}: VersionCardProps) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isCopying = copyingId === version.id;
  const items = version.line_items || [];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="min-w-0 flex-1 space-y-1 text-left"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                v{version.version_number}
              </Badge>
              {version.version_label && (
                <span className="text-sm font-semibold text-foreground">
                  — {version.version_label}
                </span>
              )}
              {!version.version_label && (
                <span className="text-sm font-medium text-muted-foreground italic">
                  Untitled
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              {formatDateTime(version.created_at)}
              <span className="text-muted-foreground/50">·</span>
              <span>{items.length} line item{items.length === 1 ? "" : "s"}</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {formatCurrency(version.total)}
              </span>
            </div>
          </button>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Collapse" : "Expand"}
            >
              {open ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4 pt-0">
          {/* Line items table */}
          {items.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="w-[140px]">Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right w-[70px]">Qty</TableHead>
                      <TableHead className="text-right w-[110px]">Rate</TableHead>
                      <TableHead className="text-right w-[120px]">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((li, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <CategoryBadge category={li.category} />
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {li.description || (
                            <span className="text-muted-foreground italic">
                              No description
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {li.quantity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(li.rate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatCurrency(li.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
              No line items in this version
            </div>
          )}

          {/* Category subtotals */}
          {items.length > 0 && <CategorySubtotals items={items} />}

          {/* Totals row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Subtotal
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {formatCurrency(version.subtotal)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                VAT (15%)
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {formatCurrency(version.vat)}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
              <div className="text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Total (incl. VAT)
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatCurrency(version.total)}
              </div>
            </div>
          </div>

          {/* Notes */}
          {version.notes && (
            <div className="rounded-lg bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                <FileText className="h-3 w-3" />
                Notes
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {version.notes}
              </p>
            </div>
          )}

          <Separator />

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCopy(version)}
              disabled={isCopying}
            >
              {isCopying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {isCopying ? "Copying…" : "Copy to New Version"}
            </Button>
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <Button
                variant="ghost"
                size="sm"
                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950"
                aria-label="Delete version"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete pricing version?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete{" "}
                    <span className="font-semibold text-foreground">
                      v{version.version_number}
                      {version.version_label ? ` — ${version.version_label}` : ""}
                    </span>
                    . This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-600"
                    onClick={() => {
                      onDelete(version.id);
                      setConfirmOpen(false);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ---- Line Item Editor Row ----
interface LineItemRowProps {
  item: PricingLineItem;
  index: number;
  onChange: (idx: number, patch: Partial<PricingLineItem>) => void;
  onRemove: (idx: number) => void;
  canRemove: boolean;
}

function LineItemRow({ item, index, onChange, onRemove, canRemove }: LineItemRowProps) {
  return (
    <TableRow>
      <TableCell className="w-[150px] pr-2">
        <Select
          value={item.category}
          onValueChange={(v) => onChange(index, { category: v })}
        >
          <SelectTrigger className="w-full h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LINE_ITEM_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="pr-2">
        <Input
          value={item.description}
          onChange={(e) => onChange(index, { description: e.target.value })}
          placeholder="Description of work / item"
          className="h-9"
        />
      </TableCell>
      <TableCell className="w-[80px] pr-2">
        <Input
          type="number"
          min={0}
          step="any"
          value={Number.isFinite(item.quantity) ? item.quantity : 0}
          onChange={(e) =>
            onChange(index, {
              quantity: parseFloat(e.target.value) || 0,
              total: lineTotal(parseFloat(e.target.value) || 0, item.rate),
            })
          }
          className="h-9 text-right tabular-nums"
        />
      </TableCell>
      <TableCell className="w-[130px] pr-2">
        <Input
          type="number"
          min={0}
          step="any"
          value={Number.isFinite(item.rate) ? item.rate : 0}
          onChange={(e) =>
            onChange(index, {
              rate: parseFloat(e.target.value) || 0,
              total: lineTotal(item.quantity, parseFloat(e.target.value) || 0),
            })
          }
          className="h-9 text-right tabular-nums"
        />
      </TableCell>
      <TableCell className="w-[130px]">
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm font-medium tabular-nums text-foreground">
            {formatCurrency(lineTotal(item.quantity, item.rate))}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950 shrink-0"
            disabled={!canRemove}
            onClick={() => onRemove(index)}
            aria-label="Remove line item"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ---- New Pricing Version Dialog ----
interface NewPricingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenderId: number;
  nextVersionNumber: number;
  onSaved: () => void;
}

function NewPricingDialog({
  open,
  onOpenChange,
  tenderId,
  nextVersionNumber,
  onSaved,
}: NewPricingDialogProps) {
  const [versionLabel, setVersionLabel] = useState("");
  const [lineItems, setLineItems] = useState<PricingLineItem[]>([
    newLineItem(),
    newLineItem(),
  ]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setVersionLabel("");
      setLineItems([newLineItem(), newLineItem()]);
      setNotes("");
    }
  }, [open]);

  const totals = useMemo(() => calcTotals(lineItems), [lineItems]);
  const hasAnyItem = lineItems.some(
    (li) => li.description.trim() || li.quantity > 0 || li.rate > 0
  );

  const updateItem = (idx: number, patch: Partial<PricingLineItem>) => {
    setLineItems((items) =>
      items.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    );
  };

  const removeItem = (idx: number) => {
    setLineItems((items) => items.filter((_, i) => i !== idx));
  };

  const addItem = () => {
    setLineItems((items) => [...items, newLineItem()]);
  };

  const handleSave = async () => {
    const cleanItems = lineItems
      .filter(
        (li) =>
          li.description.trim() !== "" || li.quantity > 0 || li.rate > 0
      )
      .map((li) => ({
        category: li.category,
        description: li.description.trim(),
        quantity: Number(li.quantity) || 0,
        rate: Number(li.rate) || 0,
        total: lineTotal(li.quantity, li.rate),
      }));

    if (cleanItems.length === 0) {
      toast.error("Add at least one line item with a description");
      return;
    }

    setSaving(true);
    try {
      await api.createPricing(tenderId, {
        tender_id: tenderId,
        version_label: versionLabel.trim() || undefined,
        line_items: cleanItems,
        notes: notes.trim() || undefined,
      });
      toast.success(`Pricing v${nextVersionNumber} created`);
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to create pricing version");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            New Pricing Version
          </DialogTitle>
          <DialogDescription>
            Build a pricing sheet for this tender. The version number (v
            {nextVersionNumber}) is assigned automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Version label */}
          <div className="grid gap-2">
            <Label htmlFor="version-label">
              Version label{" "}
              <span className="text-xs text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="version-label"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder="e.g. Draft, Final, Revised after addendum"
              className="max-w-md"
            />
          </div>

          {/* Line items editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Line items</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={addItem}
                type="button"
              >
                <Plus className="h-3.5 w-3.5" />
                Add line item
              </Button>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="w-[150px]">Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right w-[80px]">Qty</TableHead>
                      <TableHead className="text-right w-[130px]">
                        Rate (ZAR)
                      </TableHead>
                      <TableHead className="text-right w-[130px]">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineItems.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-sm text-muted-foreground py-6"
                        >
                          No line items yet. Click &quot;Add line item&quot; to start.
                        </TableCell>
                      </TableRow>
                    ) : (
                      lineItems.map((item, idx) => (
                        <LineItemRow
                          key={idx}
                          item={item}
                          index={idx}
                          onChange={updateItem}
                          onRemove={removeItem}
                          canRemove={lineItems.length > 1}
                        />
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {/* Live totals preview */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Subtotal
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {formatCurrency(totals.subtotal)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                VAT (15%)
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {formatCurrency(totals.vat)}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40">
              <div className="text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                Total (incl. VAT)
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatCurrency(totals.total)}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="grid gap-2">
            <Label htmlFor="pricing-notes">
              Notes{" "}
              <span className="text-xs text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Textarea
              id="pricing-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Pricing notes — assumptions, exclusions, terms…"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !hasAnyItem}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save version
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- AI Generating Card ----
function AIGeneratingCard() {
  return (
    <Card className="border-emerald-300 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:border-emerald-800 dark:from-emerald-950/40 dark:via-card dark:to-teal-950/30">
      <CardContent className="py-10">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
            <span className="absolute inset-0 rounded-2xl bg-emerald-400/40 animate-ping" />
            <Sparkles className="h-7 w-7 animate-pulse" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold flex items-center justify-center gap-2">
              <Calculator className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              AI is generating a pricing sheet…
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Analyzing tender requirements, personnel, PSIRA grades, and equipment
              to create realistic pricing.
            </p>
            <p className="text-xs text-muted-foreground/80 italic">
              This usually takes 15-30 seconds
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Working…
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Main Component ----
export function PricingTab() {
  const { setTab, selectTender } = useDashboardStore();
  const [tenders, setTenders] = useState<TenderOption[]>([]);
  const [selectedTenderId, setSelectedTenderId] = useState<number | null>(null);
  const [versions, setVersions] = useState<PricingVersion[]>([]);
  const [loadingTenders, setLoadingTenders] = useState(true);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copyingId, setCopyingId] = useState<number | null>(null);

  const fetchTenders = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoadingTenders(true);
    setError(null);
    try {
      const res = await api.listTenders({ sort: "updated_at", order: "desc" });
      setTenders(
        res.items.map((t) => ({
          id: t.id,
          reference_number: t.reference_number,
          title: t.title,
          client_company: t.client_company,
          status: t.status,
          estimated_value: t.estimated_value ?? null,
        }))
      );
    } catch (e: any) {
      setError(e?.message || "Failed to load tenders");
    } finally {
      setLoadingTenders(false);
      setRefreshing(false);
    }
  }, []);

  const fetchVersions = useCallback(async (tenderId: number) => {
    setLoadingVersions(true);
    try {
      const res = await api.listPricing(tenderId);
      const list = (res.items || []) as PricingVersion[];
      list.sort((a, b) => b.version_number - a.version_number);
      setVersions(list);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load pricing versions");
      setVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  }, []);

  useEffect(() => {
    fetchTenders();
  }, [fetchTenders]);

  useEffect(() => {
    if (selectedTenderId !== null) {
      fetchVersions(selectedTenderId);
    } else {
      setVersions([]);
    }
  }, [selectedTenderId, fetchVersions]);

  const selectedTender = useMemo(
    () => tenders.find((t) => t.id === selectedTenderId) || null,
    [tenders, selectedTenderId]
  );

  const nextVersionNumber = useMemo(() => {
    if (versions.length === 0) return 1;
    return Math.max(...versions.map((v) => v.version_number)) + 1;
  }, [versions]);

  const totalValue = useMemo(
    () => versions.reduce((sum, v) => sum + (v.total || 0), 0),
    [versions]
  );
  const latestTotal = useMemo(
    () => (versions.length > 0 ? versions[0].total : 0),
    [versions]
  );

  const handleDelete = async (versionId: number) => {
    if (selectedTenderId === null) return;
    try {
      await api.deletePricing(versionId);
      toast.success("Pricing version deleted");
      fetchVersions(selectedTenderId);
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete pricing version");
    }
  };

  const handleCopy = async (version: PricingVersion) => {
    setCopyingId(version.id);
    try {
      const newVersion = await api.copyPricingVersion(version.id);
      toast.success(
        `Copied v${version.version_number} → v${newVersion?.version_number ?? "new"}`
      );
      if (selectedTenderId !== null) fetchVersions(selectedTenderId);
    } catch (e: any) {
      toast.error(e?.message || "Failed to copy pricing version");
    } finally {
      setCopyingId(null);
    }
  };

  const handleGenerate = async () => {
    if (selectedTenderId === null) return;
    setGenerating(true);
    try {
      const newVersion = await api.generatePricingSheet(selectedTenderId);
      toast.success(
        `AI generated pricing v${newVersion?.version_number ?? "new"}`
      );
      fetchVersions(selectedTenderId);
    } catch (e: any) {
      toast.error(e?.message || "AI pricing generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleRefresh = () => {
    fetchTenders(true);
    if (selectedTenderId !== null) {
      fetchVersions(selectedTenderId);
    }
  };

  const openTenderInTendersTab = () => {
    if (selectedTenderId === null) return;
    setTab("tenders");
    setTimeout(() => selectTender(selectedTenderId), 50);
  };

  // ---- Loading state ----
  if (loadingTenders) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-7 w-20" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-11 w-11 rounded-xl" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pricing Tracking</h1>
          <p className="text-sm text-muted-foreground">
            Build pricing sheets, track revisions, and compare versions
          </p>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn&apos;t load pricing data</AlertTitle>
          <AlertDescription>
            <p className="mb-3">{error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchTenders()}
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ---- Page header ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" />
            Pricing Tracking
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Build pricing sheets, track revisions, and compare versions
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* ---- Tender selector ---- */}
      <div className="grid gap-2">
        <Label className="flex items-center gap-1.5 text-sm font-medium">
          <Hash className="h-3.5 w-3.5 text-primary" />
          Select a tender to view pricing
        </Label>
        {tenders.length === 0 ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No tenders available</AlertTitle>
            <AlertDescription>
              Create a tender first to start building pricing sheets.
            </AlertDescription>
          </Alert>
        ) : (
          <Select
            value={selectedTenderId !== null ? String(selectedTenderId) : undefined}
            onValueChange={(v) => setSelectedTenderId(v ? Number(v) : null)}
          >
            <SelectTrigger className="w-full max-w-xl">
              <SelectValue placeholder="Select a tender…" />
            </SelectTrigger>
            <SelectContent>
              {tenders.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  <span className="font-mono text-xs font-semibold text-primary mr-2">
                    {t.reference_number}
                  </span>
                  <span className="truncate">{t.title}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ---- No tender selected ---- */}
      {selectedTenderId === null ? (
        <Card className="border-dashed">
          <CardContent>
            <EmptyState
              icon={Calculator}
              message="Select a tender to view pricing"
              hint="Pick a tender from the dropdown above to start tracking pricing revisions, generate AI pricing sheets, and compare version history."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ---- Tender info banner ---- */}
          {selectedTender && (
            <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
              <CardContent>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-primary">
                        {selectedTender.reference_number}
                      </span>
                      <Badge
                        className={cn(
                          "text-[10px] font-medium",
                          statusColor(selectedTender.status)
                        )}
                      >
                        {selectedTender.status}
                      </Badge>
                      <button
                        type="button"
                        onClick={openTenderInTendersTab}
                        className="text-[11px] text-muted-foreground underline-offset-2 hover:underline hover:text-foreground"
                      >
                        Open tender →
                      </button>
                    </div>
                    <div className="text-base font-semibold text-foreground line-clamp-1">
                      {selectedTender.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        Client:{" "}
                        <span className="text-foreground font-medium">
                          {selectedTender.client_company || "—"}
                        </span>
                      </span>
                      {selectedTender.estimated_value != null && (
                        <span>
                          Est. value:{" "}
                          <span className="text-foreground font-medium">
                            {formatCurrency(selectedTender.estimated_value)}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ---- Stats row ---- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={Receipt}
              iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
              value={versions.length}
              label="Pricing Versions"
              sublabel="Total revisions tracked"
            />
            <StatCard
              icon={TrendingUp}
              iconClass="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
              value={formatCurrency(latestTotal)}
              label="Latest Total"
              sublabel="Most recent version (incl. VAT)"
            />
            <StatCard
              icon={DollarSign}
              iconClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
              value={formatCurrency(totalValue)}
              label="All Versions Total"
              sublabel="Sum of all versions (incl. VAT)"
            />
          </div>

          {/* ---- Action buttons ---- */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  AI Generate Pricing
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(true)}
              disabled={generating}
            >
              <Plus className="h-4 w-4" />
              New Pricing Version
            </Button>
          </div>

          {/* ---- AI generating state ---- */}
          {generating && <AIGeneratingCard />}

          {/* ---- Versions list ---- */}
          {loadingVersions ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-56" />
              </CardHeader>
              <CardContent className="space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </CardContent>
            </Card>
          ) : versions.length === 0 ? (
            <Card className="border-dashed">
              <CardContent>
                <EmptyState
                  icon={Calculator}
                  message="No pricing versions yet"
                  hint="Generate an AI pricing draft based on the tender's requirements, or manually create your first pricing sheet."
                >
                  <Button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white"
                  >
                    <Sparkles className="h-4 w-4" />
                    AI Generate Pricing
                  </Button>
                  <Button variant="outline" onClick={() => setDialogOpen(true)}>
                    <Plus className="h-4 w-4" />
                    New Pricing Version
                  </Button>
                </EmptyState>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Version History
                  <Badge variant="outline" className="text-xs">
                    {versions.length}
                  </Badge>
                </h2>
                <span className="text-xs text-muted-foreground">
                  Sorted by version (latest first)
                </span>
              </div>
              {versions.map((v, idx) => (
                <VersionCard
                  key={v.id}
                  version={v}
                  onDelete={handleDelete}
                  onCopy={handleCopy}
                  copyingId={copyingId}
                  defaultOpen={idx === 0}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ---- New Pricing Version Dialog ---- */}
      {selectedTenderId !== null && (
        <NewPricingDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          tenderId={selectedTenderId}
          nextVersionNumber={nextVersionNumber}
          onSaved={() => fetchVersions(selectedTenderId)}
        />
      )}
    </div>
  );
}
