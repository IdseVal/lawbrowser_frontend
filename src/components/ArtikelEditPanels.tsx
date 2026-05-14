"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { DocumentTreeNode, createAnnotation, setNodeBeschrijving, searchEcli } from "@/lib/api";

/** A selected source node (rechtsbron or literatuur) */
interface SelectedSource {
  uri: string;
  label: string;
}

/** Shared form state for Voorwaarde / Rechtsgevolg */
interface LegalFormData {
  naam: string;
  selectedText: string;
  selectedLidUri: string;
  beschrijving: string;
  rechtsbronnen: SelectedSource[];
  rechtsliteratuur: SelectedSource[];
}

const EMPTY_FORM: LegalFormData = {
  naam: "",
  selectedText: "",
  selectedLidUri: "",
  beschrijving: "",
  rechtsbronnen: [],
  rechtsliteratuur: [],
};

type PanelType = "voorwaarde" | "rechtsgevolg" | "rechtsformule" | "literatuur" | null;

interface ArtikelEditPanelsProps {
  parentUri: string;
  artikelText: string | null;
  leden: DocumentTreeNode[];
  onAnnotationCreated: () => void;
}

/** Unified result type for source search dropdowns */
interface SourceSearchResult {
  uri: string;
  label: string;
  badge?: string;
  subtitle?: string;
}

/** Search hook — ECLI (immediate, every keystroke) or literature (debounced placeholder) */
function useSourceSearch(endpoint: "ecli" | "literature") {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SourceSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  const search = useCallback((q: string) => {
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setResults([]); return; }

    if (endpoint === "ecli") {
      // Fire immediately on every keystroke
      const seq = ++seqRef.current;
      setLoading(true);
      searchEcli(q.trim(), 8).then((data) => {
        if (seq !== seqRef.current) return; // stale
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
      // Literature — debounced placeholder
      timerRef.current = setTimeout(async () => {
        setLoading(true);
        try { setResults([]); }
        catch { setResults([]); }
        finally { setLoading(false); }
      }, 300);
    }
  }, [endpoint]);

  function clear() { setQuery(""); setResults([]); }

  return { query, search, results, loading, clear };
}

function shortenUri(uri: string): string {
  if (uri.includes("#")) return uri.split("#").pop() ?? uri;
  if (uri.includes("/")) return uri.split("/").pop() ?? uri;
  return uri;
}

/** Inline search field that produces chips */
function SourceSearchField({
  label,
  selected,
  onAdd,
  onRemove,
  endpoint,
}: {
  label: string;
  selected: SelectedSource[];
  onAdd: (s: SelectedSource) => void;
  onRemove: (uri: string) => void;
  endpoint: "ecli" | "literature";
}) {
  const { query, search, results, loading, clear } = useSourceSearch(endpoint);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="edit-field">
      <label className="edit-label">{label}</label>
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
              const alreadySelected = selected.some((s) => s.uri === r.uri);
              return (
                <button
                  key={r.uri}
                  type="button"
                  className={`source-search-option ${alreadySelected ? "disabled" : ""}`}
                  disabled={alreadySelected}
                  onClick={() => {
                    onAdd({ uri: r.uri, label: r.label });
                    clear();
                    setOpen(false);
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
        <div className="source-chips">
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

/** Text selection field — shows article text and captures user highlights */
export function TextSelectionField({
  label,
  artikelText,
  leden,
  value,
  selectedLidUri,
  onSelect,
  onLidChange,
}: {
  label: string;
  artikelText: string | null;
  leden: DocumentTreeNode[];
  value: string;
  selectedLidUri: string;
  onSelect: (text: string) => void;
  onLidChange: (uri: string) => void;
}) {
  const hasLeden = leden.length > 0;
  const activeLid = leden.find((l) => l.uri === selectedLidUri);
  const displayText = hasLeden
    ? (activeLid?.textContent ?? null)
    : artikelText;

  function handleMouseUp() {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text) onSelect(text);
  }

  return (
    <div className="edit-field">
      <label className="edit-label">{label}</label>
      {value && (
        <div className="text-selection-preview">
          <span className="text-selection-quote">&ldquo;{value}&rdquo;</span>
          <button
            type="button"
            className="text-selection-clear"
            onClick={() => onSelect("")}
            aria-label="Wis selectie"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      )}
      {hasLeden && (
        <select
          className="edit-input edit-select"
          value={selectedLidUri}
          onChange={(e) => { onLidChange(e.target.value); onSelect(""); }}
        >
          <option value="">Selecteer een lid...</option>
          {leden.map((l) => (
            <option key={l.uri} value={l.uri}>
              {l.label ?? l.titel ?? shortenUri(l.uri)}
            </option>
          ))}
        </select>
      )}
      {displayText && (
        <div
          className="text-selection-area"
          onMouseUp={handleMouseUp}
          role="textbox"
          tabIndex={0}
        >
          {displayText}
        </div>
      )}
      {!displayText && hasLeden && !selectedLidUri && (
        <p className="text-selection-hint">Selecteer eerst een lid om de tekst te tonen.</p>
      )}
    </div>
  );
}

/** The full legal-concept form (shared by Voorwaarde & Rechtsgevolg) */
function LegalConceptForm({
  typeLabel,
  annotationType,
  parentUri,
  artikelText,
  leden,
  onSuccess,
  onDiscard,
}: {
  typeLabel: string;
  annotationType: "Voorwaarde" | "Rechtsgevolg";
  parentUri: string;
  artikelText: string | null;
  leden: DocumentTreeNode[];
  onSuccess: () => void;
  onDiscard: () => void;
}) {
  const [form, setForm] = useState<LegalFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(partial: Partial<LegalFormData>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  async function handleSubmit() {
    if (!form.naam.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await createAnnotation({
        parent_uri: form.selectedLidUri || parentUri,
        type: annotationType,
        naam: form.naam.trim(),
        creator: "LawBuddy",
        tekst_selectie: form.selectedText || undefined,
        beschrijving: form.beschrijving.trim() || undefined,
        rechtsbronnen: form.rechtsbronnen.length > 0 ? form.rechtsbronnen.map((s) => s.uri) : undefined,
        rechtsliteratuur: form.rechtsliteratuur.length > 0 ? form.rechtsliteratuur.map((s) => s.uri) : undefined,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="edit-panel">
      <h5 className="edit-panel-title">{typeLabel}</h5>

      {error && (
        <div className="edit-error">
          <i className="fa-solid fa-triangle-exclamation me-1" />
          {error}
        </div>
      )}

      <div className="edit-field">
        <label className="edit-label">{typeLabel} naam</label>
        <input
          type="text"
          className="edit-input"
          placeholder={`Naam van de ${typeLabel.toLowerCase()}...`}
          value={form.naam}
          onChange={(e) => patch({ naam: e.target.value })}
        />
      </div>

      <TextSelectionField
        label={`${typeLabel} in de tekst`}
        artikelText={artikelText}
        leden={leden}
        value={form.selectedText}
        selectedLidUri={form.selectedLidUri}
        onSelect={(t) => patch({ selectedText: t })}
        onLidChange={(u) => patch({ selectedLidUri: u })}
      />

      <div className="edit-field">
        <label className="edit-label">Beschrijving</label>
        <textarea
          className="edit-textarea"
          rows={3}
          placeholder="Beschrijving..."
          value={form.beschrijving}
          onChange={(e) => patch({ beschrijving: e.target.value })}
        />
      </div>

      <SourceSearchField
        label="Rechtsbronnen"
        endpoint="ecli"
        selected={form.rechtsbronnen}
        onAdd={(s) => patch({ rechtsbronnen: [...form.rechtsbronnen, s] })}
        onRemove={(uri) => patch({ rechtsbronnen: form.rechtsbronnen.filter((x) => x.uri !== uri) })}
      />

      <SourceSearchField
        label="Rechtsliteratuur"
        endpoint="literature"
        selected={form.rechtsliteratuur}
        onAdd={(s) => patch({ rechtsliteratuur: [...form.rechtsliteratuur, s] })}
        onRemove={(uri) => patch({ rechtsliteratuur: form.rechtsliteratuur.filter((x) => x.uri !== uri) })}
      />

      <div className="edit-panel-actions">
        <button
          type="button"
          className="edit-btn edit-btn-discard"
          onClick={onDiscard}
          disabled={submitting}
        >
          <i className="fa-solid fa-xmark me-1" />
          Annuleren
        </button>
        <button
          type="button"
          className="edit-btn edit-btn-submit"
          onClick={handleSubmit}
          disabled={submitting || !form.naam.trim()}
        >
          {submitting
            ? <><i className="fa-solid fa-spinner fa-spin me-1" />Opslaan...</>
            : <><i className="fa-solid fa-check me-1" />Opslaan</>
          }
        </button>
      </div>
    </div>
  );
}

export default function ArtikelEditPanels({ parentUri, artikelText, leden, onAnnotationCreated }: ArtikelEditPanelsProps) {
  const [activePanel, setActivePanel] = useState<PanelType>(null);

  function handleSuccess() {
    setActivePanel(null);
    onAnnotationCreated();
  }

  function handleDiscard() {
    setActivePanel(null);
  }

  if (activePanel === "voorwaarde") {
    return (
      <div className="edit-panels-container edit-panel-enter">
        <LegalConceptForm
          typeLabel="Voorwaarde"
          annotationType="Voorwaarde"
          parentUri={parentUri}
          artikelText={artikelText}
          leden={leden}
          onSuccess={handleSuccess}
          onDiscard={handleDiscard}
        />
      </div>
    );
  }

  if (activePanel === "rechtsgevolg") {
    return (
      <div className="edit-panels-container edit-panel-enter">
        <LegalConceptForm
          typeLabel="Rechtsgevolg"
          annotationType="Rechtsgevolg"
          parentUri={parentUri}
          artikelText={artikelText}
          leden={leden}
          onSuccess={handleSuccess}
          onDiscard={handleDiscard}
        />
      </div>
    );
  }

  if (activePanel === "rechtsformule") {
    return (
      <div className="edit-panels-container edit-panel-enter">
        <div className="edit-panel">
          <h5 className="edit-panel-title">Rechtsformule</h5>
          <p className="edit-placeholder-text">
            Rechtsformule invoer wordt binnenkort beschikbaar.
          </p>
          <div className="edit-panel-actions">
            <button
              type="button"
              className="edit-btn edit-btn-discard"
              onClick={handleDiscard}
            >
              <i className="fa-solid fa-xmark me-1" />
              Annuleren
            </button>
            <button
              type="button"
              className="edit-btn edit-btn-submit"
              disabled
            >
              <i className="fa-solid fa-check me-1" />
              Opslaan
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activePanel === "literatuur") {
    return (
      <div className="edit-panels-container edit-panel-enter">
        <div className="edit-panel">
          <h5 className="edit-panel-title">Rechtsliteratuur schrijven</h5>
          <p className="edit-placeholder-text">
            Rechtsliteratuur invoer wordt binnenkort beschikbaar.
          </p>
          <div className="edit-panel-actions">
            <button
              type="button"
              className="edit-btn edit-btn-discard"
              onClick={handleDiscard}
            >
              <i className="fa-solid fa-xmark me-1" />
              Annuleren
            </button>
            <button
              type="button"
              className="edit-btn edit-btn-submit"
              disabled
            >
              <i className="fa-solid fa-check me-1" />
              Opslaan
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="edit-panels-container edit-panel-enter">
      <div className="edit-buttons-row">
        <button
          type="button"
          className="edit-btn edit-btn-voorwaarde"
          onClick={() => setActivePanel("voorwaarde")}
        >
          <i className="fa-solid fa-plus me-1" />
          Voorwaarde toevoegen
        </button>
        <button
          type="button"
          className="edit-btn edit-btn-rechtsgevolg"
          onClick={() => setActivePanel("rechtsgevolg")}
        >
          <i className="fa-solid fa-plus me-1" />
          Rechtsgevolg toevoegen
        </button>
        <button
          type="button"
          className="edit-btn edit-btn-rechtsformule"
          onClick={() => setActivePanel("rechtsformule")}
        >
          <i className="fa-solid fa-plus me-1" />
          Rechtsformule toevoegen
        </button>
        <button
          type="button"
          className="edit-btn edit-btn-literatuur"
          onClick={() => setActivePanel("literatuur")}
        >
          <i className="fa-solid fa-plus me-1" />
          Rechtsliteratuur schrijven
        </button>
      </div>
    </div>
  );
}

/** Standalone description-add/edit panel (below properties table) */
export function BeschrijvingPanel({
  nodeUri,
  existingBeschrijving,
  onSaved,
}: {
  nodeUri: string;
  existingBeschrijving: string | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(existingBeschrijving ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasExisting = !!existingBeschrijving;

  function handleOpen() {
    setValue(existingBeschrijving ?? "");
    setError(null);
    setOpen(true);
  }

  async function handleSubmit() {
    if (!value.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await setNodeBeschrijving(nodeUri, value.trim());
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Opslaan mislukt");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="edit-btn edit-btn-beschrijving"
        onClick={handleOpen}
      >
        <i className={`fa-solid ${hasExisting ? "fa-pen" : "fa-plus"} me-1`} />
        {hasExisting ? "Beschrijving wijzigen" : "Beschrijving toevoegen"}
      </button>
    );
  }

  return (
    <div className="edit-panel edit-panel-enter">
      <h5 className="edit-panel-title">
        {hasExisting ? "Beschrijving wijzigen" : "Beschrijving toevoegen"}
      </h5>
      {error && (
        <div className="edit-error">
          <i className="fa-solid fa-triangle-exclamation me-1" />
          {error}
        </div>
      )}
      <div className="edit-field">
        <textarea
          className="edit-textarea"
          rows={4}
          placeholder="Voeg een beschrijving toe..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <div className="edit-panel-actions">
        <button
          type="button"
          className="edit-btn edit-btn-discard"
          onClick={() => { setOpen(false); setError(null); }}
          disabled={submitting}
        >
          <i className="fa-solid fa-xmark me-1" />
          Annuleren
        </button>
        <button
          type="button"
          className="edit-btn edit-btn-submit"
          onClick={handleSubmit}
          disabled={submitting || !value.trim()}
        >
          {submitting
            ? <><i className="fa-solid fa-spinner fa-spin me-1" />Opslaan...</>
            : <><i className="fa-solid fa-check me-1" />Opslaan</>
          }
        </button>
      </div>
    </div>
  );
}
