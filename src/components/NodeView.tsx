"use client";

import { useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { fetchNode, NodeResponse, RelationGroup, Annotation, AnnotationSource, updateAnnotation, deleteAnnotation, searchEcli } from "@/lib/api";
import { DocumentTreeNode } from "@/lib/api";
import DocumentTree from "@/components/DocumentTree";
import ArtikelEditPanels, { BeschrijvingPanel, TextSelectionField } from "@/components/ArtikelEditPanels";

interface NodeViewProps {
  initialNodeId: string;
  isUri: boolean;
  onClose: () => void;
  editMode?: boolean;
}

interface HistoryEntry {
  nodeId: string;
  isUri: boolean;
}

/** Priority order for relation group types */
const RELATION_TYPE_PRIORITY = ["wet", "ministeriele-regeling", "beleidsregel", "AMvB"];

/** Human-readable labels for relation types */
const RELATION_TYPE_LABELS: Record<string, string> = {
  wet: "Wetten",
  "ministeriele-regeling": "Ministeriële Regelingen",
  beleidsregel: "Beleidsregels",
  "AMvB": "AMvB's",
};

function shortenUri(uri: string): string {
  if (uri.includes("#")) return uri.split("#").pop() ?? uri;
  if (uri.includes("/")) return uri.split("/").pop() ?? uri;
  return uri;
}

/** Node types that represent taxonomy / navigation levels (not legal document structure) */
const TAXONOMY_TYPES = new Set(["root", "categorie", "rechtsgebied", "hoofdgebied", "specifiekgebied"]);

/** Check if the node is a taxonomy/category node that should show flat children, not a document tree */
function isTaxonomyNode(properties: Record<string, string[]>): boolean {
  for (const [predicate, values] of Object.entries(properties)) {
    if (shortenUri(predicate) === "type" || predicate.endsWith("#type") || predicate.endsWith("/type")) {
      if (values.some((v) => TAXONOMY_TYPES.has(shortenUri(v)))) return true;
    }
  }
  return false;
}

/** Check if the node is an "Uitspraak" type based on its schema property */
function isUitspraakSchema(properties: Record<string, string[]>): boolean {
  for (const [predicate, values] of Object.entries(properties)) {
    if (shortenUri(predicate) === "type" || predicate.endsWith("#type") || predicate.endsWith("/type")) {
      if (values.some((v) => v.endsWith("/Uitspraak") || v.endsWith("#Uitspraak") || v === "Uitspraak")) return true;
    }
  }
  return false;
}

/** Check if the node is an "artikel" type based on its schema property */
function isArtikelSchema(properties: Record<string, string[]>): boolean {
  for (const [predicate, values] of Object.entries(properties)) {
    if (shortenUri(predicate) === "type" || predicate.endsWith("#type") || predicate.endsWith("/type")) {
      if (values.some((v) => v.endsWith("/artikel") || v.endsWith("#artikel") || v === "artikel")) return true;
    }
  }
  return false;
}

/** Check if the node is a "lid" type based on its schema property */
function isLidSchema(properties: Record<string, string[]>): boolean {
  for (const [predicate, values] of Object.entries(properties)) {
    if (shortenUri(predicate) === "type" || predicate.endsWith("#type") || predicate.endsWith("/type")) {
      if (values.some((v) => v.endsWith("/lid") || v.endsWith("#lid") || v === "lid")) return true;
    }
  }
  return false;
}

/** Check if a property predicate should be hidden from the properties table */
function isHiddenPredicate(predicate: string, hiddenExtras: Set<string>): boolean {
  const local = shortenUri(predicate);
  if (local.startsWith("active_") || local.startsWith("inactive_") || local === "hasChild") return true;
  if (hiddenExtras.has(local)) return true;
  return false;
}

/**
 * Highlight annotation selections within a text string.
 * Returns ReactNode[] with <mark> spans for matched fragments.
 */
function highlightAnnotations(text: string, annotations: Annotation[]): ReactNode {
  if (!annotations.length) return text;

  // Collect all highlight ranges
  const highlights: { start: number; end: number; className: string }[] = [];
  for (const a of annotations) {
    if (!a.tekst_selectie) continue;
    const cls = a.type === "Voorwaarde" ? "hl-voorwaarde" : "hl-rechtsgevolg";
    let searchFrom = 0;
    // Find all occurrences
    while (searchFrom < text.length) {
      const idx = text.indexOf(a.tekst_selectie, searchFrom);
      if (idx === -1) break;
      highlights.push({ start: idx, end: idx + a.tekst_selectie.length, className: cls });
      searchFrom = idx + 1;
    }
  }

  if (!highlights.length) return text;

  // Sort by start position, longer matches first for ties
  highlights.sort((a, b) => a.start - b.start || b.end - a.end);

  // Build non-overlapping segments
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const hl of highlights) {
    if (hl.start < cursor) continue; // skip overlaps
    if (hl.start > cursor) {
      parts.push(text.slice(cursor, hl.start));
    }
    parts.push(
      <mark key={`${hl.start}-${hl.end}`} className={hl.className}>
        {text.slice(hl.start, hl.end)}
      </mark>
    );
    cursor = hl.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

/** Unified result type for inline source search */
interface InlineSearchResult {
  uri: string;
  label: string;
  badge?: string;
  subtitle?: string;
}

/** ECLI search (immediate, every keystroke) or literature (placeholder) */
function useInlineSourceSearch(endpoint: "ecli" | "literature") {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InlineSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);

  const search = useCallback((q: string) => {
    setQuery(q);
    if (!q.trim()) { setResults([]); return; }

    if (endpoint === "ecli") {
      const seq = ++seqRef.current;
      setLoading(true);
      searchEcli(q.trim(), 8).then((data) => {
        if (seq !== seqRef.current) return;
        setResults(data.results.map((r) => ({
          uri: r.uri,
          label: r.ecli,
          badge: r.court || undefined,
          subtitle: [r.date, r.subject].filter(Boolean).join(" — ") || undefined,
        })));
      }).catch(() => {
        if (seq === seqRef.current) setResults([]);
      }).finally(() => {
        if (seq === seqRef.current) setLoading(false);
      });
    } else {
      setResults([]);
    }
  }, [endpoint]);

  function clear() { setQuery(""); setResults([]); }
  return { query, search, results, loading, clear };
}

/** Inline source search + chips used inside annotation edit mode */
function InlineSourceEditor({
  label,
  selected,
  onAdd,
  onRemove,
  endpoint,
}: {
  label: string;
  selected: AnnotationSource[];
  onAdd: (s: AnnotationSource) => void;
  onRemove: (uri: string) => void;
  endpoint: "ecli" | "literature";
}) {
  const { query, search, results, loading, clear } = useInlineSourceSearch(endpoint);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="annotation-detail">
      <span className="annotation-detail-label">{label}</span>
      <div className="source-search-wrapper" ref={wrapperRef}>
        <div className="source-search-input-row">
          <i className="fa-solid fa-magnifying-glass source-search-icon" />
          <input
            type="text"
            className="edit-input"
            placeholder={`Zoek ${label.toLowerCase()}...`}
            value={query}
            onChange={(e) => { search(e.target.value); setOpen(true); }}
            onFocus={() => { if (results.length > 0) setOpen(true); }}
          />
          {loading && <i className="fa-solid fa-spinner fa-spin source-search-spinner" />}
        </div>
        {open && results.length > 0 && (
          <div className="source-search-dropdown">
            {results.map((r) => {
              const already = selected.some((s) => s.uri === r.uri);
              return (
                <button
                  key={r.uri}
                  type="button"
                  className={`source-search-option ${already ? "disabled" : ""}`}
                  disabled={already}
                  onClick={() => {
                    onAdd({ uri: r.uri, label: r.label });
                    clear(); setOpen(false);
                  }}
                >
                  <span className="source-search-option-label">{r.label}</span>
                  {r.badge && <span className="type-badge">{r.badge}</span>}
                  {r.subtitle && <span className="source-search-option-subtitle">{r.subtitle}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="source-chips" style={{ marginTop: 6 }}>
          {selected.map((s) => (
            <span key={s.uri} className="source-chip">
              {s.label}
              <button
                type="button"
                className="source-chip-remove"
                onClick={() => onRemove(s.uri)}
                aria-label={`Verwijder ${s.label}`}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Collapsible annotation card with edit & delete support */
function AnnotationCard({
  annotation,
  onChanged,
  artikelText,
  leden,
}: {
  annotation: Annotation;
  onChanged: () => void;
  artikelText: string | null;
  leden: DocumentTreeNode[];
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit form state
  const [naam, setNaam] = useState(annotation.naam);
  const [tekstSelectie, setTekstSelectie] = useState(annotation.tekst_selectie ?? "");
  const [selectedLidUri, setSelectedLidUri] = useState(annotation.parent_uri ?? "");
  const [beschrijving, setBeschrijving] = useState(annotation.beschrijving ?? "");
  const [rechtsbronnen, setRechtsbronnen] = useState<AnnotationSource[]>(annotation.rechtsbronnen);
  const [rechtsliteratuur, setRechtsliteratuur] = useState<AnnotationSource[]>(annotation.rechtsliteratuur);

  const typeClass = annotation.type === "Voorwaarde" ? "annotation-voorwaarde" : "annotation-rechtsgevolg";

  function startEditing() {
    setNaam(annotation.naam);
    setTekstSelectie(annotation.tekst_selectie ?? "");
    setSelectedLidUri(annotation.parent_uri ?? "");
    setBeschrijving(annotation.beschrijving ?? "");
    setRechtsbronnen([...annotation.rechtsbronnen]);
    setRechtsliteratuur([...annotation.rechtsliteratuur]);
    setEditing(true);
    setError(null);
    setOpen(true);
  }

  function cancelEditing() {
    setEditing(false);
    setError(null);
    setConfirmDelete(false);
  }

  async function handleSave() {
    if (!naam.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await updateAnnotation(annotation.uri, {
        naam: naam.trim(),
        tekst_selectie: tekstSelectie.trim() || undefined,
        beschrijving: beschrijving.trim() || undefined,
        rechtsbronnen: rechtsbronnen.map((s) => s.uri),
        rechtsliteratuur: rechtsliteratuur.map((s) => s.uri),
      });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteAnnotation(annotation.uri);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verwijderen mislukt");
      setDeleting(false);
    }
  }

  return (
    <div className={`annotation-card ${typeClass}`}>
      <div
        className="annotation-card-header"
        onClick={() => { if (!editing) setOpen(!open); }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" && !editing) setOpen(!open); }}
      >
        <span className="annotation-card-label">
          {annotation.type}: {editing ? naam : annotation.naam}
        </span>
        <div className="annotation-header-actions">
          {open && !editing && !confirmDelete && (
            <>
              <button
                type="button"
                className="annotation-action-btn annotation-action-edit"
                title="Bewerken"
                onClick={(e) => { e.stopPropagation(); startEditing(); }}
              >
                <i className="fa-solid fa-pen" />
                <span>Bewerken</span>
              </button>
              <button
                type="button"
                className="annotation-action-btn annotation-action-delete"
                title="Verwijderen"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); setEditing(false); }}
              >
                <i className="fa-solid fa-trash" />
                <span>Verwijderen</span>
              </button>
            </>
          )}
          <i className={`fa-solid fa-chevron-down annotation-chevron ${open ? "" : "collapsed"}`} />
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="annotation-card-body annotation-confirm-delete">
          <p className="annotation-confirm-text">
            <i className="fa-solid fa-triangle-exclamation me-1" />
            Weet je zeker dat je deze {annotation.type.toLowerCase()} wilt verwijderen?
          </p>
          {error && <div className="edit-error"><i className="fa-solid fa-triangle-exclamation me-1" />{error}</div>}
          <div className="annotation-confirm-actions">
            <button
              type="button"
              className="edit-btn edit-btn-discard"
              onClick={() => { setConfirmDelete(false); setError(null); }}
              disabled={deleting}
            >
              Annuleren
            </button>
            <button
              type="button"
              className="edit-btn annotation-btn-confirm-delete"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting
                ? <><i className="fa-solid fa-spinner fa-spin me-1" />Verwijderen...</>
                : <><i className="fa-solid fa-trash me-1" />Verwijderen</>
              }
            </button>
          </div>
        </div>
      )}

      {/* Edit mode */}
      {open && editing && (
        <div className="annotation-card-body">
          {error && <div className="edit-error"><i className="fa-solid fa-triangle-exclamation me-1" />{error}</div>}

          <div className="annotation-detail">
            <span className="annotation-detail-label">Naam</span>
            <input
              type="text"
              className="edit-input"
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
            />
          </div>

          <TextSelectionField
            label="Tekst selectie"
            artikelText={artikelText}
            leden={leden}
            value={tekstSelectie}
            selectedLidUri={selectedLidUri}
            onSelect={(t) => setTekstSelectie(t)}
            onLidChange={(u) => { setSelectedLidUri(u); setTekstSelectie(""); }}
          />

          <div className="annotation-detail">
            <span className="annotation-detail-label">Beschrijving</span>
            <textarea
              className="edit-textarea"
              rows={3}
              value={beschrijving}
              onChange={(e) => setBeschrijving(e.target.value)}
              placeholder="Beschrijving..."
            />
          </div>

          <InlineSourceEditor
            label="Rechtsbronnen"
            endpoint="ecli"
            selected={rechtsbronnen}
            onAdd={(s) => setRechtsbronnen((prev) => [...prev, s])}
            onRemove={(uri) => setRechtsbronnen((prev) => prev.filter((x) => x.uri !== uri))}
          />

          <InlineSourceEditor
            label="Rechtsliteratuur"
            endpoint="literature"
            selected={rechtsliteratuur}
            onAdd={(s) => setRechtsliteratuur((prev) => [...prev, s])}
            onRemove={(uri) => setRechtsliteratuur((prev) => prev.filter((x) => x.uri !== uri))}
          />

          <div className="annotation-edit-actions">
            <button
              type="button"
              className="edit-btn edit-btn-discard"
              onClick={cancelEditing}
              disabled={saving}
            >
              <i className="fa-solid fa-xmark me-1" />
              Annuleren
            </button>
            <button
              type="button"
              className="edit-btn edit-btn-submit"
              onClick={handleSave}
              disabled={saving || !naam.trim()}
            >
              {saving
                ? <><i className="fa-solid fa-spinner fa-spin me-1" />Opslaan...</>
                : <><i className="fa-solid fa-check me-1" />Opslaan</>
              }
            </button>
          </div>

          <div className="annotation-meta">
            {annotation.creator} &middot; {annotation.created_at.split("T")[0]}
          </div>
        </div>
      )}

      {/* Read-only view */}
      {open && !editing && !confirmDelete && (
        <div className="annotation-card-body">
          {annotation.tekst_selectie && (
            <div className="annotation-detail">
              <span className="annotation-detail-label">Tekst selectie</span>
              <p className="annotation-detail-value">&ldquo;{annotation.tekst_selectie}&rdquo;</p>
            </div>
          )}
          {annotation.beschrijving && (
            <div className="annotation-detail">
              <span className="annotation-detail-label">Beschrijving</span>
              <p className="annotation-detail-value">{annotation.beschrijving}</p>
            </div>
          )}
          {annotation.rechtsbronnen.length > 0 && (
            <div className="annotation-detail">
              <span className="annotation-detail-label">Rechtsbronnen</span>
              <div className="source-chips">
                {annotation.rechtsbronnen.map((s) => (
                  <span key={s.uri} className="source-chip">{s.label}</span>
                ))}
              </div>
            </div>
          )}
          {annotation.rechtsliteratuur.length > 0 && (
            <div className="annotation-detail">
              <span className="annotation-detail-label">Rechtsliteratuur</span>
              <div className="source-chips">
                {annotation.rechtsliteratuur.map((s) => (
                  <span key={s.uri} className="source-chip">{s.label}</span>
                ))}
              </div>
            </div>
          )}
          <div className="annotation-meta">
            {annotation.creator} &middot; {annotation.created_at.split("T")[0]}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Extract relations from properties when the backend doesn't provide a
 * dedicated `relations` key. Falls back to URI as label.
 */
function extractRelationsFromProperties(
  properties: Record<string, string[]>
): Record<string, RelationGroup> {
  const relations: Record<string, RelationGroup> = {};
  for (const [predicate, values] of Object.entries(properties)) {
    const local = shortenUri(predicate);
    if (local.startsWith("active_") || local.startsWith("inactive_")) {
      const group: RelationGroup = {};
      for (const uri of values) {
        group[uri] = shortenUri(uri);
      }
      relations[local] = group;
    }
  }
  return relations;
}

interface SortedGroup {
  key: string;
  typeLabel: string;
  entries: { uri: string; label: string }[];
}

function getSortedGroups(
  relations: Record<string, RelationGroup>,
  prefix: "active" | "inactive"
): SortedGroup[] {
  const groups: SortedGroup[] = [];

  for (const type of RELATION_TYPE_PRIORITY) {
    const key = `${prefix}_${type}`;
    const group = relations[key];
    if (!group || Object.keys(group).length === 0) continue;

    groups.push({
      key,
      typeLabel: RELATION_TYPE_LABELS[type] ?? type,
      entries: Object.entries(group).map(([uri, label]) => ({ uri, label })),
    });
  }

  // Catch any types not in the priority list
  for (const [key, group] of Object.entries(relations)) {
    if (!key.startsWith(`${prefix}_`)) continue;
    const type = key.slice(prefix.length + 1);
    if (RELATION_TYPE_PRIORITY.includes(type)) continue;
    if (Object.keys(group).length === 0) continue;

    groups.push({
      key,
      typeLabel: RELATION_TYPE_LABELS[type] ?? type,
      entries: Object.entries(group).map(([uri, label]) => ({ uri, label })),
    });
  }

  return groups;
}

export default function NodeView({ initialNodeId, isUri, onClose, editMode }: NodeViewProps) {
  const [data, setData] = useState<NodeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [currentId, setCurrentId] = useState(initialNodeId);
  const [currentIsUri, setCurrentIsUri] = useState(isUri);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const loadNode = useCallback(async (nodeId: string, nodeIsUri: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const params = nodeIsUri ? { uri: nodeId } : { name: nodeId };
      const result = await fetchNode(params);

      // For document-type nodes without a tree, re-fetch with tree=true
      // and merge annotations/linked_cases from the original response
      if (!result.document_tree && nodeIsUri && !isTaxonomyNode(result.properties)) {
        const treeResult = await fetchNode({ uri: nodeId, tree: true });
        // The non-tree response has the complete flat annotations list
        // (including child leden annotations). Always prefer it.
        setData({
          ...treeResult,
          annotations: result.annotations ?? treeResult.annotations ?? [],
          linked_cases: result.linked_cases ?? treeResult.linked_cases ?? [],
        });
      } else {
        setData(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load node");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNode(currentId, currentIsUri);
  }, [currentId, currentIsUri, loadNode]);

  /** Re-fetch current node without loading spinner (for after annotation creation) */
  const reloadNode = useCallback(() => {
    loadNode(currentId, currentIsUri);
  }, [currentId, currentIsUri, loadNode]);

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleChildClick(uri: string) {
    setHistory((prev) => [...prev, { nodeId: currentId, isUri: currentIsUri }]);
    setCurrentId(uri);
    setCurrentIsUri(true);
  }

  function handleBack() {
    if (history.length === 0) {
      onClose();
      return;
    }
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setCurrentId(prev.nodeId);
    setCurrentIsUri(prev.isUri);
  }

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <span className="loading-text">Loading node...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger d-flex align-items-center gap-2">
        <i className="fa-solid fa-triangle-exclamation" />
        {error}
        <button className="btn-back ms-auto" onClick={handleBack}>
          <i className="fa-solid fa-arrow-left" />
          Back
        </button>
      </div>
    );
  }

  if (!data) return null;

  const isTaxonomy = isTaxonomyNode(data.properties);
  const isArtikel = isArtikelSchema(data.properties);
  const isUitspraak = isUitspraakSchema(data.properties);
  const uitspraakText = isUitspraak
    ? Object.entries(data.properties).find(([p]) => shortenUri(p) === "uitspraak")?.[1]?.[0] ?? null
    : null;
  const inhoudsindicatieText = isUitspraak
    ? Object.entries(data.properties).find(([p]) => shortenUri(p) === "inhoudsindicatie")?.[1]?.[0] ?? null
    : null;
  const isLid = isLidSchema(data.properties);

  // Build set of properties rendered in dedicated panels — hide from generic table
  const hiddenPanelProps = new Set<string>();
  if (isUitspraak) { hiddenPanelProps.add("uitspraak"); hiddenPanelProps.add("inhoudsindicatie"); }
  if (isLid || isArtikel) { hiddenPanelProps.add("textContent"); }

  // Filter relation predicates and panel properties out of the properties table
  const displayProperties = Object.entries(data.properties).filter(
    ([predicate]) => !isHiddenPredicate(predicate, hiddenPanelProps)
  );

  // Use backend `relations` if available, otherwise extract from properties
  const relations =
    data.relations && Object.keys(data.relations).length > 0
      ? data.relations
      : extractRelationsFromProperties(data.properties);

  const activeGroups = getSortedGroups(relations, "active");
  const inactiveGroups = getSortedGroups(relations, "inactive");
  const hasRelations = activeGroups.length > 0 || inactiveGroups.length > 0;

  return (
    <div className="node-view">
      <button className="btn-back mb-3" onClick={handleBack}>
        <i className="fa-solid fa-arrow-left" />
        Back
      </button>

      {(() => {
        const citeertitel = data.properties["https://legal-ontology.org/schema#citeertitel"]?.[0];
        const nodeName = shortenUri(data.uri);
        if (citeertitel) {
          return (
            <div className="mb-4">
              <h4 className="node-title">{citeertitel}</h4>
              <span className="node-subtitle">{nodeName}</span>
            </div>
          );
        }
        return <h5 className="node-title mb-4">{nodeName}</h5>;
      })()}

      {/* Properties table (without relation predicates) */}
      {displayProperties.length > 0 && (
        <>
          <div className="section-heading">
            <i className="fa-solid fa-list me-2" />
            Properties
          </div>
          <div className="properties-card">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th style={{ width: "35%" }}>Property</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {displayProperties.map(([predicate, values]) => (
                  <tr key={predicate}>
                    <td className="node-property-key" title={predicate}>
                      {shortenUri(predicate)}
                    </td>
                    <td className="node-property-value">
                      {values.map((v, i) => (
                        <div key={i}>{v}</div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Beschrijving toevoegen/wijzigen (edit mode only) */}
      {editMode && (() => {
        const existingBeschrijving = Object.entries(data.properties)
          .find(([p]) => shortenUri(p) === "beschrijving")?.[1]?.[0] ?? null;
        return (
          <BeschrijvingPanel
            nodeUri={data.uri}
            existingBeschrijving={existingBeschrijving}
            onSaved={reloadNode}
          />
        );
      })()}

      {/* Inhoudsindicatie view */}
      {isUitspraak && inhoudsindicatieText && (
        <div className="uitspraak-view">
          <h4 className="uitspraak-title">Inhoudsindicatie</h4>
          <div className="uitspraak-panel">{inhoudsindicatieText}</div>
        </div>
      )}

      {/* Uitspraak view */}
      {isUitspraak && uitspraakText && (
        <div className="uitspraak-view">
          <h4 className="uitspraak-title">Uitspraak</h4>
          <div className="uitspraak-panel">{uitspraakText}</div>
        </div>
      )}

      {/* Artikel view: header + text + leden with per-node annotations + edit panels */}
      {data.document_tree && !isTaxonomy && isArtikel && (() => {
        const artikelText = data.textContent
          ?? data.document_tree.textContent
          ?? Object.entries(data.properties).find(([p]) => shortenUri(p) === "textContent")?.[1]?.[0]
          ?? null;
        const leden = data.document_tree.children.filter((c) => c.type === "lid");
        const nonLidChildren = data.document_tree.children.filter((c) => c.type !== "lid");
        const allAnnotations = data.annotations ?? [];
        const artikelAnnotations = allAnnotations.filter((a) => a.parent_uri === data.uri);
        const artikelUri = data.uri;

        return (
          <div className="artikel-view">
            <h4 className="artikel-title">
              {Object.entries(data.properties).find(([p]) => shortenUri(p) === "label")?.[1]?.[0]
                ?? shortenUri(data.uri)}
            </h4>
            {/* Artikel text + leden in a single panel (matching DocumentTree look) */}
            <div className="document-tree">
              <div className="doc-tree-container">
                {artikelText && (
                  <div className="doc-node doc-depth-0 doc-type-artikel">
                    <div className="doc-text-content">
                      {highlightAnnotations(artikelText, artikelAnnotations)}
                    </div>
                  </div>
                )}
                {leden.map((lid) => {
                  const lidAnnotations = allAnnotations.filter((a) => a.parent_uri === lid.uri);
                  const lidHeading = [lid.label, lid.titel].filter(Boolean).join(" — ") || shortenUri(lid.uri);
                  return (
                    <div key={lid.uri} className="doc-node doc-depth-1 doc-type-lid">
                      <div className="doc-lid-inline">
                        <span
                          className="doc-lid-label doc-lid-label-clickable"
                          onClick={() => handleChildClick(lid.uri)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === "Enter") handleChildClick(lid.uri); }}
                        >
                          {lidHeading}
                        </span>
                        {lid.textContent && (
                          <span className="doc-lid-text">
                            {highlightAnnotations(lid.textContent, lidAnnotations)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {nonLidChildren.map((child) => {
                  const heading = [child.label, child.titel].filter(Boolean).join(" — ") || shortenUri(child.uri);
                  return (
                    <div key={child.uri} className="doc-node doc-depth-1">
                      <div
                        className="doc-node-header"
                        onClick={() => handleChildClick(child.uri)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter") handleChildClick(child.uri); }}
                      >
                        <span className="doc-node-label">{heading}</span>
                      </div>
                      {child.textContent && (
                        <div className="doc-text-content">{child.textContent}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* All annotations below the panel */}
            {allAnnotations.length > 0 && (
              <div className="annotations-section">
                {allAnnotations.map((a) => (
                  <AnnotationCard key={a.uri} annotation={a} onChanged={reloadNode} artikelText={artikelText} leden={leden} />
                ))}
              </div>
            )}
            {editMode && (
              <ArtikelEditPanels
                parentUri={artikelUri}
                artikelText={artikelText}
                leden={leden}
                onAnnotationCreated={reloadNode}
              />
            )}
          </div>
        );
      })()}

      {/* Lid view: label + text content + annotations + edit panels */}
      {isLid && (() => {
        const lidText = data.textContent
          ?? data.document_tree?.textContent
          ?? Object.entries(data.properties).find(([p]) => shortenUri(p) === "textContent")?.[1]?.[0]
          ?? null;
        const lidLabel = Object.entries(data.properties).find(([p]) => shortenUri(p) === "label")?.[1]?.[0]
          ?? shortenUri(data.uri);
        const annotations = data.annotations ?? [];
        return (
          <div className="artikel-view">
            <h4 className="artikel-title">{lidLabel}</h4>
            {lidText && (
              <div className="uitspraak-panel">
                {highlightAnnotations(lidText, annotations)}
              </div>
            )}
            {annotations.length > 0 && (
              <div className="annotations-section">
                {annotations.map((a) => (
                  <AnnotationCard key={a.uri} annotation={a} onChanged={reloadNode} artikelText={lidText} leden={[]} />
                ))}
              </div>
            )}
            {editMode && (
              <ArtikelEditPanels
                parentUri={data.uri}
                artikelText={lidText}
                leden={[]}
                onAnnotationCreated={reloadNode}
              />
            )}
          </div>
        );
      })()}

      {/* Document Tree (for legal documents, not taxonomy, artikel, uitspraak, or lid nodes) */}
      {data.document_tree && !isTaxonomy && !isArtikel && !isUitspraak && !isLid && (
        <DocumentTree tree={data.document_tree} onNodeClick={handleChildClick} />
      )}

      {/* Linked case law */}
      {data.linked_cases && data.linked_cases.length > 0 && (
        <>
          <hr className="linked-cases-divider" />
          <div className="section-heading">
            <i className="fa-solid fa-gavel me-2" />
            Rechtspraak ({data.linked_cases.length})
          </div>
          <div className="linked-cases-list">
            {data.linked_cases.map((c) => (
              <div
                key={c.uri}
                className="linked-case-card"
                onClick={() => handleChildClick(c.uri)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") handleChildClick(c.uri); }}
              >
                <div className="linked-case-header">
                  <span className="linked-case-ecli">{c.ecli}</span>
                  <span className="linked-case-date">{c.date}</span>
                </div>
                <div className="linked-case-meta">
                  <span className="linked-case-court">{c.court}</span>
                  {c.subject && (
                    <>
                      <span className="linked-case-sep">&middot;</span>
                      <span className="linked-case-subject">{c.subject}</span>
                    </>
                  )}
                </div>
                <i className="fa-solid fa-chevron-right linked-case-arrow" />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Children */}
      {data.children && data.children.length > 0 && (
        <>
          <div className="section-heading">
            <i className="fa-solid fa-diagram-project me-2" />
            Subdomeinen ({data.children.length})
          </div>
          <div className="row g-3">
            {data.children.map((child) => (
              <div key={child.uri} className="col-12 col-md-6">
                <div
                  className="child-card"
                  onClick={() => handleChildClick(child.uri)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleChildClick(child.uri);
                  }}
                >
                  <div className="d-flex justify-content-between align-items-center">
                    <div style={{ minWidth: 0 }}>
                      <strong>{child.label || child.titel || shortenUri(child.uri)}</strong>
                      {child.titel && child.label && (
                        <div className="child-subtitle">{child.titel}</div>
                      )}
                    </div>
                    <div className="d-flex align-items-center gap-2 ms-2 flex-shrink-0">
                      {child.type && (
                        <span className="type-badge">{shortenUri(child.type)}</span>
                      )}
                      <i className="fa-solid fa-chevron-right" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Relations: Active groups */}
      {activeGroups.length > 0 && (
        <div className="mt-4">
          {activeGroups.map((group) => {
            const collapsed = collapsedGroups.has(group.key);
            return (
              <div key={group.key}>
                <div
                  className="section-heading section-heading-collapsible"
                  onClick={() => toggleGroup(group.key)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") toggleGroup(group.key); }}
                >
                  <span>
                    <i className="fa-solid fa-scale-balanced me-2" />
                    {group.typeLabel} ({group.entries.length})
                  </span>
                  <i className={`fa-solid fa-chevron-down collapse-chevron ${collapsed ? "collapsed" : ""}`} />
                </div>
                {!collapsed && (
                  <div className="row g-3 mb-3">
                    {group.entries.map(({ uri, label }) => (
                      <div key={uri} className="col-12 col-md-6">
                        <div
                          className="child-card"
                          onClick={() => handleChildClick(uri)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleChildClick(uri);
                          }}
                        >
                          <div className="d-flex justify-content-between align-items-center">
                            <div style={{ minWidth: 0 }}>
                              <strong>{label}</strong>
                            </div>
                            <div className="d-flex align-items-center gap-2 ms-2 flex-shrink-0">
                              <i className="fa-solid fa-chevron-right" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Divider between active and inactive */}
      {activeGroups.length > 0 && inactiveGroups.length > 0 && (
        <hr className="relations-divider" />
      )}

      {/* Relations: Inactive groups */}
      {inactiveGroups.length > 0 && (
        <div className={activeGroups.length > 0 ? "" : "mt-4"}>
          {inactiveGroups.map((group) => {
            const collapsed = collapsedGroups.has(group.key);
            return (
              <div key={group.key}>
                <div
                  className="section-heading section-heading-inactive section-heading-collapsible"
                  onClick={() => toggleGroup(group.key)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") toggleGroup(group.key); }}
                >
                  <span>
                    <i className="fa-solid fa-scale-balanced me-2" />
                    {group.typeLabel} ({group.entries.length})
                    <span className="inactive-label">inactief</span>
                  </span>
                  <i className={`fa-solid fa-chevron-down collapse-chevron ${collapsed ? "collapsed" : ""}`} />
                </div>
                {!collapsed && (
                  <div className="row g-3 mb-3">
                    {group.entries.map(({ uri, label }) => (
                      <div key={uri} className="col-12 col-md-6">
                        <div
                          className="child-card child-card-inactive"
                          onClick={() => handleChildClick(uri)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleChildClick(uri);
                          }}
                        >
                          <div className="d-flex justify-content-between align-items-center">
                            <div style={{ minWidth: 0 }}>
                              <strong>{label}</strong>
                            </div>
                            <div className="d-flex align-items-center gap-2 ms-2 flex-shrink-0">
                              <i className="fa-solid fa-chevron-right" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {(!data.children || data.children.length === 0) && !data.document_tree && displayProperties.length === 0 && !hasRelations && (
        <p className="no-results">
          <i className="fa-regular fa-folder-open me-2" />
          This node has no properties or children.
        </p>
      )}
    </div>
  );
}
