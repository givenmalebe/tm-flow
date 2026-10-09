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
  Network,
  Download,
  Trash2,
  PenTool,
  FileImage,
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
  const [uploadingOrganogram, setUploadingOrganogram] = useState(false);
  const organogramInputRef = useRef<HTMLInputElement>(null);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const [showDrawPad, setShowDrawPad] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [uploadingLetterhead, setUploadingLetterhead] = useState(false);
  const letterheadInputRef = useRef<HTMLInputElement>(null);

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

  const handleOrganogramUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingOrganogram(true);
    try {
      const res = await api.uploadCompanyOrganogram(file);
      setProfile({
        ...profile,
        organogram_path: res.organogram_path,
        organogram_url: res.organogram_url,
        organogram_text: res.organogram_text,
      });
      toast.success(res.text_extracted ? "Organogram uploaded — AI extracted the structure" : "Organogram uploaded");
    } catch (e: any) {
      toast.error(e.message || "Organogram upload failed");
    } finally {
      setUploadingOrganogram(false);
      if (organogramInputRef.current) organogramInputRef.current.value = "";
    }
  };

  const handleOrganogramDelete = async () => {
    try {
      await api.deleteCompanyOrganogram();
      setProfile({ ...profile, organogram_path: null, organogram_url: null, organogram_text: null });
      toast.success("Organogram removed");
    } catch (e: any) {
      toast.error(e.message || "Failed to remove organogram");
    }
  };

  const handleSignatureUpload = async (file: File) => {
    setUploadingSignature(true);
    try {
      const res = await api.uploadCompanySignature(file);
      setProfile({ ...profile, signature_path: res.signature_path, signature_url: res.signature_url });
      toast.success("Signature uploaded");
    } catch (e: any) {
      toast.error(e.message || "Signature upload failed");
    } finally {
      setUploadingSignature(false);
      if (signatureInputRef.current) signatureInputRef.current.value = "";
    }
  };

  const handleSignatureDelete = async () => {
    try {
      await api.deleteCompanySignature();
      setProfile({ ...profile, signature_path: null, signature_url: null });
      toast.success("Signature removed");
    } catch (e: any) {
      toast.error(e.message || "Failed to remove signature");
    }
  };

  const handleLetterheadUpload = async (file: File) => {
    setUploadingLetterhead(true);
    try {
      const res = await api.uploadCompanyLetterhead(file);
      setProfile({ ...profile, letterhead_path: res.letterhead_path, letterhead_url: res.letterhead_url });
      toast.success("Letterhead uploaded");
    } catch (e: any) {
      toast.error(e.message || "Letterhead upload failed");
    } finally {
      setUploadingLetterhead(false);
      if (letterheadInputRef.current) letterheadInputRef.current.value = "";
    }
  };

  const handleLetterheadDelete = async () => {
    try {
      await api.deleteCompanyLetterhead();
      setProfile({ ...profile, letterhead_path: null, letterhead_url: null });
      toast.success("Letterhead removed");
    } catch (e: any) {
      toast.error(e.message || "Failed to remove letterhead");
    }
  };

  // Canvas drawing handlers
  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ("touches" in e ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ("touches" in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ("touches" in e ? e.touches[0].clientY : e.clientY) - rect.top;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDraw = () => {
    setDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveCanvasSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Check if canvas has content
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasContent = imageData.data.some((v, i) => i % 4 === 3 && v > 0);
    if (!hasContent) {
      toast.error("Please draw your signature first");
      return;
    }
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "signature.png", { type: "image/png" });
      await handleSignatureUpload(file);
      setShowDrawPad(false);
      clearCanvas();
    }, "image/png");
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
                    src={`/uploads/${profile.logo_path}`}
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

          {/* Organogram upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Network className="h-4 w-4 text-primary" />
                Company Organogram
              </CardTitle>
              <CardDescription>
                Upload your company's organogram so the AI can generate accurate organogram documents
                that match your real organizational structure
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={organogramInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.csv,.jpg,.png"
                onChange={handleOrganogramUpload}
                className="hidden"
              />
              {profile?.organogram_url ? (
                <div className="flex items-center gap-2 rounded-lg border p-3 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Organogram uploaded</div>
                    {profile.organogram_text && (
                      <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                        AI extracted the structure — generated organograms will match your real org chart
                      </div>
                    )}
                    <a
                      href={profile.organogram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                    >
                      <Download className="h-3 w-3" />
                      View / Download
                    </a>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => organogramInputRef.current?.click()}
                    disabled={uploadingOrganogram}
                  >
                    {uploadingOrganogram ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    Replace
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-rose-600"
                    onClick={handleOrganogramDelete}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => organogramInputRef.current?.click()}
                  disabled={uploadingOrganogram}
                  className="w-full rounded-lg border-2 border-dashed p-8 flex flex-col items-center text-center hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  {uploadingOrganogram ? (
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  ) : (
                    <Network className="h-8 w-8 text-primary" />
                  )}
                  <span className="text-sm font-medium mt-2">
                    {uploadingOrganogram ? "Uploading & extracting…" : "Upload Company Organogram"}
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">
                    PDF, DOCX, TXT, JPG, PNG — the AI will read it and use the real structure when generating organogram documents
                  </span>
                </button>
              )}
              {profile?.organogram_text && (
                <div className="rounded-lg bg-muted/30 p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Extracted structure preview:</div>
                  <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground max-h-32 overflow-y-auto scrollbar-thin">
                    {profile.organogram_text?.slice(0, 500)}
                    {profile.organogram_text?.length > 500 ? "..." : ""}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Signature */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PenTool className="h-4 w-4 text-primary" />
                Authorized Signatory Signature
              </CardTitle>
              <CardDescription>
                Draw or upload your signature — the AI will include it in the signature blocks of generated documents
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={signatureInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleSignatureUpload(file);
                }}
                className="hidden"
              />

              {profile?.signature_url ? (
                <div className="flex items-center gap-2 rounded-lg border p-3 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Signature saved</div>
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                      AI will include this signature in document signature blocks
                    </div>
                    <img
                      src={profile.signature_url}
                      alt="Signature"
                      className="mt-2 max-h-20 max-w-xs object-contain border rounded bg-white p-1"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="outline" onClick={() => signatureInputRef.current?.click()} disabled={uploadingSignature}>
                      {uploadingSignature ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Replace
                    </Button>
                    <Button size="sm" variant="ghost" className="text-rose-600" onClick={handleSignatureDelete}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ) : showDrawPad ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Draw your signature:</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={clearCanvas}>
                        Clear
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setShowDrawPad(false); clearCanvas(); }}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={saveCanvasSignature} disabled={uploadingSignature}>
                        {uploadingSignature ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Save
                      </Button>
                    </div>
                  </div>
                  <canvas
                    ref={canvasRef}
                    width={500}
                    height={160}
                    className="w-full border-2 border-dashed rounded-lg bg-white cursor-crosshair touch-none"
                    style={{ maxWidth: "500px", margin: "0 auto", display: "block" }}
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={stopDraw}
                    onMouseLeave={stopDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={stopDraw}
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    Draw inside the box above using your mouse or finger (touch screen)
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setShowDrawPad(true)}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    <PenTool className="h-8 w-8 text-primary" />
                    <span className="text-sm font-medium">Draw Signature</span>
                    <span className="text-xs text-muted-foreground text-center">Use mouse or touch screen to draw</span>
                  </button>
                  <button
                    onClick={() => signatureInputRef.current?.click()}
                    disabled={uploadingSignature}
                    className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 hover:border-primary hover:bg-primary/5 transition-colors"
                  >
                    {uploadingSignature ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <Upload className="h-8 w-8 text-primary" />}
                    <span className="text-sm font-medium">Upload Signature</span>
                    <span className="text-xs text-muted-foreground text-center">PNG, JPG — scanned or image</span>
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Letterhead upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileImage className="h-4 w-4 text-primary" />
                Company Letterhead
              </CardTitle>
              <CardDescription>
                Upload your company letterhead template — the AI will use it as the header for all generated documents
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={letterheadInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLetterheadUpload(file);
                }}
                className="hidden"
              />
              {profile?.letterhead_url ? (
                <div className="rounded-lg border p-3 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Letterhead uploaded</div>
                      <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                        AI will use this letterhead as the header for all generated documents
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => letterheadInputRef.current?.click()} disabled={uploadingLetterhead}>
                      {uploadingLetterhead ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Replace
                    </Button>
                    <Button size="sm" variant="ghost" className="text-rose-600" onClick={handleLetterheadDelete}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <img
                    src={profile.letterhead_url}
                    alt="Company Letterhead"
                    className="w-full max-h-40 object-contain border rounded bg-white p-2"
                  />
                  <a
                    href={profile.letterhead_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1 mt-1"
                  >
                    <Download className="h-3 w-3" />
                    View full size
                  </a>
                </div>
              ) : (
                <button
                  onClick={() => letterheadInputRef.current?.click()}
                  disabled={uploadingLetterhead}
                  className="w-full rounded-lg border-2 border-dashed p-8 flex flex-col items-center text-center hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  {uploadingLetterhead ? (
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  ) : (
                    <FileImage className="h-8 w-8 text-primary" />
                  )}
                  <span className="text-sm font-medium mt-2">
                    {uploadingLetterhead ? "Uploading…" : "Upload Company Letterhead"}
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">
                    PNG, JPG — your company letterhead image with logo, address and branding. The AI will reference this at the top of every generated document.
                  </span>
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
                    src={`/uploads/${profile.logo_path}`}
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
