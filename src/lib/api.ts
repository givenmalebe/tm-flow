/**
 * TenderFlow - Frontend API client
 * All requests route through the Caddy gateway using XTransformPort=8000
 * to reach the Python FastAPI backend.
 */

const API_PORT = "8000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("tenderflow_token");
}

function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("tenderflow_token", token);
  else localStorage.removeItem("tenderflow_token");
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
  const url = `/api${path}${path.includes("?") ? "&" : "?"}XTransformPort=${API_PORT}`;

  const headers: Record<string, string> = {};
  if (!isForm) headers["Content-Type"] = "application/json";
  if (!skipAuth) {
    const token = getToken();
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
  // ---- Auth ----
  async register(email: string, full_name: string, password: string, company_name?: string) {
    const data = await request<{ access_token: string; user: any }>("/auth/register", {
      method: "POST",
      body: { email, full_name, password, company_name },
      skipAuth: true,
    });
    setToken(data.access_token);
    setUserStorage(data.user);
    return data;
  },

  async login(email: string, password: string) {
    const data = await request<{ access_token: string; user: any }>("/auth/login", {
      method: "POST",
      body: { email, password },
      skipAuth: true,
    });
    setToken(data.access_token);
    setUserStorage(data.user);
    return data;
  },

  logout() {
    setToken(null);
    setUserStorage(null);
  },

  async me() {
    return request<any>("/auth/me");
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
    sort?: string;
    order?: string;
  } = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) qs.append(k, String(v));
    });
    const q = qs.toString();
    return request<{ items: any[]; total: number }>(`/tenders${q ? "?" + q : ""}`);
  },

  async getTender(id: number) {
    return request<any>(`/tenders/${id}`);
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

  async createBriefing(tenderId: number, payload: any) {
    return request<any>(`/tenders/${tenderId}/briefings`, { method: "POST", body: payload });
  },

  async updateBriefing(id: number, payload: any) {
    return request<any>(`/briefings/${id}`, { method: "PUT", body: payload });
  },

  async deleteBriefing(id: number) {
    return request<{ deleted: boolean }>(`/briefings/${id}`, { method: "DELETE" });
  },

  // ---- Pricing ----
  async listPricing(tenderId: number) {
    return request<{ items: any[] }>(`/tenders/${tenderId}/pricing`);
  },

  async createPricing(tenderId: number, payload: any) {
    return request<any>(`/tenders/${tenderId}/pricing`, { method: "POST", body: payload });
  },

  async deletePricing(versionId: number) {
    return request<{ deleted: boolean }>(`/pricing/${versionId}`, { method: "DELETE" });
  },

  // ---- Submissions ----
  async saveSubmission(tenderId: number, payload: any) {
    return request<any>(`/tenders/${tenderId}/submission`, { method: "POST", body: payload });
  },

  // ---- Communications ----
  async createCommunication(tenderId: number, payload: any) {
    return request<any>(`/tenders/${tenderId}/communications`, {
      method: "POST",
      body: payload,
    });
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
