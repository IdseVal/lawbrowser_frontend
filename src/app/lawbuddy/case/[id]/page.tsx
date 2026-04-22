"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Header from "@/components/Header";
import {
  fetchCaseDetail,
  fetchCaseFacts,
  fetchTimeline,
  fetchEvidence,
  fetchLegalFramework,
  fetchSummaryReport,
  fetchCaseSettings,
  fetchCaseTodos,
  CaseDetailResponse,
  CaseTodo,
  ChatMessage,
  TimelineEntry,
  EvidenceDoc,
  LegalFrameworkEntry,
} from "@/lib/api";

type TabKey =
  | "chat"
  | "samenvatting"
  | "tijdlijn"
  | "juridisch"
  | "bewijs"
  | "zaakgegevens"
  | "instellingen";

interface SidebarItem {
  key: TabKey;
  label: string;
  icon: string;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { key: "chat", label: "Chat", icon: "fa-comments" },
  { key: "samenvatting", label: "Samenvatting", icon: "fa-file-lines" },
  { key: "tijdlijn", label: "Tijdlijn", icon: "fa-timeline" },
  { key: "juridisch", label: "Juridisch Raamwerk", icon: "fa-gavel" },
  { key: "bewijs", label: "Bewijs/Documenten", icon: "fa-folder-open" },
  { key: "zaakgegevens", label: "Zaakgegevens", icon: "fa-clipboard-list" },
  { key: "instellingen", label: "Instellingen", icon: "fa-gear" },
];

export default function CaseDetailPage() {
  const params = useParams();
  const caseId = params.id as string;

  const [caseData, setCaseData] = useState<CaseDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("chat");

  // Sub-page data (loaded on demand)
  const [summaryReport, setSummaryReport] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [legalFramework, setLegalFramework] = useState<LegalFrameworkEntry[] | null>(null);
  const [evidence, setEvidence] = useState<EvidenceDoc[] | null>(null);
  const [caseFacts, setCaseFacts] = useState<Record<string, unknown> | null>(null);
  const [caseSettings, setCaseSettings] = useState<Record<string, unknown> | null>(null);
  const [caseTodos, setCaseTodos] = useState<CaseTodo[] | null>(null);
  const [tabLoading, setTabLoading] = useState(false);

  useEffect(() => {
    fetchCaseDetail(caseId)
      .then(setCaseData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [caseId]);

  const loadTabData = useCallback(
    async (tab: TabKey) => {
      setTabLoading(true);
      try {
        switch (tab) {
          case "samenvatting":
            if (!summaryReport) {
              const r = await fetchSummaryReport(caseId);
              setSummaryReport(r.summary_report);
            }
            break;
          case "tijdlijn":
            if (!timeline) {
              const r = await fetchTimeline(caseId);
              setTimeline(r.timeline.tijdlijn);
            }
            break;
          case "juridisch":
            if (!legalFramework) {
              const r = await fetchLegalFramework(caseId);
              setLegalFramework(r.legal_framework);
            }
            break;
          case "bewijs":
            if (!evidence) {
              const r = await fetchEvidence(caseId);
              setEvidence(r.evidence_docs);
            }
            break;
          case "zaakgegevens":
            if (!caseFacts) {
              const r = await fetchCaseFacts(caseId);
              setCaseFacts(r.case_facts);
            }
            break;
          case "instellingen":
            if (!caseSettings) {
              const r = await fetchCaseSettings(caseId);
              setCaseSettings(r.case_settings as unknown as Record<string, unknown>);
            }
            break;
        }
      } catch {
        /* errors shown inline */
      } finally {
        setTabLoading(false);
      }
    },
    [caseId, summaryReport, timeline, legalFramework, evidence, caseFacts, caseSettings]
  );

  // Load todos for sidebar
  useEffect(() => {
    fetchCaseTodos(caseId)
      .then((r) => setCaseTodos(r.todos))
      .catch(() => {});
  }, [caseId]);

  function handleTabClick(tab: TabKey) {
    setActiveTab(tab);
    if (tab !== "chat") {
      loadTabData(tab);
    }
  }

  if (loading || !caseData) {
    return (
      <>
        <Header />
        <div className="loading-container">
          <div className="loading-spinner" />
          <span className="loading-text">Zaak laden...</span>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="case-layout">
        {/* Sidebar */}
        <aside className="case-sidebar">
          <div className="case-sidebar-header">
            <a href="/lawbuddy" className="case-back-link">
              <i className="fa-solid fa-arrow-left me-2" />
              Terug
            </a>
            <div className="case-sidebar-title">{caseData.title}</div>
            <div className="case-sidebar-id">{caseData.id}</div>
          </div>

          <nav className="case-sidebar-nav">
            {SIDEBAR_ITEMS.map((item) => (
              <button
                key={item.key}
                className={`case-sidebar-btn ${activeTab === item.key ? "active" : ""}`}
                onClick={() => handleTabClick(item.key)}
              >
                <i className={`fa-solid ${item.icon}`} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Case todos */}
          {caseTodos && caseTodos.length > 0 && (
            <div className="case-sidebar-todos">
              <div className="case-sidebar-todos-title">To-do&apos;s</div>
              {caseTodos.map((todo) => (
                <div
                  key={todo.id}
                  className={`sidebar-todo ${todo.done ? "todo-done" : ""}`}
                >
                  <i className={`fa-${todo.done ? "solid fa-check-circle" : "regular fa-circle"} sidebar-todo-icon`} />
                  <div>
                    <div className="sidebar-todo-text">{todo.text}</div>
                    {todo.due_date && (
                      <div className="sidebar-todo-due">
                        <i className="fa-regular fa-calendar me-1" />
                        {todo.due_date}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="case-main">
          {tabLoading ? (
            <div className="loading-container">
              <div className="loading-spinner" />
            </div>
          ) : (
            <>
              {activeTab === "chat" && (
                <ChatPanel messages={caseData.chat_history} />
              )}
              {activeTab === "samenvatting" && (
                <SummaryPanel content={summaryReport} />
              )}
              {activeTab === "tijdlijn" && (
                <TimelinePanel entries={timeline} />
              )}
              {activeTab === "juridisch" && (
                <LegalFrameworkPanel entries={legalFramework} />
              )}
              {activeTab === "bewijs" && (
                <EvidencePanel docs={evidence} />
              )}
              {activeTab === "zaakgegevens" && (
                <CaseFactsPanel facts={caseFacts} />
              )}
              {activeTab === "instellingen" && (
                <SettingsPanel settings={caseSettings} />
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}

/* ---- Sub-page panels ---- */

function ChatPanel({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="panel-content">
      <h5 className="panel-title">Chat</h5>
      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-bubble chat-${msg.role}`}>
            <div className="chat-bubble-header">
              <i className={`fa-solid ${msg.role === "user" ? "fa-user" : "fa-robot"} me-2`} />
              <span className="chat-role">{msg.role === "user" ? "Jij" : "LawBuddy"}</span>
              <span className="chat-time">
                {new Date(msg.timestamp).toLocaleString("nl-NL", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className="chat-bubble-content">{msg.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryPanel({ content }: { content: string | null }) {
  if (!content) return <p className="text-muted p-4">Geen samenvatting beschikbaar.</p>;
  return (
    <div className="panel-content">
      <h5 className="panel-title">Samenvatting</h5>
      <div className="summary-content" dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }} />
    </div>
  );
}

function TimelinePanel({ entries }: { entries: TimelineEntry[] | null }) {
  if (!entries || entries.length === 0)
    return <p className="text-muted p-4">Geen tijdlijn beschikbaar.</p>;
  return (
    <div className="panel-content">
      <h5 className="panel-title">Tijdlijn</h5>
      <div className="timeline-list">
        {entries.map((e, i) => (
          <div key={i} className="timeline-entry">
            <div className="timeline-dot" />
            <div className="timeline-entry-content">
              <div className="timeline-date">
                {new Date(e.datum_tijd).toLocaleDateString("nl-NL", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
              <div className="timeline-title">{e.titel}</div>
              <div className="timeline-desc">{e.beschrijving}</div>
              {e.bewijs_referentie && (
                <div className="timeline-evidence">
                  <i className="fa-solid fa-paperclip me-1" />
                  {e.bewijs_referentie}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LegalFrameworkPanel({ entries }: { entries: LegalFrameworkEntry[] | null }) {
  if (!entries || entries.length === 0)
    return <p className="text-muted p-4">Geen juridisch raamwerk beschikbaar.</p>;
  return (
    <div className="panel-content">
      <h5 className="panel-title">Juridisch Raamwerk</h5>
      <div className="d-flex flex-column gap-3">
        {entries.map((e, i) => (
          <div key={i} className="legal-entry">
            <div className="legal-entry-title">{e.title}</div>
            <div className="legal-entry-relevance">{e.relevance}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EvidencePanel({ docs }: { docs: EvidenceDoc[] | null }) {
  if (!docs || docs.length === 0)
    return <p className="text-muted p-4">Geen documenten beschikbaar.</p>;
  return (
    <div className="panel-content">
      <h5 className="panel-title">Bewijs / Documenten</h5>
      <div className="d-flex flex-column gap-2">
        {docs.map((doc) => (
          <div key={doc.id} className="evidence-card">
            <div className="evidence-icon">
              <i className="fa-solid fa-file" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="evidence-name">{doc.display_name}</div>
              <div className="evidence-desc">{doc.description}</div>
              <div className="evidence-meta">
                <span className="evidence-type">{doc.type}</span>
                <span>{doc.upload_date}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CaseFactsPanel({ facts }: { facts: Record<string, unknown> | null }) {
  if (!facts) return <p className="text-muted p-4">Geen zaakgegevens beschikbaar.</p>;
  return (
    <div className="panel-content">
      <h5 className="panel-title">Zaakgegevens</h5>
      <div className="properties-card">
        <table className="table table-sm">
          <tbody>
            {renderFacts(facts, 0)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderFacts(obj: Record<string, unknown>, depth: number): React.ReactNode[] {
  const rows: React.ReactNode[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      rows.push(
        <tr key={key}>
          <td
            colSpan={2}
            className="node-property-key"
            style={{ paddingLeft: `${16 + depth * 20}px`, paddingTop: depth === 0 ? "14px" : "10px" }}
          >
            {formatKey(key)}
          </td>
        </tr>
      );
      rows.push(...renderFacts(value as Record<string, unknown>, depth + 1));
    } else {
      rows.push(
        <tr key={key}>
          <td className="node-property-key" style={{ paddingLeft: `${16 + depth * 20}px`, width: "40%" }}>
            {formatKey(key)}
          </td>
          <td className="node-property-value">{String(value ?? "—")}</td>
        </tr>
      );
    }
  }
  return rows;
}

function formatKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function SettingsPanel({ settings }: { settings: Record<string, unknown> | null }) {
  if (!settings) return <p className="text-muted p-4">Geen instellingen beschikbaar.</p>;
  return (
    <div className="panel-content">
      <h5 className="panel-title">Instellingen</h5>
      <div className="properties-card">
        <table className="table table-sm">
          <tbody>
            {Object.entries(settings).map(([key, value]) => (
              <tr key={key}>
                <td className="node-property-key" style={{ width: "40%" }}>{formatKey(key)}</td>
                <td className="node-property-value">
                  {Array.isArray(value) ? value.join(", ") : String(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Minimal markdown-to-HTML for the summary report */
function markdownToHtml(md: string): string {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h6>$1</h6>")
    .replace(/^## (.+)$/gm, "<h5>$1</h5>")
    .replace(/^# (.+)$/gm, "<h4>$1</h4>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*<\/li>)/g, "<ul>$1</ul>")
    .replace(/<\/ul>\s*<ul>/g, "")
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}
