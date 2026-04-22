const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function apiFetch<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

export interface HealthResponse {
  status: string;
  triple_count: number;
  bind_ip: string;
}

export interface NodeChild {
  uri: string;
  label: string | null;
  titel: string | null;
  type: string | null;
}

/** Maps target URI → resolved label */
export type RelationGroup = Record<string, string>;

export interface DocumentTreeNode {
  uri: string;
  type?: string;
  label?: string;
  titel?: string;
  textContent?: string | null;
  children: DocumentTreeNode[];
}

export interface NodeResponse {
  uri: string;
  properties: Record<string, string[]>;
  /** Grouped relations keyed by e.g. "active_wet", "inactive_beleidsregel" */
  relations?: Record<string, RelationGroup>;
  children: NodeChild[];
  /** Present only for document root nodes (wet, AMvB, etc.) */
  document_tree?: DocumentTreeNode;
}

export interface SearchResult {
  uri: string;
  type: string | null;
  label: string | null;
  titel: string | null;
  citeertitel: string | null;
  score: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export function fetchHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/health");
}

export function fetchNode(params: { uri?: string; name?: string }): Promise<NodeResponse> {
  const query: Record<string, string> = {};
  if (params.uri) query.uri = params.uri;
  if (params.name) query.name = params.name;
  return apiFetch<NodeResponse>("/api/v1/node", query);
}

export function searchNodes(q: string, limit = 10): Promise<SearchResponse> {
  return apiFetch<SearchResponse>("/api/v1/search", { q, limit: String(limit) });
}

/* ---- LawBuddy / Cases API ---- */

export interface CaseTodo {
  id: string;
  text: string;
  done: boolean;
  due_date: string;
  case_id?: string;
  case_title?: string;
}

export interface CaseSummary {
  id: string;
  title: string;
  date: string;
  summary: string;
  archived: boolean;
  last_opened: string;
  tags: string[];
}

export interface CasesOverviewResponse {
  cases: CaseSummary[];
  todos: CaseTodo[];
  total: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface CaseDetailResponse {
  id: string;
  title: string;
  date: string;
  summary: string;
  archived: boolean;
  last_opened: string;
  tags: string[];
  chat_history: ChatMessage[];
  todos: CaseTodo[];
}

export interface TimelineEntry {
  datum_tijd: string;
  titel: string;
  beschrijving: string;
  bewijs_onderbouwd: boolean;
  bewijs_referentie: string | null;
  bewijs_toelichting: string | null;
  tijdstip_precies: boolean;
}

export interface TimelineResponse {
  case_id: string;
  timeline: {
    aangemaakt_op: string;
    tijdlijn: TimelineEntry[];
  };
}

export interface EvidenceDoc {
  id: string;
  filename: string;
  display_name: string;
  description: string;
  type: string;
  upload_date: string;
  path: string;
}

export interface EvidenceResponse {
  case_id: string;
  evidence_docs: EvidenceDoc[];
}

export interface LegalFrameworkEntry {
  uri: string;
  title: string;
  relevance: string;
}

export interface LegalFrameworkResponse {
  case_id: string;
  legal_framework: LegalFrameworkEntry[];
}

export interface SummaryReportResponse {
  case_id: string;
  summary_report: string;
}

export interface CaseSettingsResponse {
  case_id: string;
  case_settings: {
    language: string;
    auto_analyze: boolean;
    notifications_enabled: boolean;
    assigned_agents: string[];
  };
}

export interface CaseFactsResponse {
  case_facts: Record<string, unknown>;
}

export function fetchCases(): Promise<CasesOverviewResponse> {
  return apiFetch<CasesOverviewResponse>("/api/v1/cases");
}

export function fetchCaseDetail(id: string): Promise<CaseDetailResponse> {
  return apiFetch<CaseDetailResponse>(`/api/v1/cases/${encodeURIComponent(id)}`);
}

export function fetchCaseFacts(id: string): Promise<CaseFactsResponse> {
  return apiFetch<CaseFactsResponse>(`/api/v1/cases/${encodeURIComponent(id)}/case_facts`);
}

export function fetchTimeline(id: string): Promise<TimelineResponse> {
  return apiFetch<TimelineResponse>(`/api/v1/cases/${encodeURIComponent(id)}/timeline`);
}

export function fetchEvidence(id: string): Promise<EvidenceResponse> {
  return apiFetch<EvidenceResponse>(`/api/v1/cases/${encodeURIComponent(id)}/evidence_docs`);
}

export function fetchLegalFramework(id: string): Promise<LegalFrameworkResponse> {
  return apiFetch<LegalFrameworkResponse>(`/api/v1/cases/${encodeURIComponent(id)}/legal_framework`);
}

export function fetchSummaryReport(id: string): Promise<SummaryReportResponse> {
  return apiFetch<SummaryReportResponse>(`/api/v1/cases/${encodeURIComponent(id)}/summary_report`);
}

export function fetchCaseSettings(id: string): Promise<CaseSettingsResponse> {
  return apiFetch<CaseSettingsResponse>(`/api/v1/cases/${encodeURIComponent(id)}/case_settings`);
}

export function fetchCaseTodos(id: string): Promise<{ case_id: string; todos: CaseTodo[] }> {
  return apiFetch<{ case_id: string; todos: CaseTodo[] }>(`/api/v1/cases/${encodeURIComponent(id)}/todos`);
}

export async function createCase(
  data: { title: string; summary: string; tags: string[] }
): Promise<CaseSummary> {
  const url = new URL("/api/v1/cases", BASE_URL);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<CaseSummary>;
}

export async function patchCase(
  id: string,
  data: { title?: string; summary?: string; archived?: boolean }
): Promise<CaseSummary> {
  const url = new URL(`/api/v1/cases/${encodeURIComponent(id)}`, BASE_URL);
  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<CaseSummary>;
}

export async function deleteCase(id: string): Promise<void> {
  const url = new URL(`/api/v1/cases/${encodeURIComponent(id)}`, BASE_URL);
  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
}

export async function addTag(id: string, tag: string): Promise<{ tags: string[] }> {
  const url = new URL(`/api/v1/cases/${encodeURIComponent(id)}/tags`, BASE_URL);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ tag }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ tags: string[] }>;
}

export async function removeTag(id: string, tag: string): Promise<{ tags: string[] }> {
  const url = new URL(
    `/api/v1/cases/${encodeURIComponent(id)}/tags/${encodeURIComponent(tag)}`,
    BASE_URL
  );
  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ tags: string[] }>;
}
