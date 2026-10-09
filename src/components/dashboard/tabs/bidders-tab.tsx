'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users,
  Trophy,
  FileCheck,
  AlertTriangle,
  Upload,
  Sparkles,
  Trash2,
  Plus,
  Download,
  ChevronDown,
  ChevronUp,
  X,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  Search,
  Filter,
  Award,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { api } from '@/lib/api';
import {
  useDashboardStore,
  formatDate,
  formatCurrency,
} from '@/lib/dashboard-store';
import { cn } from '@/lib/utils';
interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  iconBg?: string;
  valueClassName?: string;
}
function StatCard({ title, value, subtitle, icon: Icon, iconBg = 'bg-emerald-100 dark:bg-emerald-950', valueClassName }: StatCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <div className={cn('rounded-lg p-1.5', iconBg)}>
            <Icon className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className={cn('text-2xl font-semibold tabular-nums tracking-tight', valueClassName)}>{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
function EmptyState({ icon: Icon, title, description, action }: any) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-10 text-center">
        <div className="rounded-2xl bg-primary/10 p-3 mb-4">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">{description}</p>
        {action}
      </CardContent>
    </Card>
  );
}
export function BiddersTab() {
  const { selectedTenderId, selectTender, refreshKey } = useDashboardStore();
  const [tenders, setTenders] = useState<any[]>([]);
  const [bidders, setBidders] = useState<any[]>([]);
  const [requiredDocs, setRequiredDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTender, setSelectedTender] = useState<number | null>(selectedTenderId);
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bidders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Bidder responses, compliance & evaluation</p>
        </div>
      </div>
      <EmptyState icon={Users} title="Bidders" description="Track multiple bidders, required documents, AI evaluation and top bidder selection" />
    </div>
  );
}
