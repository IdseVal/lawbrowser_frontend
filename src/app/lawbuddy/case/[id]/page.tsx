"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  fetchIntakeChecklist,
  triggerAnalyze,
  fetchPipelineStatus,
  CaseDetailResponse,
  CaseTodo,
  ChatMessage,
  TimelineEntry,
  EvidenceDoc,
  LegalFrameworkEntry,
  PipelineStatusResponse,
} from "@/lib/api";
import type { TabKey } from "./_components/types";
import ChatPanel from "./_components/ChatPanel";
import IntakeForm from "./_components/IntakeForm";
import {
  SummaryPanel,
  TimelinePanel,
  LegalFrameworkPanel,
  EvidencePanel,
  CaseFactsPanel,
  SettingsPanel,
} from "./_components/CasePanels";

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

  // Chat messages (lifted up so they survive tab switches)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  // Whether the intake form has been completed or skipped
  const [intakeComplete, setIntakeComplete] = useState(false);
  // Pipeline status
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatusResponse | null>(null);
  const pipelineIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sub-page data (loaded on demand)
  const [summaryReport, setSummaryReport] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [legalFramework, setLegalFramework] = useState<LegalFrameworkEntry[] | null>(null);
  const [evidence, setEvidence] = useState<EvidenceDoc[] | null>(null);
  const [caseFacts, setCaseFacts] = useState<Record<string, unknown> | null>(null);
  const [caseSettings, setCaseSettings] = useState<Record<string, unknown> | null>(null);
  const [caseTodos, setCaseTodos] = useState<CaseTodo[] | null>(null);
  const [tabLoading, setTabLoading] = useState(false);

  // Poll pipeline status
  const startPipelinePolling = useCallback(() => {
    if (pipelineIntervalRef.current) return;
    pipelineIntervalRef.current = setInterval(async () => {
      try {
        const status = await fetchPipelineStatus(caseId);
        setPipelineStatus(status);
        if (status.status !== "running") {
          if (pipelineIntervalRef.current) {
            clearInterval(pipelineIntervalRef.current);
            pipelineIntervalRef.current = null;
          }
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 3000);
  }, [caseId]);

  useEffect(() => {
    return () => {
      if (pipelineIntervalRef.current) {
        clearInterval(pipelineIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [data, status, checklist, summaryRes, timelineRes] = await Promise.all([
          fetchCaseDetail(caseId),
          fetchPipelineStatus(caseId).catch(() => null),
          fetchIntakeChecklist(caseId).catch(() => null),
          fetchSummaryReport(caseId).catch(() => null),
          fetchTimeline(caseId).catch(() => null),
        ]);
        if (cancelled) return;
        setCaseData(data);
        setChatMessages(data.chat_history);

        // Cache summary/timeline so the tabs don't re-fetch
        if (summaryRes?.summary_report) setSummaryReport(summaryRes.summary_report);
        if (timelineRes?.timeline?.tijdlijn) setTimeline(timelineRes.timeline.tijdlijn);

        // Determine if intake is already done
        const hasHistory = data.chat_history.some(
          (m) => (m.role === "user" || m.role === "assistant" || m.role === "system") && m.content?.trim()
        );
        const pipelineActive = status?.status === "running" || status?.status === "completed";
        const checklistDone = checklist?.checklist_progress?.all_complete === true;
        const hasResults = !!summaryRes?.summary_report || (timelineRes?.timeline?.tijdlijn?.length ?? 0) > 0;

        if (hasHistory || pipelineActive || checklistDone || hasResults) {
          setIntakeComplete(true);
        }

        if (status) {
          setPipelineStatus(status);
          if (status.status === "running") {
            startPipelinePolling();
          }
        }
      } catch {
        // error
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [caseId, startPipelinePolling]);

  /** Called when intake form completes — triggers analysis and starts polling */
  async function handleIntakeComplete() {
    setIntakeComplete(true);
    // Show immediate placeholder while backend spins up
    setPipelineStatus({
      current_stage: "timeline",
      status: "running",
      detail: "Tijdlijn van de zaak aan het opstellen...",
      updated_at: new Date().toISOString(),
    });
    // Fire-and-forget: kick off analysis, then poll for real status
    triggerAnalyze(caseId).catch(() => {});
    startPipelinePolling();
  }

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
                intakeComplete ? (
                  <ChatPanel
                    caseId={caseId}
                    messages={chatMessages}
                    onMessagesChange={setChatMessages}
                    pipelineStatus={pipelineStatus}
                    onTabChange={handleTabClick}
                  />
                ) : (
                  <IntakeForm
                    caseId={caseId}
                    onComplete={handleIntakeComplete}
                    onSkipToChat={() => setIntakeComplete(true)}
                  />
                )
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
