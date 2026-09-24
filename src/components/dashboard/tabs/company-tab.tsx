"use client";

import { useEffect, useState, useRef } from "react";
import {
  Building,
  Save,
  Loader2,
  Upload,
  CheckCircle2,
  Building2,
  Hash,
  Phone,
  Mail,
  Globe,
  MapPin,
  User,
  Palette,
  FileText,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CompanyTab() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getCompanyProfile().then((p) => {
      setProfile(p);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateCompanyProfile(profile);
      toast.success("Company profile saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const res = await api.uploadCompanyLogo(file);
      setProfile({ ...profile, logo_path: res.logo_path });
      toast.success("Logo uploaded");
    } catch (e: any) {
      toast.error(e.message || "Logo upload failed");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const set = (k: string, v: any) => setProfile((p: any) => ({ ...p, [k]: v }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building className="h-6 w-6 text-primary" />
            Company Profile
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your company branding and details — used to generate tender documents on your letterhead
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving…" : "Save Profile"}
        </Button>
      </div>

      {/* Info banner */}
      <Alert>
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        <AlertDescription>
          When you generate tender documents (Method Statements, Implementation Plans, Technical Proposals, etc.),
          they will be automatically formatted with your company name, registration details, and letterhead header.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Company details form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Company info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-primary" />
                Company Information
              </CardTitle>
              <CardDescription>Official company details for tender documents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field icon={Building2} label="Company name *">
                  <Input value={profile?.company_name || ""} onChange={(e) => set("company_name", e.target.value)} />
                </Field>
                <Field icon={Hash} label="CIPC Registration No.">
                  <Input value={profile?.registration_number || ""} onChange={(e) => set("registration_number", e.target.value)} placeholder="2018/123456/07" />
                </Field>
                <Field icon={Hash} label="VAT Number">
                  <Input value={profile?.vat_number || ""} onChange={(e) => set("vat_number", e.target.value)} placeholder="4230267890" />
                </Field>
                <Field icon={Shield} label="PSIRA Number">
                  <Input value={profile?.psira_number || ""} onChange={(e) => set("psira_number", e.target.value)} placeholder="PSIRA-12345" />
                </Field>
                <Field icon={Shield} label="B-BBEE Level">
                  <Input value={profile?.bbbbee_level || ""} onChange={(e) => set("bbbbee_level", e.target.value)} placeholder="Level 2" />
                </Field>
                <Field icon={Phone} label="Phone">
                  <Input value={profile?.phone || ""} onChange={(e) => set("phone", e.target.value)} placeholder="+27 21 123 4567" />
                </Field>
                <Field icon={Mail} label="Email">
                  <Input type="email" value={profile?.email || ""} onChange={(e) => set("email", e.target.value)} />
                </Field>
                <Field icon={Globe} label="Website">
                  <Input value={profile?.website || ""} onChange={(e) => set("website", e.target.value)} placeholder="www.company.co.za" />
                </Field>
              </div>
              <Field icon={MapPin} label="Address">
                <Textarea value={profile?.address || ""} onChange={(e) => set("address", e.target.value)} rows={2} placeholder="123 Security Street, Cape Town, 8001" />
              </Field>
            </CardContent>
          </Card>

          {/* Director / signatory */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4 text-primary" />
                Authorized Signatory
              </CardTitle>
              <CardDescription>Used for signature blocks on generated documents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field icon={User} label="Director / Signatory name">
                  <Input value={profile?.director_name || ""} onChange={(e) => set("director_name", e.target.value)} />
                </Field>
                <Field icon={User} label="Title">
                  <Input value={profile?.director_title || ""} onChange={(e) => set("director_title", e.target.value)} placeholder="Managing Director" />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Branding */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="h-4 w-4 text-primary" />
                Branding
              </CardTitle>
              <CardDescription>Customize the look of your generated documents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field icon={Palette} label="Primary color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={profile?.primary_color || "#0f766e"}
                      onChange={(e) => set("primary_color", e.target.value)}
                      className="h-9 w-12 rounded border cursor-pointer"
                    />
                    <Input value={profile?.primary_color || ""} onChange={(e) => set("primary_color", e.target.value)} />
                  </div>
                </Field>
                <Field icon={FileText} label="Font family">
                  <Input value={profile?.font_family || ""} onChange={(e) => set("font_family", e.target.value)} placeholder="Arial, sans-serif" />
                </Field>
              </div>
              <Field icon={FileText} label="Letterhead tagline (optional)">
                <Input value={profile?.letterhead_tagline || ""} onChange={(e) => set("letterhead_tagline", e.target.value)} placeholder="Protecting what matters most" />
              </Field>
            </CardContent>
          </Card>
        </div>

        {/* Right: Logo + preview */}
        <div className="space-y-6">
          {/* Logo upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company Logo</CardTitle>
              <CardDescription>Appears on your generated documents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              {profile?.logo_path ? (
                <div className="rounded-lg border p-4 bg-muted/30 flex flex-col items-center">
                  <img
                    src={`/uploads/${profile.logo_path}?XTransformPort=8000`}
                    alt="Company logo"
                    className="max-h-24 max-w-full object-contain mb-2"
                  />
                  <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}>
                    {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    Replace Logo
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="w-full rounded-lg border-2 border-dashed p-8 flex flex-col items-center text-center hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  {uploadingLogo ? (
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  ) : (
                    <Upload className="h-8 w-8 text-primary" />
                  )}
                  <span className="text-sm font-medium mt-2">
                    {uploadingLogo ? "Uploading…" : "Upload Logo"}
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG — max 2 MB</span>
                </button>
              )}
            </CardContent>
          </Card>

          {/* Letterhead preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Letterhead Preview</CardTitle>
              <CardDescription>How your document header will look</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className="rounded-lg border p-4 bg-white"
                style={{ fontFamily: profile?.font_family || "Arial, sans-serif" }}
              >
                {profile?.logo_path && (
                  <img
                    src={`/uploads/${profile.logo_path}?XTransformPort=8000`}
                    alt="Logo"
                    className="max-h-16 max-w-full object-contain mb-2"
                  />
                )}
                <div
                  className="text-lg font-bold"
                  style={{ color: profile?.primary_color || "#0f766e" }}
                >
                  {(profile?.company_name || "Your Company").toUpperCase()}
                </div>
                {profile?.address && (
                  <div className="text-xs text-gray-600 mt-0.5">{profile.address}</div>
                )}
                <div className="text-xs text-gray-600">
                  {[
                    profile?.phone && `Tel: ${profile.phone}`,
                    profile?.email && `Email: ${profile.email}`,
                    profile?.website && `Web: ${profile.website}`,
                  ].filter(Boolean).join(" | ")}
                </div>
                <div className="text-xs text-gray-600">
                  {[
                    profile?.registration_number && `Reg No: ${profile.registration_number}`,
                    profile?.vat_number && `VAT: ${profile.vat_number}`,
                    profile?.psira_number && `PSIRA: ${profile.psira_number}`,
                  ].filter(Boolean).join(" | ")}
                </div>
                {profile?.bbbbee_level && (
                  <div className="text-xs text-gray-600">B-BBEE: {profile.bbbbee_level}</div>
                )}
                {profile?.letterhead_tagline && (
                  <div className="text-xs italic text-gray-500 mt-1">{profile.letterhead_tagline}</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs flex items-center gap-1">
        <Icon className="h-3 w-3 text-muted-foreground" />
        {label}
      </Label>
      {children}
    </div>
  );
}
