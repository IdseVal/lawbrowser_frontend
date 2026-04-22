"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import {
  fetchCases,
  createCase,
  deleteCase,
  CaseSummary,
  CaseTodo,
  patchCase,
  addTag,
  removeTag,
} from "@/lib/api";

type OverlayType = "edit" | "tags" | "create" | null;

export default function LawBuddyPage() {
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [todos, setTodos] = useState<CaseTodo[]>([]);
  const [loading, setLoading] = useState(true);

  // Dropdown state
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  // Overlay state
  const [overlay, setOverlay] = useState<{ type: OverlayType; caseId: string } | null>(null);

  useEffect(() => {
    fetchCases()
      .then((data) => {
        setCases(data.cases);
        setTodos(data.todos);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!openMenu) return;
    function handleClick() {
      setOpenMenu(null);
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [openMenu]);

  function updateCase(id: string, updates: Partial<CaseSummary>) {
    setCases((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  }

  async function handleArchiveToggle(c: CaseSummary) {
    const newArchived = !c.archived;
    try {
      await patchCase(c.id, { archived: newArchived });
      updateCase(c.id, { archived: newArchived });
    } catch {
      /* silent */
    }
    setOpenMenu(null);
  }

  async function handleDelete(c: CaseSummary) {
    try {
      await deleteCase(c.id);
      setCases((prev) => prev.filter((x) => x.id !== c.id));
    } catch {
      /* silent */
    }
    setOpenMenu(null);
  }

  const activeCases = cases.filter((c) => !c.archived);
  const archivedCases = cases.filter((c) => c.archived);
  const overlayCase = overlay ? cases.find((c) => c.id === overlay.caseId) : null;

  function renderCaseCard(c: CaseSummary) {
    return (
      <div key={c.id} className="case-card-wrapper">
        <Link href={`/lawbuddy/case/${c.id}`} className="case-card">
          <div className="d-flex justify-content-between align-items-start">
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="case-card-title">
                {c.archived && (
                  <i
                    className="fa-solid fa-box-archive case-archived-icon"
                    title="Gearchiveerd"
                  />
                )}
                {c.title}
              </div>
              <div className="case-card-meta">
                <span>{c.id}</span>
                <span className="mx-2">·</span>
                <span>{c.date}</span>
              </div>
              <div className="case-card-summary">{c.summary}</div>
            </div>
          </div>
          {c.tags.length > 0 && (
            <div className="case-card-tags">
              {c.tags.map((t) => (
                <span key={t} className="case-tag">{t}</span>
              ))}
            </div>
          )}
        </Link>

        <div className="case-menu-container">
          <button
            className="case-menu-btn"
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenu(openMenu === c.id ? null : c.id);
            }}
            aria-label="Opties"
          >
            <i className="fa-solid fa-ellipsis-vertical" />
          </button>

          {openMenu === c.id && (
            <div className="case-dropdown" onClick={(e) => e.stopPropagation()}>
              <button
                className="case-dropdown-item"
                onClick={() => {
                  setOverlay({ type: "edit", caseId: c.id });
                  setOpenMenu(null);
                }}
              >
                <i className="fa-solid fa-pen me-2" />
                Titel of beschrijving bewerken
              </button>
              <button
                className="case-dropdown-item"
                onClick={() => {
                  setOverlay({ type: "tags", caseId: c.id });
                  setOpenMenu(null);
                }}
              >
                <i className="fa-solid fa-tags me-2" />
                Tags bewerken
              </button>
              <div className="case-dropdown-divider" />
              <button
                className="case-dropdown-item"
                onClick={() => handleArchiveToggle(c)}
              >
                <i className={`fa-solid ${c.archived ? "fa-box-open" : "fa-box-archive"} me-2`} />
                {c.archived ? "Dearchiveren" : "Archiveren"}
              </button>
              <div className="case-dropdown-divider" />
              <button
                className="case-dropdown-item case-dropdown-item-danger"
                onClick={() => handleDelete(c)}
              >
                <i className="fa-solid fa-trash me-2" />
                Zaak verwijderen
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <Header />
      <main className="lb-overview-main">
        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner" />
            <span className="loading-text">Zaken laden...</span>
          </div>
        ) : (
          <div className="lb-overview-grid">
            <div className="lb-cases-section">
              <div className="d-flex justify-content-between align-items-center mb-4">
                <h3 className="lb-section-title mb-0">Zaken</h3>
                <button
                  className="btn-add-case"
                  title="Nieuwe zaak"
                  onClick={() => setOverlay({ type: "create", caseId: "" })}
                >
                  <i className="fa-solid fa-plus" />
                </button>
              </div>

              {cases.length === 0 && (
                <p className="text-muted">Geen zaken gevonden.</p>
              )}

              <div className="cases-grid">
                {activeCases.map((c) => renderCaseCard(c))}
              </div>

              {archivedCases.length > 0 && (
                <>
                  <div className="cases-archive-divider" />
                  <div className="cases-grid cases-grid-archived">
                    {archivedCases.map((c) => renderCaseCard(c))}
                  </div>
                </>
              )}
            </div>

            <div className="lb-todos-section">
              <h3 className="lb-section-title mb-4">To-do&apos;s</h3>

              {todos.length === 0 && (
                <p className="text-muted">Geen openstaande to-do&apos;s.</p>
              )}

              <div className="d-flex flex-column gap-2">
                {todos.map((todo) => (
                  <div
                    key={todo.id}
                    className={`todo-card ${todo.done ? "todo-done" : ""}`}
                  >
                    <div className="todo-checkbox">
                      <i className={`fa-${todo.done ? "solid fa-check-circle" : "regular fa-circle"}`} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="todo-text">{todo.text}</div>
                      <div className="todo-meta">
                        {todo.case_title && (
                          <span className="todo-case-ref">{todo.case_title}</span>
                        )}
                        {todo.due_date && (
                          <span className="todo-due">
                            <i className="fa-regular fa-calendar me-1" />
                            {todo.due_date}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Overlays */}
      {overlay?.type === "create" && (
        <CreateOverlay
          onClose={() => setOverlay(null)}
          onCreate={(newCase) => {
            setCases((prev) => [newCase, ...prev]);
            setOverlay(null);
          }}
        />
      )}
      {overlay?.type === "edit" && overlayCase && (
        <EditOverlay
          caseData={overlayCase}
          onClose={() => setOverlay(null)}
          onSave={(title, summary) => {
            updateCase(overlayCase.id, { title, summary });
            setOverlay(null);
          }}
        />
      )}
      {overlay?.type === "tags" && overlayCase && (
        <TagsOverlay
          caseData={overlayCase}
          onClose={() => setOverlay(null)}
          onUpdate={(tags) => updateCase(overlayCase.id, { tags })}
        />
      )}
    </>
  );
}

/* ---- Edit Overlay ---- */

function EditOverlay({
  caseData,
  onClose,
  onSave,
}: {
  caseData: CaseSummary;
  onClose: () => void;
  onSave: (title: string, summary: string) => void;
}) {
  const [title, setTitle] = useState(caseData.title);
  const [summary, setSummary] = useState(caseData.summary);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await patchCase(caseData.id, { title, summary });
      onSave(title, summary);
    } catch {
      /* silent */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="overlay-panel" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-header">
          <h5 className="overlay-title">Titel of beschrijving bewerken</h5>
          <button className="overlay-close" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="overlay-body">
          <label className="overlay-label">Titel</label>
          <input
            type="text"
            className="overlay-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="overlay-label mt-3">Beschrijving</label>
          <textarea
            className="overlay-textarea"
            rows={4}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>
        <div className="overlay-footer">
          <button className="overlay-btn-secondary" onClick={onClose}>
            Annuleren
          </button>
          <button className="overlay-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Opslaan..." : "Opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Tags Overlay ---- */

function TagsOverlay({
  caseData,
  onClose,
  onUpdate,
}: {
  caseData: CaseSummary;
  onClose: () => void;
  onUpdate: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState<string[]>(caseData.tags);
  const [newTag, setNewTag] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = useCallback(async () => {
    const trimmed = newTag.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed)) return;
    setBusy(true);
    try {
      const res = await addTag(caseData.id, trimmed);
      setTags(res.tags);
      onUpdate(res.tags);
      setNewTag("");
      inputRef.current?.focus();
    } catch {
      /* silent */
    } finally {
      setBusy(false);
    }
  }, [newTag, tags, caseData.id, onUpdate]);

  async function handleRemove(tag: string) {
    setBusy(true);
    try {
      const res = await removeTag(caseData.id, tag);
      setTags(res.tags);
      onUpdate(res.tags);
    } catch {
      /* silent */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="overlay-panel" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-header">
          <h5 className="overlay-title">Tags bewerken</h5>
          <button className="overlay-close" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="overlay-body">
          <div className="tags-list">
            {tags.map((t) => (
              <span key={t} className="tag-editable">
                {t}
                <button
                  className="tag-remove-btn"
                  onClick={() => handleRemove(t)}
                  disabled={busy}
                  aria-label={`Verwijder ${t}`}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </span>
            ))}
            {tags.length === 0 && (
              <span className="text-muted" style={{ fontSize: "0.85rem" }}>
                Geen tags
              </span>
            )}
          </div>
          <div className="tag-add-row mt-3">
            <input
              ref={inputRef}
              type="text"
              className="overlay-input"
              placeholder="Nieuwe tag..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
            <button
              className="overlay-btn-primary"
              onClick={handleAdd}
              disabled={busy || !newTag.trim()}
            >
              <i className="fa-solid fa-plus me-1" />
              Toevoegen
            </button>
          </div>
        </div>
        <div className="overlay-footer">
          <button className="overlay-btn-secondary" onClick={onClose}>
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- Create Overlay ---- */

function CreateOverlay({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (newCase: CaseSummary) => void;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  function handleAddTag() {
    const trimmed = newTag.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags((prev) => [...prev, trimmed]);
    setNewTag("");
    tagInputRef.current?.focus();
  }

  function handleRemoveTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const created = await createCase({
        title: title.trim(),
        summary: summary.trim(),
        tags,
      });
      onCreate(created);
    } catch {
      /* silent */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="overlay-panel" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-header">
          <h5 className="overlay-title">Nieuwe zaak aanmaken</h5>
          <button className="overlay-close" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="overlay-body">
          <label className="overlay-label">Titel</label>
          <input
            type="text"
            className="overlay-input"
            placeholder="Naam van de zaak..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <label className="overlay-label mt-3">Beschrijving</label>
          <textarea
            className="overlay-textarea"
            rows={3}
            placeholder="Korte omschrijving..."
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />

          <label className="overlay-label mt-3">Tags</label>
          <div className="tags-list mb-2">
            {tags.map((t) => (
              <span key={t} className="tag-editable">
                {t}
                <button
                  className="tag-remove-btn"
                  onClick={() => handleRemoveTag(t)}
                  aria-label={`Verwijder ${t}`}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </span>
            ))}
            {tags.length === 0 && (
              <span className="text-muted" style={{ fontSize: "0.85rem" }}>
                Nog geen tags
              </span>
            )}
          </div>
          <div className="tag-add-row">
            <input
              ref={tagInputRef}
              type="text"
              className="overlay-input"
              placeholder="Nieuwe tag..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
            />
            <button
              className="overlay-btn-primary"
              onClick={handleAddTag}
              disabled={!newTag.trim()}
              type="button"
            >
              <i className="fa-solid fa-plus me-1" />
              Tag
            </button>
          </div>
        </div>
        <div className="overlay-footer">
          <button className="overlay-btn-secondary" onClick={onClose}>
            Annuleren
          </button>
          <button
            className="overlay-btn-primary"
            onClick={handleCreate}
            disabled={saving || !title.trim()}
          >
            {saving ? "Aanmaken..." : "Zaak aanmaken"}
          </button>
        </div>
      </div>
    </div>
  );
}
