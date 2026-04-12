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

export interface NodeResponse {
  uri: string;
  properties: Record<string, string[]>;
  /** Grouped relations keyed by e.g. "active_wet", "inactive_beleidsregel" */
  relations?: Record<string, RelationGroup>;
  children: NodeChild[];
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
