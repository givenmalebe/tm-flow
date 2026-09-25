"use client";

import { useState, useRef } from "react";
import {
  Building2,
  Hash,
  Phone,
  Mail,
  Globe,
  MapPin,
  User,
  Shield,
  Upload,
  Loader2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  PenTool,
  FileImage,
  Network,
  Download,
  Trash2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function Onboarding() {
  const { user, refreshUser } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company_name: user?.company_name || "",
    registration_number: "",
    vat_number: "",
    psira_number: "",
    bbbbee_level: "",
    address: "",
    phone: "",
    email: user?.email || "",
    website: "",
    director_name: user?.full_name || "",
    director_title: "Managing Director",
  });

  // Upload states
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const [uploadingSig, setUploadingSig] = useState(false);
  const sigRef = useRef<HTMLInputElement>(null);
  const [uploadingLetter, setUploadingLetter] = useState(false);
  const letterRef = useRef<HTMLInputElement>(null);
  const [uploadingOrg, setUploadingOrg] = useState(false);
  const orgRef = useRef<HTMLInputElement>(null);
  const [uploadingProfileDoc, setUploadingProfileDoc] = useState(false);
  const profileDocRef = useRef<HTMLInputElement>(null);

  // Uploaded file URLs
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [letterUrl, setLetterUrl] = useState<string | null>(null);
  const [orgUrl, setOrgUrl] = useState<string | null>(null);
  const [profileDocUrl, setProfileDocUrl] = useState<string | null>(null);

  const steps = [
    { title: "Company Information", icon: Building2 },
    { title: "Compliance Details", icon: Shield },
    { title: "Director & Signatory", icon: User },
    { title: "Logo & Letterhead", icon: FileImage },
    { title: "Signature & Organogram", icon: PenTool },
    { title: "Company Profile Document", icon: FileImage },
  ];

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await api.updateCompanyProfile(form);
    } catch (e: any) {
      // Ignore — profile might not exist yet, that's OK
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      await api.updateCompanyProfile(form);
      await api.completeOnboarding({ company_name: form.company_name });
      await refreshUser();
      toast.success("Onboarding complete! Welcome to TenderFlow.");
    } catch (e: any) {
      toast.error(e.message || "Failed to complete onboarding");
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    if (step < steps.length - 1) {
      await handleSaveProfile();
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      await handleFinish();
    }
  };

  const handleUpload = async (
    file: File,
    uploader: (f: File) => Promise<any>,
    setter: (url: string) => void,
    setter2: (v: boolean) => void
  ) => {
    setter2(true);
    try {
      const res = await uploader(file);
      setter(res.url || res.signature_url || res.letterhead_url || res.organogram_url || res.company_profile_doc_url);
      toast.success("Uploaded successfully");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setter2(false);
    }
  };

  const canProceed = () => {
    if (step === 0) return form.company_name.trim().length > 0;
    return true;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/30 via-background to-teal-50/20">
      {/* Header */}
      <div className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-semibold">TenderFlow Onboarding</div>
              <div className="text-[10px] text-muted-foreground">Step {step + 1} of {steps.length}</div>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {step + 1} / {steps.length}
          </Badge>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
          style={{ width: `${((step + 1) / steps.length) * 100}%` }}
        />
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Step indicator */}
        <div className="flex items-center justify-between mb-8 overflow-x-auto scrollbar-thin">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="flex items-center">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                    i < step && "border-emerald-500 bg-emerald-500 text-white",
                    i === step && "border-primary bg-primary text-primary-foreground scale-110 shadow-md",
                    i > step && "border-muted bg-background text-muted-foreground"
                  )}
                >
                  {i < step ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
                {i < steps.length - 1 && (
                  <div className={cn("h-0.5 w-6 sm:w-12", i < step ? "bg-emerald-500" : "bg-muted")} />
                )}
              </div>
            );
          })}
        </div>

        <Card className="shadow-lg">
          <CardContent className="p-6 sm:p-8">
            {/* Step 0: Company Information */}
            {step === 0 && (
              <div className="space-y-4">
                <div className="text-center mb-6">
                  <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-primary/10 mb-3">
                    <Building2 className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold">Tell us about your company</h2>
                  <p className="text-sm text-muted-foreground mt-1">This information will be used on all your tender documents</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <Label className="text-xs flex items-center gap-1"><Building2 className="h-3 w-3" /> Company Name *</Label>
                    <Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="e.g. Acme Security (Pty) Ltd" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3" /> Address</Label>
                    <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} rows={2} placeholder="123 Main Street, Cape Town, 8001" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Phone</Label>
                    <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+27 21 123 4567" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> Email</Label>
                    <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1"><Globe className="h-3 w-3" /> Website</Label>
                    <Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="www.company.co.za" />
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Compliance Details */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="text-center mb-6">
                  <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-primary/10 mb-3">
                    <Shield className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold">Compliance & Registration</h2>
                  <p className="text-sm text-muted-foreground mt-1">Your registration numbers for tender compliance</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1"><Hash className="h-3 w-3" /> CIPC Registration No.</Label>
                    <Input value={form.registration_number} onChange={(e) => set("registration_number", e.target.value)} placeholder="2018/123456/07" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1"><Hash className="h-3 w-3" /> VAT Number</Label>
                    <Input value={form.vat_number} onChange={(e) => set("vat_number", e.target.value)} placeholder="4230267890" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1"><Shield className="h-3 w-3" /> PSIRA Number</Label>
                    <Input value={form.psira_number} onChange={(e) => set("psira_number", e.target.value)} placeholder="PSIRA-12345" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1"><Shield className="h-3 w-3" /> B-BBEE Level</Label>
                    <Input value={form.bbbbee_level} onChange={(e) => set("bbbbee_level", e.target.value)} placeholder="Level 2" />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Director & Signatory */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="text-center mb-6">
                  <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-primary/10 mb-3">
                    <User className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold">Authorized Signatory</h2>
                  <p className="text-sm text-muted-foreground mt-1">Who signs your tender submissions?</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1"><User className="h-3 w-3" /> Director / Signatory Name</Label>
                    <Input value={form.director_name} onChange={(e) => set("director_name", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1"><User className="h-3 w-3" /> Title</Label>
                    <Input value={form.director_title} onChange={(e) => set("director_title", e.target.value)} placeholder="Managing Director" />
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Logo & Letterhead */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="text-center mb-2">
                  <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-primary/10 mb-3">
                    <FileImage className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold">Logo & Letterhead</h2>
                  <p className="text-sm text-muted-foreground mt-1">Upload your branding for AI-generated documents</p>
                </div>

                {/* Logo */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">Company Logo</Label>
                  <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, api.uploadCompanyLogo.bind(api), setLogoUrl, setUploadingLogo); }} />
                  {logoUrl ? (
                    <div className="flex items-center gap-3 rounded-lg border p-3 bg-emerald-50/50">
                      <img src={logoUrl} alt="Logo" className="max-h-16 object-contain" />
                      <Button size="sm" variant="outline" onClick={() => logoRef.current?.click()} disabled={uploadingLogo}>Replace</Button>
                    </div>
                  ) : (
                    <button onClick={() => logoRef.current?.click()} disabled={uploadingLogo} className="w-full rounded-lg border-2 border-dashed p-6 flex flex-col items-center hover:border-primary hover:bg-primary/5 transition-colors">
                      {uploadingLogo ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Upload className="h-6 w-6 text-primary" />}
                      <span className="text-sm mt-1">{uploadingLogo ? "Uploading…" : "Upload Logo"}</span>
                    </button>
                  )}
                </div>

                {/* Letterhead */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">Company Letterhead</Label>
                  <input ref={letterRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, api.uploadCompanyLetterhead.bind(api), setLetterUrl, setUploadingLetter); }} />
                  {letterUrl ? (
                    <div className="flex items-center gap-3 rounded-lg border p-3 bg-emerald-50/50">
                      <img src={letterUrl} alt="Letterhead" className="max-h-20 object-contain" />
                      <Button size="sm" variant="outline" onClick={() => letterRef.current?.click()} disabled={uploadingLetter}>Replace</Button>
                    </div>
                  ) : (
                    <button onClick={() => letterRef.current?.click()} disabled={uploadingLetter} className="w-full rounded-lg border-2 border-dashed p-6 flex flex-col items-center hover:border-primary hover:bg-primary/5 transition-colors">
                      {uploadingLetter ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <FileImage className="h-6 w-6 text-primary" />}
                      <span className="text-sm mt-1">{uploadingLetter ? "Uploading…" : "Upload Letterhead"}</span>
                      <span className="text-xs text-muted-foreground mt-0.5">AI will use this as the header for all documents</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Signature & Organogram */}
            {step === 4 && (
              <div className="space-y-6">
                <div className="text-center mb-2">
                  <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-primary/10 mb-3">
                    <PenTool className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold">Signature & Organogram</h2>
                  <p className="text-sm text-muted-foreground mt-1">AI will use these in generated documents</p>
                </div>

                {/* Signature */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">Director's Signature</Label>
                  <input ref={sigRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, api.uploadCompanySignature.bind(api), setSigUrl, setUploadingSig); }} />
                  {sigUrl ? (
                    <div className="flex items-center gap-3 rounded-lg border p-3 bg-emerald-50/50">
                      <img src={sigUrl} alt="Signature" className="max-h-16 object-contain" />
                      <Button size="sm" variant="outline" onClick={() => sigRef.current?.click()} disabled={uploadingSig}>Replace</Button>
                    </div>
                  ) : (
                    <button onClick={() => sigRef.current?.click()} disabled={uploadingSig} className="w-full rounded-lg border-2 border-dashed p-6 flex flex-col items-center hover:border-primary hover:bg-primary/5 transition-colors">
                      {uploadingSig ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <PenTool className="h-6 w-6 text-primary" />}
                      <span className="text-sm mt-1">{uploadingSig ? "Uploading…" : "Upload Signature"}</span>
                      <span className="text-xs text-muted-foreground mt-0.5">Scanned or drawn signature image</span>
                    </button>
                  )}
                </div>

                {/* Organogram */}
                <div>
                  <Label className="text-sm font-medium mb-2 block">Company Organogram</Label>
                  <input ref={orgRef} type="file" accept=".pdf,.doc,.docx,.txt,.jpg,.png" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, api.uploadCompanyOrganogram.bind(api), setOrgUrl, setUploadingOrg); }} />
                  {orgUrl ? (
                    <div className="flex items-center gap-3 rounded-lg border p-3 bg-emerald-50/50">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <span className="text-sm">Organogram uploaded</span>
                      <Button size="sm" variant="outline" onClick={() => orgRef.current?.click()} disabled={uploadingOrg}>Replace</Button>
                    </div>
                  ) : (
                    <button onClick={() => orgRef.current?.click()} disabled={uploadingOrg} className="w-full rounded-lg border-2 border-dashed p-6 flex flex-col items-center hover:border-primary hover:bg-primary/5 transition-colors">
                      {uploadingOrg ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Network className="h-6 w-6 text-primary" />}
                      <span className="text-sm mt-1">{uploadingOrg ? "Uploading & extracting…" : "Upload Organogram"}</span>
                      <span className="text-xs text-muted-foreground mt-0.5">AI will match your real org structure</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Step 5: Company Profile Document */}
            {step === 5 && (
              <div className="space-y-6">
                <div className="text-center mb-2">
                  <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-primary/10 mb-3">
                    <FileImage className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold">Company Profile Document</h2>
                  <p className="text-sm text-muted-foreground mt-1">Upload your existing company profile so the AI can use it</p>
                </div>

                <div>
                  <input ref={profileDocRef} type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, api.uploadCompanyProfileDoc.bind(api), setProfileDocUrl, setUploadingProfileDoc); }} />
                  {profileDocUrl ? (
                    <div className="flex items-center gap-3 rounded-lg border p-4 bg-emerald-50/50">
                      <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                      <div className="flex-1">
                        <div className="text-sm font-medium">Company profile uploaded</div>
                        <div className="text-xs text-emerald-600 mt-0.5">AI will use this when generating company profile documents</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => profileDocRef.current?.click()} disabled={uploadingProfileDoc}>Replace</Button>
                    </div>
                  ) : (
                    <button onClick={() => profileDocRef.current?.click()} disabled={uploadingProfileDoc} className="w-full rounded-lg border-2 border-dashed p-8 flex flex-col items-center hover:border-primary hover:bg-primary/5 transition-colors">
                      {uploadingProfileDoc ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <Upload className="h-8 w-8 text-primary" />}
                      <span className="text-sm font-medium mt-2">{uploadingProfileDoc ? "Uploading…" : "Upload Company Profile"}</span>
                      <span className="text-xs text-muted-foreground mt-1 max-w-sm text-center">PDF, DOCX — your existing company profile document. The AI will use it as a reference when generating tender-specific company profile documents.</span>
                    </button>
                  )}
                </div>

                <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
                  <div className="flex items-start gap-2">
                    <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">You're all set!</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Once you complete onboarding, the AI will have your company name, registration numbers, PSIRA, B-BBEE,
                        logo, letterhead, signature, organogram, and company profile document — ready to generate
                        professional tender documents on your letterhead.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex items-center justify-between mt-8 pt-4 border-t">
              <Button
                variant="ghost"
                onClick={() => {
                  if (step > 0) setStep(step - 1);
                }}
                disabled={step === 0}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                {step < steps.length - 1 && (
                  <Button variant="ghost" onClick={handleFinish} disabled={saving}>
                    Skip for now
                  </Button>
                )}
                <Button onClick={handleNext} disabled={saving || !canProceed()}>
                  {saving ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                  ) : step === steps.length - 1 ? (
                    <><CheckCircle2 className="h-4 w-4" /> Complete Onboarding</>
                  ) : (
                    <>Next <ArrowRight className="h-4 w-4" /></>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
