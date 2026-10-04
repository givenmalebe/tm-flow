"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Plus,
  CheckCircle2,
  XCircle,
  Trash2,
  Loader2,
  Building2,
  Search,
  ShieldCheck,
  AlertCircle,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth-context";
import { bidderApi } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function TeamTab() {
  const { user, refreshUser } = useAuth();
  const [company, setCompany] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [setupMode, setSetupMode] = useState<"create" | "join">("create");

  // Create form
  const [createForm, setCreateForm] = useState({ name: "", description: "", industry: "", phone: "", email: "" });
  const [creating, setCreating] = useState(false);

  // Join form
  const [joinQuery, setJoinQuery] = useState("");
  const [joinResults, setJoinResults] = useState<any[]>([]);
  const [joinSelected, setJoinSelected] = useState<any>(null);
  const [joinTitle, setJoinTitle] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinStatus, setJoinStatus] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    bidderApi.getCompany()
      .then((res) => {
        setCompany(res);
        setShowSetup(false);
        // Load members
        return bidderApi.listMembers();
      })
      .then((res) => setMembers(res.items || []))
      .catch(() => {
        setCompany(null);
        setShowSetup(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Debounced company search for join
  useEffect(() => {
    if (setupMode !== "join" || !joinQuery.trim()) { setJoinResults([]); return; }
    const t = setTimeout(() => {
      bidderApi.searchCompanies(joinQuery.trim())
        .then((res) => setJoinResults(res.items || []))
        .catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [joinQuery, setupMode]);

  const handleCreate = async () => {
    if (!createForm.name.trim()) { toast.error("Company name is required"); return; }
    setCreating(true);
    try {
      await bidderApi.registerCompany({
        name: createForm.name.trim(),
        description: createForm.description || undefined,
        industry: createForm.industry || undefined,
        phone: createForm.phone || undefined,
        email: createForm.email || undefined,
      });
      toast.success(`Company "${createForm.name}" created. You are the admin.`);
      await refreshUser();
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create company");
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!joinSelected) { toast.error("Please select a company from the search results"); return; }
    setJoining(true);
    try {
      const res = await bidderApi.joinCompany(joinSelected.name, joinTitle);
      setJoinStatus(res.status || "pending");
      toast.success(`Join request submitted for ${joinSelected.name}. An admin must approve your access.`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to join company");
    } finally {
      setJoining(false);
    }
  };

  const handleApprove = async (memberId: number, status: "approved" | "rejected") => {
    try {
      await bidderApi.updateMember(memberId, status);
      toast.success(`Member ${status}`);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update member");
    }
  };

  const handleRemove = async (memberId: number) => {
    try {
      await bidderApi.removeMember(memberId);
      toast.success("Member removed");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove member");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Setup screen (no company yet)
  if (showSetup || !company) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Team
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Set up your company to invite team members and share tenders
          </p>
        </div>

        {joinStatus === "pending" ? (
          <Card className="border-amber-200 bg-amber-50/30">
            <CardContent className="py-8 text-center space-y-3">
              <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
              <h3 className="text-lg font-semibold">Awaiting Approval</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Your join request has been submitted. The company admin must approve your access
                before you can see the team dashboard.
              </p>
              <Button variant="outline" onClick={() => { setJoinStatus(null); load(); }}>
                Check Status
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Set Up Your Company
              </CardTitle>
              <CardDescription>
                Create a new company or join an existing one. Team members share the same tenders and compliance library.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Toggle */}
              <div className="flex rounded-lg border border-border bg-muted/50 p-1">
                <button
                  onClick={() => setSetupMode("create")}
                  className={cn(
                    "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all",
                    setupMode === "create" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  <Plus className="size-4 inline mr-1.5" />
                  Create New
                </button>
                <button
                  onClick={() => setSetupMode("join")}
                  className={cn(
                    "flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all",
                    setupMode === "join" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
                  )}
                >
                  <Search className="size-4 inline mr-1.5" />
                  Join Existing
                </button>
              </div>

              {setupMode === "create" ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Company Name *</Label>
                    <Input
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      placeholder="e.g. Acme Security (Pty) Ltd"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Industry</Label>
                      <Input
                        value={createForm.industry}
                        onChange={(e) => setCreateForm({ ...createForm, industry: e.target.value })}
                        placeholder="e.g. Security Services"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Phone</Label>
                      <Input
                        value={createForm.phone}
                        onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                        placeholder="+27 11 123 4567"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Email</Label>
                    <Input
                      type="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      placeholder="info@company.co.za"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Description</Label>
                    <Input
                      value={createForm.description}
                      onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                      placeholder="Brief description of your company"
                    />
                  </div>
                  <Button onClick={handleCreate} disabled={creating} className="w-full">
                    {creating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
                    Create Company & Become Admin
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    You'll automatically become the company admin and can invite teammates.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Search for your company</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={joinQuery}
                        onChange={(e) => { setJoinQuery(e.target.value); setJoinSelected(null); }}
                        placeholder="Type your company name..."
                        className="pl-9"
                      />
                    </div>
                  </div>
                  {joinResults.length > 0 && (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {joinResults.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setJoinSelected(c)}
                          className={cn(
                            "w-full text-left rounded-md border p-3 transition-all",
                            joinSelected?.id === c.id
                              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                              : "border-border hover:border-primary/30"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{c.name}</span>
                            {c.industry && <span className="text-xs text-muted-foreground">· {c.industry}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {joinSelected && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Your Job Title (optional)</Label>
                      <Input
                        value={joinTitle}
                        onChange={(e) => setJoinTitle(e.target.value)}
                        placeholder="e.g. Tender Manager"
                      />
                    </div>
                  )}
                  <Button onClick={handleJoin} disabled={joining || !joinSelected} className="w-full">
                    {joining ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <UserPlus className="h-4 w-4 mr-1.5" />}
                    Request to Join
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    The company admin must approve your request before you can access the team dashboard.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Team dashboard (has company)
  const pendingMembers = members.filter((m) => m.status === "pending");
  const approvedMembers = members.filter((m) => m.status === "approved");
  const isAdmin = company.your_role === "admin";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Team
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {company.name} — {approvedMembers.length} member{approvedMembers.length === 1 ? "" : "s"}
            {pendingMembers.length > 0 && ` · ${pendingMembers.length} pending`}
          </p>
        </div>
        <Badge variant="outline" className={cn(
          "gap-1.5",
          isAdmin ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-muted text-muted-foreground"
        )}>
          <ShieldCheck className="size-3.5" />
          {isAdmin ? "Admin" : "Member"}
        </Badge>
      </div>

      {/* Invite info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="py-4 flex items-start gap-3">
          <UserPlus className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-foreground">How to invite team members:</p>
            <p className="text-muted-foreground mt-0.5">
              Tell your colleagues to register on TM Flow with the <strong>same company name</strong> ("{company.name}"),
              then go to their <strong>Team</strong> tab and click "Join Existing". They'll search for your company
              and request to join. You'll see their request here and can approve them.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Pending requests (admin only) */}
      {isAdmin && pendingMembers.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Pending Requests ({pendingMembers.length})
          </h2>
          <div className="space-y-2">
            {pendingMembers.map((m) => (
              <Card key={m.id} className="border-amber-200">
                <CardContent className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-amber-100 text-amber-700 font-semibold">
                      {m.full_name?.charAt(0) || "?"}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{m.full_name}</div>
                      <div className="text-xs text-muted-foreground">{m.email}{m.job_title && ` · ${m.job_title}`}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApprove(m.id, "approved")}>
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" className="border-rose-300 text-rose-600 hover:bg-rose-50" onClick={() => handleApprove(m.id, "rejected")}>
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* All members */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          All Members ({approvedMembers.length})
        </h2>
        <div className="space-y-2">
          {approvedMembers.map((m) => (
            <Card key={m.id}>
              <CardContent className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                    {m.full_name?.charAt(0) || "?"}
                  </div>
                  <div>
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      {m.full_name}
                      {m.role === "admin" && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 bg-emerald-50 text-emerald-700 border-emerald-200">
                          <ShieldCheck className="size-2.5 mr-0.5" />
                          Admin
                        </Badge>
                      )}
                      {m.user_id === user?.id && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1">You</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  </div>
                </div>
                {isAdmin && m.user_id !== user?.id && m.role !== "admin" && (
                  <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={() => handleRemove(m.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
