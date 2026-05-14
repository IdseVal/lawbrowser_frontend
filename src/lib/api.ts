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

export interface LinkedCase {
  uri: string;
  ecli: string;
  court: string;
  date: string;
  subject: string;
}

export interface AnnotationSource {
  uri: string;
  label: string;
}

export interface Annotation {
  uri: string;
  type: "Voorwaarde" | "Rechtsgevolg";
  relation: string;
  parent_uri: string;
  naam: string;
  tekst_selectie?: string;
  beschrijving?: string;
  rechtsbronnen: AnnotationSource[];
  rechtsliteratuur: AnnotationSource[];
  creator: string;
  created_at: string;
}

export interface CreateAnnotationRequest {
  parent_uri: string;
  type: "Voorwaarde" | "Rechtsgevolg";
  naam: string;
  creator: string;
  tekst_selectie?: string;
  beschrijving?: string;
  rechtsbronnen?: string[];
  rechtsliteratuur?: string[];
}

export interface NodeResponse {
  uri: string;
  properties: Record<string, string[]>;
  /** Grouped relations keyed by e.g. "active_wet", "inactive_beleidsregel" */
  relations?: Record<string, RelationGroup>;
  children: NodeChild[];
  /** Present for document root nodes or when fetched with tree=true */
  document_tree?: DocumentTreeNode;
  /** Text content for leaf nodes like lid/tekst */
  textContent?: string | null;
  /** Case law linked to this node (articles/leden) */
  linked_cases?: LinkedCase[];
  /** Voorwaarde / Rechtsgevolg annotations (artikel/lid nodes only) */
  annotations?: Annotation[];
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

export function fetchNode(params: { uri?: string; name?: string; tree?: boolean }): Promise<NodeResponse> {
  const query: Record<string, string> = {};
  if (params.uri) query.uri = params.uri;
  if (params.name) query.name = params.name;
  if (params.tree) query.tree = "true";
  return apiFetch<NodeResponse>("/api/v1/node", query);
}

/** Placeholder: fetch full case content by URI. Endpoint TBD. */
export function fetchCaseContent(uri: string): Promise<NodeResponse> {
  return apiFetch<NodeResponse>("/api/v1/node", { uri });
}

export async function createAnnotation(data: CreateAnnotationRequest): Promise<Annotation> {
  const url = new URL("/api/v1/node/annotation", BASE_URL);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<Annotation>;
}

export async function setNodeBeschrijving(nodeUri: string, beschrijving: string): Promise<void> {
  const url = new URL("/api/v1/node/beschrijving", BASE_URL);
  url.searchParams.set("uri", nodeUri);
  const res = await fetch(url.toString(), {
    method: "PUT",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ beschrijving }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
}

export interface UpdateAnnotationRequest {
  naam?: string;
  tekst_selectie?: string;
  beschrijving?: string;
  rechtsbronnen?: string[];
  rechtsliteratuur?: string[];
}

export async function updateAnnotation(annotationUri: string, data: UpdateAnnotationRequest): Promise<Annotation> {
  const url = new URL("/api/v1/node/annotation", BASE_URL);
  url.searchParams.set("uri", annotationUri);
  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<Annotation>;
}

export async function deleteAnnotation(annotationUri: string): Promise<void> {
  const url = new URL("/api/v1/node/annotation", BASE_URL);
  url.searchParams.set("uri", annotationUri);
  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
}

export function searchNodes(q: string, limit = 10): Promise<SearchResponse> {
  return apiFetch<SearchResponse>("/api/v1/search", { q, limit: String(limit) });
}

export interface EcliSearchResult {
  uri: string;
  ecli: string;
  court: string;
  date: string;
  subject: string;
  score: number;
}

export interface EcliSearchResponse {
  query: string;
  results: EcliSearchResult[];
}

export function searchEcli(q: string, limit = 5): Promise<EcliSearchResponse> {
  return apiFetch<EcliSearchResponse>("/api/v1/search/ecli", { q, limit: String(limit) });
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
  role: "user" | "assistant" | "system";
  type?: string;
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

/* ---- Intake types ---- */

export interface IntakeStepResponse {
  step: string;
  saved: boolean;
  checklist_progress: ChecklistProgress;
  agents_ready: string[];
}

export interface IntakeEvidenceUpload {
  id: string;
  filename: string;
  display_name: string;
  type: string;
  upload_date: string;
  description: string;
  path: string;
}

export interface IntakeEvidenceResponse {
  step: "evidence";
  saved: boolean;
  uploaded: IntakeEvidenceUpload[];
  errors: string[];
  checklist_progress: ChecklistProgress;
  agents_ready: string[];
}

export interface IntakeChecklistResponse {
  checklist_progress: ChecklistProgress;
}

export interface ChecklistPhase {
  id: string;
  label: string;
  filled: number;
  total: number;
  complete: boolean;
  required_open: string[];
}

export interface ChecklistProgress {
  phases: ChecklistPhase[];
  current_phase: string;
  all_complete: boolean;
}

export interface ChatReplyMessage {
  id: string;
  role: "assistant";
  content: string;
  timestamp: string;
  token_usage: { input: number; output: number };
}

export interface SendChatResponse {
  reply: ChatReplyMessage;
  extracted_fields: Record<string, string>;
  suggested_todos: { text: string; due_date: string | null }[];
  checklist_progress: ChecklistProgress;
  agents_ready: string[];
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

/* ---- Intake endpoints ---- */

export async function submitIntakeStory(
  caseId: string,
  data: { story: string; mandate_do: string; mandate_dont?: string }
): Promise<IntakeStepResponse> {
  const url = new URL(`/api/v1/cases/${encodeURIComponent(caseId)}/intake/story`, BASE_URL);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<IntakeStepResponse>;
}

export async function submitIntakeLocation(
  caseId: string,
  data: {
    coordinates?: { lat: number; lng: number };
    country: string;
    province?: string;
    municipality: string;
    postal_code?: string;
    house_number?: string;
  }
): Promise<IntakeStepResponse> {
  const url = new URL(`/api/v1/cases/${encodeURIComponent(caseId)}/intake/location`, BASE_URL);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<IntakeStepResponse>;
}

export async function submitIntakeCounterparty(
  caseId: string,
  data: {
    name?: string;
    type?: string;
    email?: string;
    phone?: string;
    land?: string;
    stad?: string;
    postcode?: string;
    straat?: string;
    huisnummer?: string;
    toevoeging?: string;
  }
): Promise<IntakeStepResponse> {
  const url = new URL(`/api/v1/cases/${encodeURIComponent(caseId)}/intake/counterparty`, BASE_URL);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<IntakeStepResponse>;
}

export async function submitIntakeEvidence(
  caseId: string,
  files: File[]
): Promise<IntakeEvidenceResponse> {
  const url = new URL(`/api/v1/cases/${encodeURIComponent(caseId)}/intake/evidence`, BASE_URL);
  const formData = new FormData();
  for (const file of files) {
    formData.append("files[]", file);
  }
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Accept: "application/json" },
    body: formData,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<IntakeEvidenceResponse>;
}

export function fetchIntakeChecklist(caseId: string): Promise<IntakeChecklistResponse> {
  return apiFetch<IntakeChecklistResponse>(`/api/v1/cases/${encodeURIComponent(caseId)}/checklist`);
}

/* ---- Pipeline status ---- */

export interface PipelineStatusResponse {
  current_stage: "timeline" | "summary" | "legal_framework" | "done" | "error";
  status: "running" | "completed" | "error" | "idle";
  detail: string;
  updated_at: string;
}

export async function triggerAnalyze(caseId: string): Promise<void> {
  const url = new URL(`/api/v1/cases/${encodeURIComponent(caseId)}/analyze`, BASE_URL);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
}

export function fetchPipelineStatus(caseId: string): Promise<PipelineStatusResponse> {
  return apiFetch<PipelineStatusResponse>(`/api/v1/cases/${encodeURIComponent(caseId)}/pipeline_status`);
}

/* ---- Intake pre-fill GET endpoints ---- */

export interface IntakeStoryData {
  story: string;
  mandate_do: string;
  mandate_dont?: string;
}

export interface IntakeLocationData {
  coordinates?: { lat: number; lng: number };
  country: string;
  province?: string;
  municipality: string;
  postal_code?: string;
  house_number?: string;
}

export interface IntakeCounterpartyData {
  name: string;
  type: string;
  email?: string;
  phone?: string;
  land?: string;
  stad?: string;
  postcode?: string;
  straat?: string;
  huisnummer?: string;
  toevoeging?: string;
}

export interface IntakeEvidenceData {
  evidence_docs: IntakeEvidenceUpload[];
}

export function fetchIntakeStory(caseId: string): Promise<IntakeStoryData> {
  return apiFetch<IntakeStoryData>(`/api/v1/cases/${encodeURIComponent(caseId)}/intake/story`);
}

export function fetchIntakeLocation(caseId: string): Promise<IntakeLocationData> {
  return apiFetch<IntakeLocationData>(`/api/v1/cases/${encodeURIComponent(caseId)}/intake/location`);
}

export function fetchIntakeCounterparty(caseId: string): Promise<IntakeCounterpartyData> {
  return apiFetch<IntakeCounterpartyData>(`/api/v1/cases/${encodeURIComponent(caseId)}/intake/counterparty`);
}

export function fetchIntakeEvidence(caseId: string): Promise<IntakeEvidenceData> {
  return apiFetch<IntakeEvidenceData>(`/api/v1/cases/${encodeURIComponent(caseId)}/intake/evidence`);
}

export async function sendChatMessage(
  caseId: string,
  message: string
): Promise<SendChatResponse> {
  const url = new URL(`/api/v1/cases/${encodeURIComponent(caseId)}/chat`, BASE_URL);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<SendChatResponse>;
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
