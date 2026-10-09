/**
 * TM Flow - Frontend API client.
 *
 * Requests route to the Next.js catch-all proxy at /api/*, which forwards to
 * the Python FastAPI backend (BACKEND_URL, a Cloud Run service when deployed).
 *
 * Authentication uses Firebase Auth. There is no bespoke JWT any more: each
 * request carries the current Firebase ID token, which the proxy forwards to
 * FastAPI unchanged.
 */
import { getFirebaseAuth } from "@/lib/firebase";

/**
 * Returns the current Firebase ID token, or null when signed out.
 * Reading it is async because the SDK may need to refresh an expired token.
 */
async function getToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const user = getFirebaseAuth().currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

function getUserStorage(): any | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("tenderflow_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setUserStorage(user: any | null) {
  if (typeof window === "undefined") return;
  if (user) localStorage.setItem("tenderflow_user", JSON.stringify(user));
  else localStorage.removeItem("tenderflow_user");
}

interface RequestOptions {
  method?: string;
  body?: any;
  isForm?: boolean;
  skipAuth?: boolean;
}

async function request<T = any>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, isForm = false, skipAuth = false } = options;
  const url = `/api${path}`;

  const headers: Record<string, string> = {};
  if (!isForm) headers["Content-Type"] = "application/json";
  if (!skipAuth) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const err = await res.json();
      detail = err.detail || err.message || detail;
    } catch {}
    throw new Error(detail);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return (await res.text()) as unknown as T;
}

// Auth
export const api = {
  /**
   * @deprecated Auth is owned by Firebase Auth via auth-context.tsx. Kept so
   * existing call sites typecheck; it no longer issues a session token.
   */
  async register(
    email: string,
    full_name: string,
    _password: string,
    _company_name?: string,
    _account_type?: "applicant" | "issuer"
  ) {
    void email;
    void full_name;
    throw new Error("Use the Firebase Auth signup flow in auth-context.tsx.");
  },

  /** @deprecated See api.register. */
  async login(_email: string, _password: string) {
    throw new Error("Use the Firebase Auth signin flow in auth-context.tsx.");
  },

  logout() {
    setUserStorage(null);
  },

  /**
   * @deprecated The profile is read from SQL Connect via auth-context.tsx.
   */
  async me() {
    return getUserStorage();
  },

  getToken,
  getUserStorage,

  // ---- Tenders ----
  async listTenders(params: {
    search?: string;
    status?: string;
    category?: string;
    person_responsible?: string;
    outcome?: string;
    location?: string;
    closing_date_from?: string;
    closing_date_to?: string;
    value_min?: number;
    value_max?: number;
    submission_date_from?: string;
    submission_date_to?: string;
    sort?: string;
    order?: string;
  } = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    });
    const q = qs.toString();
    return request<{ items: any[]; total: number }>(`/tenders${q ? "?" + q : ""}`);
  },

  async getTender(id: number) {
    return request<any>(`/tenders/${id}`);
  },

  async exportTendersCsv() {
    const headers: Record<string, string> = {};
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch("/api/tenders/export", { headers, credentials: "include" });
    if (!res.ok) throw new Error("Export failed");
    return res.blob();
  },

  async createTender(payload: any) {
    return request<any>(`/tenders`, { method: "POST", body: payload });
  },

  async updateTender(id: number, payload: any) {
    return request<any>(`/tenders/${id}`, { method: "PUT", body: payload });
  },

  async deleteTender(id: number) {
    return request<{ deleted: boolean }>(`/tenders/${id}`, { method: "DELETE" });
  },

  async archiveTender(id: number) {
    return request<any>(`/tenders/${id}/archive`, { method: "POST" });
  },

  async uploadTenderDocument(tenderId: number, file: File, isPrimary = false) {
    const form = new FormData();
    form.append("file", file);
    form.append("is_primary", String(isPrimary));
    return request<any>(`/tenders/${tenderId}/documents`, {
      method: "POST",
      body: form,
      isForm: true,
    });
  },

  async deleteTenderDocument(tenderId: number, docId: number) {
    return request<{ deleted: boolean }>(`/tenders/${tenderId}/documents/${docId}`, {
      method: "DELETE",
    });
  },

  async aiExtractTender(tenderId: number) {
    return request<any>(`/tenders/${tenderId}/ai-extract`, { method: "POST" });
  },

  async aiTenderSummary(tenderId: number) {
    return request<{ summary: string }>(`/tenders/${tenderId}/ai-summary`, { method: "POST" });
  },

  async generateReadinessReport(tenderId: number) {
    return request<{ report: string; tender_id: number }>(`/tenders/${tenderId}/readiness-report`, {
      method: "POST",
    });
  },

  // ---- Checklist ----
  async addChecklistItem(tenderId: number, item: any) {
    return request<any>(`/tenders/${tenderId}/checklist`, { method: "POST", body: item });
  },

  async regenerateChecklist(tenderId: number) {
    return request<any>(`/tenders/${tenderId}/checklist/regenerate`, { method: "POST" });
  },

  async updateChecklistItem(itemId: number, payload: any) {
    return request<any>(`/checklist/${itemId}`, { method: "PUT", body: payload });
  },

  async deleteChecklistItem(itemId: number) {
    return request<{ deleted: boolean }>(`/checklist/${itemId}`, { method: "DELETE" });
  },

  async uploadChecklistDocument(itemId: number, file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<any>(`/checklist/${itemId}/upload`, {
      method: "POST",
      body: form,
      isForm: true,
    });
  },

  // ---- Library ----
  async listLibrary(params: { category?: string; search?: string } = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) qs.append(k, String(v));
    });
    const q = qs.toString();
    return request<{ items: any[] }>(`/library${q ? "?" + q : ""}`);
  },

  async uploadLibraryDocument(form: FormData) {
    return request<any>(`/library`, { method: "POST", body: form, isForm: true });
  },

  async updateLibraryDocument(id: number, payload: any) {
    const qs = new URLSearchParams();
    Object.entries(payload).forEach(([k, v]) => {
      if (v !== undefined && v !== null) qs.append(k, String(v));
    });
    return request<any>(`/library/${id}?${qs.toString()}`, { method: "PUT" });
  },

  async deleteLibraryDocument(id: number) {
    return request<{ deleted: boolean }>(`/library/${id}`, { method: "DELETE" });
  },

  // ---- Briefings ----
  async listBriefings(upcoming_only = false, days = 30) {
    return request<{ items: any[] }>(
      `/briefings?upcoming_only=${upcoming_only}&days=${days}`
    );
  },

  async getBriefingAlerts() {
    return request<{
      alerts: any[];
      upcoming: any[];
      summary: any;
    }>(`/briefings/alerts`);
  },

  async createBriefing(tenderId: number, payload: any) {
    return request<any>(`/tenders/${tenderId}/briefings`, { method: "POST", body: payload });
  },

  async updateBriefing(id: number, payload: any) {
    return request<any>(`/briefings/${id}`, { method: "PUT", body: payload });
  },

  async deleteBriefing(id: number) {
    return request<{ deleted: boolean }>(`/briefings/${id}`, { method: "DELETE" });
  },

  async uploadBriefingCertificate(briefingId: number, file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<any>(`/briefings/${briefingId}/certificate`, {
      method: "POST",
      body: form,
      isForm: true,
    });
  },

  async deleteBriefingCertificate(briefingId: number) {
    return request<{ deleted: boolean }>(`/briefings/${briefingId}/certificate`, {
      method: "DELETE",
    });
  },

  // ---- Pricing ----
  async listPricing(tenderId: number) {
    return request<{ items: any[] }>(`/tenders/${tenderId}/pricing`);
  },

  async createPricing(tenderId: number, payload: any) {
    return request<any>(`/tenders/${tenderId}/pricing`, { method: "POST", body: payload });
  },

  async generatePricingSheet(tenderId: number) {
    return request<any>(`/tenders/${tenderId}/pricing/generate`, { method: "POST" });
  },

  async copyPricingVersion(versionId: number) {
    return request<any>(`/pricing/${versionId}/copy`, { method: "POST" });
  },

  async deletePricing(versionId: number) {
    return request<{ deleted: boolean }>(`/pricing/${versionId}`, { method: "DELETE" });
  },

  // ---- Submissions ----
  async saveSubmission(tenderId: number, payload: any) {
    return request<any>(`/tenders/${tenderId}/submission`, { method: "POST", body: payload });
  },

  async uploadSubmissionConfirmation(tenderId: number, file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<any>(`/tenders/${tenderId}/submission/confirmation-file`, {
      method: "POST",
      body: form,
      isForm: true,
    });
  },

  async deleteSubmissionConfirmation(tenderId: number) {
    return request<{ deleted: boolean }>(`/tenders/${tenderId}/submission/confirmation-file`, {
      method: "DELETE",
    });
  },

  async uploadFinalDocuments(tenderId: number, file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<any>(`/tenders/${tenderId}/submission/final-documents`, {
      method: "POST",
      body: form,
      isForm: true,
    });
  },

  async deleteFinalDocuments(tenderId: number) {
    return request<{ deleted: boolean }>(`/tenders/${tenderId}/submission/final-documents`, {
      method: "DELETE",
    });
  },

  // ---- Communications ----
  async createCommunication(tenderId: number, payload: any) {
    return request<any>(`/tenders/${tenderId}/communications`, {
      method: "POST",
      body: payload,
    });
  },

  async uploadCommunicationAttachment(commId: number, file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<any>(`/communications/${commId}/attachment`, {
      method: "POST",
      body: form,
      isForm: true,
    });
  },

  async deleteCommunicationAttachment(commId: number) {
    return request<{ deleted: boolean }>(`/communications/${commId}/attachment`, {
      method: "DELETE",
    });
  },

  async searchAddendums() {
    return request<{
      results: any[];
      total_tenders_searched: number;
      total_with_addendums: number;
      message?: string;
    }>(`/communications/search-addendums`, { method: "POST" });
  },

  async deleteCommunication(id: number) {
    return request<{ deleted: boolean }>(`/communications/${id}`, { method: "DELETE" });
  },

  // ---- Addendums ----
  async createAddendum(tenderId: number, form: FormData) {
    return request<any>(`/tenders/${tenderId}/addendums`, {
      method: "POST",
      body: form,
      isForm: true,
    });
  },

  async analyzeAddendum(addendumId: number) {
    return request<any>(`/addendums/${addendumId}/ai-analyze`, { method: "POST" });
  },

  async deleteAddendum(id: number) {
    return request<{ deleted: boolean }>(`/addendums/${id}`, { method: "DELETE" });
  },

  // ---- Dashboard ----
  async dashboard() {
    return request<any>(`/dashboard`);
  },

  // ---- AI Tender Discovery ----
  async discoverTenders(params: {
    category: string;
    keywords?: string;
    location?: string;
    num_results?: number;
  }) {
    return request<{ query: string; results: any[]; raw_count: number; error?: string }>(
      `/tenders/discover`,
      { method: "POST", body: params }
    );
  },

  async importDiscoveredTender(payload: any) {
    return request<any>(`/tenders/import-discovered`, {
      method: "POST",
      body: payload,
    });
  },

  // ---- AI Document Reader (standalone) ----
  async readDocument(file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<{
      filename: string;
      file_size: number;
      extracted_text_preview: string;
      extraction: any;
      summary: string;
    }>(`/ai/read-document`, { method: "POST", body: form, isForm: true });
  },

  async readDocumentAndCreate(file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<any>(`/ai/read-document-and-create`, {
      method: "POST",
      body: form,
      isForm: true,
    });
  },

  // ---- Company Profile (Branding) ----
  async getCompanyProfile() {
    return request<any>(`/company-profile`);
  },

  async updateCompanyProfile(payload: any) {
    return request<any>(`/company-profile`, { method: "PUT", body: payload });
  },

  async uploadCompanyLogo(file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<{ logo_path: string; url: string }>(`/company-profile/logo`, {
      method: "POST",
      body: form,
      isForm: true,
    });
  },

  async uploadCompanyOrganogram(file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<{
      organogram_path: string;
      organogram_url: string;
      organogram_text: string;
      text_extracted: boolean;
    }>(`/company-profile/organogram`, {
      method: "POST",
      body: form,
      isForm: true,
    });
  },

  async deleteCompanyOrganogram() {
    return request<{ deleted: boolean }>(`/company-profile/organogram`, {
      method: "DELETE",
    });
  },

  async uploadCompanySignature(file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<{ signature_path: string; signature_url: string }>(`/company-profile/signature`, {
      method: "POST",
      body: form,
      isForm: true,
    });
  },

  async deleteCompanySignature() {
    return request<{ deleted: boolean }>(`/company-profile/signature`, {
      method: "DELETE",
    });
  },

  async uploadCompanyLetterhead(file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<{ letterhead_path: string; letterhead_url: string }>(`/company-profile/letterhead`, {
      method: "POST",
      body: form,
      isForm: true,
    });
  },

  async deleteCompanyLetterhead() {
    return request<{ deleted: boolean }>(`/company-profile/letterhead`, {
      method: "DELETE",
    });
  },

  async completeOnboarding(payload: any) {
    return request<{ onboarding_completed: boolean; user: any }>(`/auth/complete-onboarding`, {
      method: "POST",
      body: payload,
    });
  },

  async uploadCompanyProfileDoc(file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<{ company_profile_doc_path: string; company_profile_doc_url: string }>(`/company-profile/company-profile-doc`, {
      method: "POST",
      body: form,
      isForm: true,
    });
  },

  async deleteCompanyProfileDoc() {
    return request<{ deleted: boolean }>(`/company-profile/company-profile-doc`, {
      method: "DELETE",
    });
  },

  // ---- AI Document Generation ----
  async generateDocument(tenderId: number, docType: string) {
    return request<any>(`/tenders/${tenderId}/documents/generate`, {
      method: "POST",
      body: { doc_type: docType },
    });
  },

  async listGeneratedDocuments(tenderId: number) {
    return request<{ items: any[] }>(`/tenders/${tenderId}/documents/generated`);
  },

  async getGeneratedDocument(tenderId: number, docId: number) {
    return request<any>(`/tenders/${tenderId}/documents/generated/${docId}`);
  },

  async deleteGeneratedDocument(tenderId: number, docId: number) {
    return request<{ deleted: boolean }>(`/tenders/${tenderId}/documents/generated/${docId}`, {
      method: "DELETE",
    });
  },

  async updateGeneratedDocument(tenderId: number, docId: number, payload: { title?: string; content?: string }) {
    return request<any>(`/tenders/${tenderId}/documents/generated/${docId}`, {
      method: "PUT",
      body: payload,
    });
  },

  async generateDocumentByPrompt(tenderId: number, prompt: string, title?: string) {
    // Returns { job_id, status: "pending" } immediately
    return request<{ job_id: string; status: string }>(`/tenders/${tenderId}/documents/generate-by-prompt`, {
      method: "POST",
      body: { prompt, title },
    });
  },

  async generateDocumentByPromptStatus(tenderId: number, jobId: string) {
    return request<{ status: string; result: any; error: string | null }>(`/tenders/${tenderId}/documents/generate-by-prompt/${jobId}`);
  },

  async listDocumentTypes() {
    return request<{ types: any[] }>(`/document-types`);
  },

  async smartAnalyzeDocuments(tenderId: number) {
    return request<{ required: any[]; analyzed: boolean }>(`/tenders/${tenderId}/documents/smart-analyze`, {
      method: "POST",
    });
  },

  // ---- AI Assistant ----
  async askAssistant(question: string, tenderId?: number) {
    return request<{
      answer: string;
      context_tenders: number;
      context_documents?: number;
      context_library_docs?: number;
    }>(`/ai/assistant`, {
      method: "POST",
      body: { question, tender_id: tenderId },
    });
  },

  // ---- Reminders ----
  async listReminders() {
    return request<{ items: any[] }>(`/reminders`);
  },

  async updateReminder(id: number, enabled: boolean) {
    return request<any>(`/reminders/${id}?enabled=${enabled}`, { method: "PUT" });
  },

  async addReminder(daysBefore: number) {
    return request<any>(`/reminders?days_before=${daysBefore}`, { method: "POST" });
  },

  async deleteReminder(id: number) {
    return request<{ deleted: boolean }>(`/reminders/${id}`, { method: "DELETE" });
  },

  // ---- Deadlines ----
  async getDeadlines() {
    return request<{
      items: any[];
      summary: any;
      reminders: any[];
    }>(`/deadlines`);
  },
};

// Tender status options (mirror backend)
export const TENDER_STATUSES = [
  "New Opportunity",
  "Under Review",
  "Interested",
  "Not Interested",
  "Preparing",
  "Documents Outstanding",
  "Pricing in Progress",
  "Awaiting Information",
  "Ready for Submission",
  "Submitted",
  "Clarification Requested",
  "Clarification Submitted",
  "Shortlisted",
  "Interview/Presentation",
  "Negotiation",
  "Awarded",
  "Unsuccessful",
  "Cancelled",
  "Withdrawn",
  "Expired",
];

export const TENDER_OUTCOMES = [
  "Pending",
  "Awarded",
  "Unsuccessful",
  "Withdrawn",
];

export const LIBRARY_CATEGORIES = [
  "CIPC",
  "SARS",
  "B-BBEE",
  "PSIRA",
  "COIDA",
  "Financial statements",
  "Company profile",
  "References",
  "Policies",
  "Certificates",
  "Insurance documents",
  "Organograms",
  "Standard declarations",
  "Standard methodologies",
  "Standard SOPs",
  "Other",
];

export const CHECKLIST_STATUSES = [
  "Complete",
  "Outstanding",
  "Expired",
  "Not Applicable",
];

// ============================================================
// PUBLIC TENDER BOARD — for applicants to browse and bid
// ============================================================

export const publicApi = {
  async listTenders(params: { category?: string; q?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.category) qs.append("category", params.category);
    if (params.q) qs.append("q", params.q);
    const q = qs.toString();
    return request<{ items: any[]; total: number }>(`/public/tenders${q ? "?" + q : ""}`, { skipAuth: true });
  },
  async getTender(id: number) {
    return request<any>(`/public/tenders/${id}`, { skipAuth: true });
  },
  async submitBid(tenderId: number, formData: FormData) {
    return request<any>(`/public/tenders/${tenderId}/submit-bid`, {
      method: "POST",
      body: formData,
      isForm: true,
    });
  },
  async listCategories() {
    return request<{ items: string[] }>(`/public/categories`, { skipAuth: true });
  },
  async complianceCheck(tenderId: number) {
    return request<any>(`/public/tenders/${tenderId}/compliance-check`, { method: "POST" });
  },
};

// ============================================================
// BIDDER COMPANY — team management for applicants
// ============================================================

export const bidderApi = {
  async registerCompany(payload: { name: string; description?: string; industry?: string; phone?: string; email?: string }) {
    return request<any>("/bidder/register-company", { method: "POST", body: payload });
  },
  async joinCompany(company_name: string, job_title?: string) {
    return request<any>("/bidder/join-company", { method: "POST", body: { company_name, job_title } });
  },
  async getCompany() {
    return request<any>("/bidder/company");
  },
  async listMembers() {
    return request<{ items: any[] }>("/bidder/members");
  },
  async updateMember(memberId: number, status: "approved" | "rejected") {
    return request<any>(`/bidder/members/${memberId}`, { method: "PUT", body: { status } });
  },
  async removeMember(memberId: number) {
    return request<any>(`/bidder/members/${memberId}`, { method: "DELETE" });
  },
  async searchCompanies(q: string) {
    return request<{ items: any[] }>(`/bidder/companies/search?q=${encodeURIComponent(q)}`);
  },
};

// ============================================================
// ISSUER PORTAL — for tender-issuing organisations
// ============================================================

export const issuerApi = {
  // ---- Company management ----
  async registerCompany(payload: { name: string; registration_number?: string; description?: string; industry?: string; address?: string; phone?: string; email?: string; website?: string; job_title?: string }) {
    return request<any>("/issuer/register-company", { method: "POST", body: payload });
  },
  async joinCompany(company_name: string, job_title?: string) {
    return request<any>("/issuer/join-company", { method: "POST", body: { company_name, job_title } });
  },
  async getCompany() {
    return request<{ company: any | null; member: any | null }>("/issuer/company");
  },
  async listMembers() {
    return request<{ items: any[] }>("/issuer/members");
  },
  async updateMember(memberId: number, status: "approved" | "rejected") {
    return request<any>(`/issuer/members/${memberId}`, { method: "PUT", body: { status } });
  },
  async removeMember(memberId: number) {
    return request<any>(`/issuer/members/${memberId}`, { method: "DELETE" });
  },
  async searchCompanies(q: string) {
    return request<{ items: any[] }>(`/issuer/companies/search?q=${encodeURIComponent(q)}`);
  },

  // ---- Tenders ----
  async listTenders() {
    return request<{ items: any[]; total: number }>("/issuer/tenders");
  },
  async getTender(id: number) {
    return request<any>(`/issuer/tenders/${id}`);
  },
  async createTender(payload: any) {
    return request<any>("/issuer/tenders", { method: "POST", body: payload });
  },
  async updateTender(id: number, payload: any) {
    return request<any>(`/issuer/tenders/${id}`, { method: "PUT", body: payload });
  },
  async deleteTender(id: number) {
    return request<{ deleted: boolean }>(`/issuer/tenders/${id}`, { method: "DELETE" });
  },
  async publishTender(id: number) {
    return request<any>(`/issuer/tenders/${id}/publish`, { method: "POST" });
  },
  async unpublishTender(id: number) {
    return request<any>(`/issuer/tenders/${id}/unpublish`, { method: "POST" });
  },

  // ---- AI Tender Writer (async: POST starts job, GET polls for result) ----
  async aiGenerateTender(prompt: string, industry?: string) {
    // Returns { job_id, status: "pending" } immediately
    return request<{ job_id: string; status: string }>("/issuer/tenders/ai-generate", { method: "POST", body: { prompt, industry } });
  },
  async aiGenerateStatus(jobId: string) {
    return request<{ status: string; result: any; error: string | null }>(`/issuer/tenders/ai-generate/${jobId}`);
  },

  // ---- Bids ----
  async listTenderBids(tenderId: number) {
    return request<{ items: any[]; total: number }>(`/issuer/tenders/${tenderId}/bids`);
  },
  async listAllBids() {
    return request<{ items: any[]; total: number }>("/issuer/bids");
  },
  async deleteBid(bidId: number) {
    return request<{ deleted: boolean }>(`/issuer/bids/${bidId}`, { method: "DELETE" });
  },
  async aiReviewBid(bidId: number) {
    return request<any>(`/issuer/bids/${bidId}/ai-review`, { method: "POST" });
  },
  async awardBid(bidId: number, awarded: boolean = true) {
    return request<any>(`/issuer/bids/${bidId}/award`, { method: "POST", body: { awarded } });
  },

  // ---- Stats ----
  async getStats() {
    return request<any>("/issuer/stats");
  },
};
