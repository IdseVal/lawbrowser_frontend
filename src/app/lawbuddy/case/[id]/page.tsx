"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
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
  sendChatMessage,
  submitIntakeStory,
  submitIntakeLocation,
  submitIntakeCounterparty,
  submitIntakeEvidence,
  triggerAnalyze,
  fetchPipelineStatus,
  fetchIntakeStory,
  fetchIntakeLocation,
  fetchIntakeCounterparty,
  fetchIntakeEvidence,
  CaseDetailResponse,
  CaseTodo,
  ChatMessage,
  TimelineEntry,
  EvidenceDoc,
  LegalFrameworkEntry,
  ChecklistProgress,
  PipelineStatusResponse,
  IntakeEvidenceUpload,
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

        // Determine if intake is already done:
        // - has chat history, OR
        // - pipeline is/was running (intake was submitted), OR
        // - checklist shows all phases complete, OR
        // - summary or timeline already exist
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

/* ---- Sub-page panels ---- */

/* ---- Location Map ---- */

interface ParsedAddress {
  country?: string;
  province?: string;
  municipality?: string;
  postalCode?: string;
  houseNumber?: string;
}

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

function LocationMap({
  coordinates,
  onSelect,
}: {
  coordinates: { lat: number; lng: number } | null;
  onSelect: (coords: { lat: number; lng: number }, address: ParsedAddress) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Load Google Maps script
  useEffect(() => {
    if (typeof google !== "undefined" && google.maps) {
      setMapReady(true);
      return;
    }
    if (!GOOGLE_MAPS_KEY) return;

    const existing = document.querySelector("script[src*=\"maps.googleapis.com\"]");
    if (existing) {
      existing.addEventListener("load", () => setMapReady(true));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&libraries=marker&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => setMapReady(true);
    document.head.appendChild(script);
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapReady || !mapRef.current || mapInstanceRef.current) return;

    const center = coordinates ?? { lat: 52.3676, lng: 4.9041 }; // Default: Amsterdam
    const map = new google.maps.Map(mapRef.current, {
      center,
      zoom: 8,
      mapId: "lawbuddy-intake",
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "greedy",
    });
    mapInstanceRef.current = map;

    // If coordinates were provided at init time, place marker and center
    if (coordinates) {
      markerRef.current = new google.maps.marker.AdvancedMarkerElement({
        position: coordinates,
        map,
      });
      map.setCenter(coordinates);
      map.setZoom(14);
    }

    map.addListener("click", (e: google.maps.MapMouseEvent) => {
      const lat = e.latLng?.lat();
      const lng = e.latLng?.lng();
      if (lat == null || lng == null) return;

      const pos = { lat, lng };

      // Place or move marker
      if (markerRef.current) {
        markerRef.current.position = pos;
      } else {
        markerRef.current = new google.maps.marker.AdvancedMarkerElement({
          position: pos,
          map,
        });
      }

      // Reverse geocode
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: pos }, (results, status) => {
        const address: ParsedAddress = {};
        if (status === "OK" && results && results[0]) {
          for (const comp of results[0].address_components) {
            if (comp.types.includes("country")) address.country = comp.long_name;
            if (comp.types.includes("administrative_area_level_1")) address.province = comp.long_name;
            if (comp.types.includes("locality")) address.municipality = comp.long_name;
            if (comp.types.includes("postal_code")) address.postalCode = comp.long_name;
            if (comp.types.includes("street_number")) address.houseNumber = comp.long_name;
          }
        }
        onSelect(pos, address);
      });
    });
  }, [mapReady, coordinates, onSelect]);

  // When pre-filled coordinates arrive after map already initialized, place/move marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !coordinates) return;

    if (markerRef.current) {
      markerRef.current.position = coordinates;
    } else {
      markerRef.current = new google.maps.marker.AdvancedMarkerElement({
        position: coordinates,
        map,
      });
    }
    map.setCenter(coordinates);
    map.setZoom(14);
  }, [coordinates]);

  if (!GOOGLE_MAPS_KEY) {
    return (
      <div className="intake-map-fallback">
        <i className="fa-solid fa-map-location-dot" />
        <p>Google Maps API key niet geconfigureerd.</p>
        <p className="text-muted" style={{ fontSize: "0.75rem" }}>
          Stel <code>NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> in om de kaart te gebruiken.
        </p>
      </div>
    );
  }

  return <div ref={mapRef} className="intake-map" />;
}

/* ---- File helpers ---- */

function fileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function fileTypeIcon(name: string): string {
  const ext = fileExtension(name);
  const map: Record<string, string> = {
    pdf: "fa-file-pdf",
    doc: "fa-file-word", docx: "fa-file-word",
    xls: "fa-file-excel", xlsx: "fa-file-excel", csv: "fa-file-csv",
    png: "fa-file-image", jpg: "fa-file-image", jpeg: "fa-file-image", gif: "fa-file-image", webp: "fa-file-image",
    zip: "fa-file-zipper", rar: "fa-file-zipper",
    eml: "fa-envelope",
    txt: "fa-file-lines",
  };
  return map[ext] ?? "fa-file";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FilePreviewOverlay({ file, onClose }: { file: File; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="file-preview-panel" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-header">
          <h5 className="overlay-title">{file.name}</h5>
          <span className="file-preview-meta">
            {fileExtension(file.name).toUpperCase()} &middot; {formatFileSize(file.size)}
          </span>
          <button className="overlay-close" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="file-preview-body">
          {isImage && url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={file.name} className="file-preview-image" />
          )}
          {isPdf && url && (
            <iframe src={url} className="file-preview-iframe" title={file.name} />
          )}
          {!isImage && !isPdf && (
            <div className="file-preview-fallback">
              <i className={`fa-solid ${fileTypeIcon(file.name)} file-preview-fallback-icon`} />
              <p>Geen voorbeeld beschikbaar voor dit bestandstype.</p>
              <p className="text-muted" style={{ fontSize: "0.8rem" }}>{file.name}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Intake Form ---- */

type IntakeStep = 1 | 2 | 3 | 4;

const INTAKE_BUBBLES: Record<IntakeStep, string> = {
  1: "Welkom bij je nieuwe zaak in LawBuddy, ik kan je het best helpen als je zo gedetailleerd mogelijk het intake formulier voor deze zaak invult.",
  2: "Om je optimaal te kunnen helpen heb ik een locatie nodig waar het geschil of juridische vraagstuk zich heeft afgespeeld. Klik op de kaart aan waar het geschil zich heeft afgespeeld, dit is bijvoorbeeld waar je een contract hebt getekend, de locatie waar een schade is veroorzaakt of de locatie waarvoor je een vergunning aanvraagt. Als je niet zeker weet wat je moet aanklikken dan is je eigen adres een goede keuze.",
  3: "Wie is de wederpartij in deze zaak? Dit kan relevant zijn voor een correcte analyse van jouw vraagstuk. Met deze informatie kan ik eventuele juridische vervolgstappen op de juiste manier voorbereiden.",
  4: "Upload hier alle documenten die relevant zijn voor jouw vraagstuk. Denk aan bewijsstukken als contracten, e-mails, whatsapp gesprekken, foto\u2019s of andere bestanden die van belang zijn voor het in kaart brengen van de feitelijke situatie rond jouw vraagstuk.",
};

const INTAKE_HEADERS: Record<IntakeStep, string> = {
  1: "Het vraagstuk",
  2: "Locatie van het vraagstuk/conflict",
  3: "De wederpartij",
  4: "Relevante documenten en bewijsstukken",
};

function IntakeForm({
  caseId,
  onComplete,
  onSkipToChat,
}: {
  caseId: string;
  onComplete: () => void;
  onSkipToChat: () => void;
}) {
  const [step, setStep] = useState<IntakeStep>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1
  const [story, setStory] = useState("");
  const [mandateDo, setMandateDo] = useState("");
  const [mandateDont, setMandateDont] = useState("");

  // Step 2
  const [locationMode, setLocationMode] = useState<"map" | "manual">("map");
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [country, setCountry] = useState("Nederland");
  const [province, setProvince] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [houseNumber, setHouseNumber] = useState("");

  // Step 3
  const [cpName, setCpName] = useState("");
  const [cpType, setCpType] = useState("natuurlijk persoon");
  const [cpEmail, setCpEmail] = useState("");
  const [cpPhone, setCpPhone] = useState("");
  const [cpLand, setCpLand] = useState("");
  const [cpStad, setCpStad] = useState("");
  const [cpPostcode, setCpPostcode] = useState("");
  const [cpStraat, setCpStraat] = useState("");
  const [cpHuisnummer, setCpHuisnummer] = useState("");
  const [cpToevoeging, setCpToevoeging] = useState("");

  // Step 4
  const [files, setFiles] = useState<File[]>([]);
  const [existingDocs, setExistingDocs] = useState<IntakeEvidenceUpload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill from backend
  const [prefillLoading, setPrefillLoading] = useState(true);
  useEffect(() => {
    async function prefill() {
      setPrefillLoading(true);
      try {
        const [storyData, locationData, counterpartyData, evidenceData] = await Promise.all([
          fetchIntakeStory(caseId).catch(() => null),
          fetchIntakeLocation(caseId).catch(() => null),
          fetchIntakeCounterparty(caseId).catch(() => null),
          fetchIntakeEvidence(caseId).catch(() => null),
        ]);
        if (storyData) {
          if (storyData.story) setStory(storyData.story);
          if (storyData.mandate_do) setMandateDo(storyData.mandate_do);
          if (storyData.mandate_dont) setMandateDont(storyData.mandate_dont);
        }
        if (locationData) {
          if (locationData.coordinates) setCoordinates(locationData.coordinates);
          if (locationData.country) setCountry(locationData.country);
          if (locationData.province) setProvince(locationData.province ?? "");
          if (locationData.municipality) setMunicipality(locationData.municipality);
          if (locationData.postal_code) setPostalCode(locationData.postal_code);
          if (locationData.house_number) setHouseNumber(locationData.house_number);
        }
        if (counterpartyData) {
          if (counterpartyData.name) setCpName(counterpartyData.name);
          if (counterpartyData.type) setCpType(counterpartyData.type);
          if (counterpartyData.email) setCpEmail(counterpartyData.email);
          if (counterpartyData.phone) setCpPhone(counterpartyData.phone);
          if (counterpartyData.land) setCpLand(counterpartyData.land);
          if (counterpartyData.stad) setCpStad(counterpartyData.stad);
          if (counterpartyData.postcode) setCpPostcode(counterpartyData.postcode);
          if (counterpartyData.straat) setCpStraat(counterpartyData.straat);
          if (counterpartyData.huisnummer) setCpHuisnummer(counterpartyData.huisnummer);
          if (counterpartyData.toevoeging) setCpToevoeging(counterpartyData.toevoeging);
        }
        if (evidenceData?.evidence_docs) {
          setExistingDocs(evidenceData.evidence_docs);
        }
      } catch {
        // Pre-fill failed — proceed with empty form
      } finally {
        setPrefillLoading(false);
      }
    }
    prefill();
  }, [caseId]);

  // Allowed file types
  const ALLOWED_EXTENSIONS = new Set([
    "pdf", "doc", "docx", "xls", "xlsx", "csv",
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "tif", "svg",
    "txt", "rtf", "eml", "zip", "rar",
  ]);

  function validateFiles(incoming: File[]): File[] {
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of incoming) {
      const ext = fileExtension(f.name);
      if (ext && ALLOWED_EXTENSIONS.has(ext)) {
        accepted.push(f);
      } else {
        rejected.push(f.name);
      }
    }
    if (rejected.length > 0) {
      setFileError(`Niet-ondersteund bestandstype: ${rejected.join(", ")}`);
      setTimeout(() => setFileError(null), 5000);
    }
    return accepted;
  }

  async function handleNext() {
    setSaving(true);
    setError(null);
    try {
      switch (step) {
        case 1:
          await submitIntakeStory(caseId, {
            story,
            mandate_do: mandateDo,
            mandate_dont: mandateDont || undefined,
          });
          setStep(2);
          break;
        case 2:
          await submitIntakeLocation(caseId, {
            coordinates: coordinates || undefined,
            country,
            province: province || undefined,
            municipality: municipality || "Onbekend",
            postal_code: postalCode || undefined,
            house_number: houseNumber || undefined,
          });
          setStep(3);
          break;
        case 3: {
          const cpData: Record<string, string | undefined> = {
            name: cpName || undefined,
            type: cpType || undefined,
            email: cpEmail || undefined,
            phone: cpPhone || undefined,
            land: cpLand || undefined,
            stad: cpStad || undefined,
            postcode: cpPostcode || undefined,
            straat: cpStraat || undefined,
            huisnummer: cpHuisnummer || undefined,
            toevoeging: cpToevoeging || undefined,
          };
          await submitIntakeCounterparty(caseId, cpData);
          setStep(4);
          break;
        }
        case 4:
          if (files.length > 0) {
            await submitIntakeEvidence(caseId, files);
          }
          onComplete();
          break;
      }
    } catch {
      setError("Er is iets misgegaan bij het opslaan. Probeer het opnieuw.");
    } finally {
      setSaving(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected) return;
    const valid = validateFiles(Array.from(selected));
    if (valid.length > 0) setFiles((prev) => [...prev, ...valid]);
    e.target.value = "";
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function isStepValid(): boolean {
    switch (step) {
      case 1: return story.trim().length > 0 && mandateDo.trim().length > 0;
      case 2: return locationMode === "map"
        ? coordinates !== null
        : country.trim().length > 0 && municipality.trim().length > 0;
      case 3: return true; // all fields optional
      case 4: return true; // evidence is optional
    }
  }

  if (prefillLoading) {
    return (
      <div className="intake-container">
        <div className="loading-container">
          <div className="loading-spinner" />
          <span className="loading-text">Formulier laden...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="intake-container">
      <div className="intake-wrapper">
      {/* Logo + speech bubble floating on the left */}
      <div className="intake-aside">
        <Image
          src="/robocaat-logo-transparent.png"
          alt="LawBuddy"
          width={220}
          height={220}
          className="intake-logo"
          priority
        />
        <div className="intake-speech-bubble">
          <p>{INTAKE_BUBBLES[step]}</p>
        </div>
      </div>

      {/* Panel with form */}
      <div className="intake-panel">
        <div className="intake-right">
          <h4 className="intake-panel-title">{INTAKE_HEADERS[step]}</h4>
          <div className="intake-form">
            {step === 1 && (
              <>
                <label className="intake-label">
                  Beschrijving van uw zaak/conflict/vraagstuk <span className="intake-required">*</span>
                </label>
                <textarea
                  className="intake-textarea"
                  rows={5}
                  placeholder="Beschrijf uw situatie zo gedetailleerd mogelijk..."
                  value={story}
                  onChange={(e) => setStory(e.target.value)}
                  autoFocus
                />
                <label className="intake-label">
                  Wat wilt u dat wij doen? <span className="intake-required">*</span>
                </label>
                <textarea
                  className="intake-textarea"
                  rows={2}
                  placeholder="Bijv. schadevergoeding vorderen, contract ontbinden..."
                  value={mandateDo}
                  onChange={(e) => setMandateDo(e.target.value)}
                />
                <label className="intake-label">
                  Wat hoeft niet? <span className="intake-optional">(optioneel)</span>
                </label>
                <textarea
                  className="intake-textarea"
                  rows={2}
                  placeholder="Bijv. geen gerechtelijke procedure..."
                  value={mandateDont}
                  onChange={(e) => setMandateDont(e.target.value)}
                />
              </>
            )}

            {step === 2 && (
              <>
                {locationMode === "map" ? (
                  <>
                    <LocationMap
                      coordinates={coordinates}
                      onSelect={(coords, address) => {
                        setCoordinates(coords);
                        if (address.country) setCountry(address.country);
                        if (address.province) setProvince(address.province);
                        if (address.municipality) setMunicipality(address.municipality);
                        if (address.postalCode) setPostalCode(address.postalCode);
                        if (address.houseNumber) setHouseNumber(address.houseNumber);
                      }}
                    />
                    {coordinates && (
                      <div className="intake-map-result">
                        <i className="fa-solid fa-location-dot me-2" />
                        {[municipality, province, country].filter(Boolean).join(", ") || `${coordinates.lat.toFixed(4)}, ${coordinates.lng.toFixed(4)}`}
                      </div>
                    )}
                    <button
                      className="intake-mode-toggle"
                      onClick={() => setLocationMode("manual")}
                      type="button"
                    >
                      <i className="fa-solid fa-keyboard me-2" />
                      Handmatig invoeren
                    </button>
                  </>
                ) : (
                  <>
                    <div className="intake-row">
                      <div className="intake-field">
                        <label className="intake-label">Land <span className="intake-required">*</span></label>
                        <input type="text" className="intake-input" value={country} onChange={(e) => setCountry(e.target.value)} />
                      </div>
                      <div className="intake-field">
                        <label className="intake-label">Provincie <span className="intake-optional">(optioneel)</span></label>
                        <input type="text" className="intake-input" placeholder="Bijv. Noord-Holland" value={province} onChange={(e) => setProvince(e.target.value)} />
                      </div>
                    </div>
                    <div className="intake-row">
                      <div className="intake-field">
                        <label className="intake-label">Gemeente <span className="intake-required">*</span></label>
                        <input type="text" className="intake-input" placeholder="Bijv. Amsterdam" value={municipality} onChange={(e) => setMunicipality(e.target.value)} />
                      </div>
                      <div className="intake-field">
                        <label className="intake-label">Postcode <span className="intake-optional">(optioneel)</span></label>
                        <input type="text" className="intake-input" placeholder="Bijv. 1013 ER" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
                      </div>
                    </div>
                    <div className="intake-row">
                      <div className="intake-field">
                        <label className="intake-label">Huisnummer <span className="intake-optional">(optioneel)</span></label>
                        <input type="text" className="intake-input" placeholder="Bijv. 89" value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} />
                      </div>
                      <div className="intake-field" />
                    </div>
                    <button
                      className="intake-mode-toggle"
                      onClick={() => setLocationMode("map")}
                      type="button"
                    >
                      <i className="fa-solid fa-map me-2" />
                      Kiezen op de kaart
                    </button>
                  </>
                )}
              </>
            )}

            {step === 3 && (
              <>
                <div className="intake-row">
                  <div className="intake-field">
                    <label className="intake-label">Naam wederpartij <span className="intake-optional">(optioneel)</span></label>
                    <input type="text" className="intake-input" placeholder="Volledige naam of bedrijfsnaam" value={cpName} onChange={(e) => setCpName(e.target.value)} autoFocus />
                  </div>
                  <div className="intake-field">
                    <label className="intake-label">Type <span className="intake-optional">(optioneel)</span></label>
                    <select className="intake-input" value={cpType} onChange={(e) => setCpType(e.target.value)}>
                      <option value="natuurlijk persoon">Natuurlijk persoon</option>
                      <option value="rechtspersoon">Rechtspersoon</option>
                    </select>
                  </div>
                </div>
                <div className="intake-row">
                  <div className="intake-field">
                    <label className="intake-label">E-mail <span className="intake-optional">(optioneel)</span></label>
                    <input type="email" className="intake-input" placeholder="email@voorbeeld.nl" value={cpEmail} onChange={(e) => setCpEmail(e.target.value)} />
                  </div>
                  <div className="intake-field">
                    <label className="intake-label">Telefoon <span className="intake-optional">(optioneel)</span></label>
                    <input type="tel" className="intake-input" placeholder="+31 6 12345678" value={cpPhone} onChange={(e) => setCpPhone(e.target.value)} />
                  </div>
                </div>

                <label className="intake-label" style={{ marginTop: "0.5rem" }}>
                  Adresgegevens <span className="intake-optional">(optioneel)</span>
                </label>
                <div className="intake-row">
                  <div className="intake-field">
                    <label className="intake-label">Straat</label>
                    <input type="text" className="intake-input" placeholder="Prinsengracht" value={cpStraat} onChange={(e) => setCpStraat(e.target.value)} />
                  </div>
                  <div className="intake-field">
                    <label className="intake-label">Huisnummer</label>
                    <div className="intake-row" style={{ gap: "8px" }}>
                      <input type="text" className="intake-input" placeholder="112" value={cpHuisnummer} onChange={(e) => setCpHuisnummer(e.target.value)} style={{ flex: 1 }} />
                      <input type="text" className="intake-input" placeholder="A" value={cpToevoeging} onChange={(e) => setCpToevoeging(e.target.value)} style={{ flex: 0.6 }} title="Toevoeging" />
                    </div>
                  </div>
                </div>
                <div className="intake-row">
                  <div className="intake-field">
                    <label className="intake-label">Postcode</label>
                    <input type="text" className="intake-input" placeholder="1015 HC" value={cpPostcode} onChange={(e) => setCpPostcode(e.target.value)} />
                  </div>
                  <div className="intake-field">
                    <label className="intake-label">Stad</label>
                    <input type="text" className="intake-input" placeholder="Amsterdam" value={cpStad} onChange={(e) => setCpStad(e.target.value)} />
                  </div>
                </div>
                <div className="intake-row">
                  <div className="intake-field">
                    <label className="intake-label">Land</label>
                    <input type="text" className="intake-input" placeholder="Nederland" value={cpLand} onChange={(e) => setCpLand(e.target.value)} />
                  </div>
                  <div className="intake-field" />
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <div
                  className={`intake-dropzone ${dragging ? "intake-dropzone-active" : ""}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const dropped = e.dataTransfer.files;
                    if (dropped.length > 0) {
                      const valid = validateFiles(Array.from(dropped));
                      if (valid.length > 0) setFiles((prev) => [...prev, ...valid]);
                    }
                  }}
                >
                  <i className={`fa-solid ${dragging ? "fa-bullseye" : "fa-cloud-arrow-up"} intake-dropzone-icon`} />
                  <p className="intake-dropzone-text">
                    {dragging ? "Laat los om te uploaden" : "Sleep bestanden hierheen of klik om te selecteren"}
                  </p>
                  <p className="intake-dropzone-hint">
                    PDF, Word, afbeeldingen, e-mail, spreadsheets, ZIP
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="chat-file-input"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tiff,.tif,.svg,.txt,.rtf,.eml,.zip,.rar"
                  onChange={handleFileSelect}
                />
                {files.length > 0 && (
                  <div className="intake-file-grid">
                    {files.map((f, i) => (
                      <div
                        key={i}
                        className="intake-file-card"
                        onClick={() => setPreviewFile(f)}
                        title="Klik om te bekijken"
                      >
                        <button
                          className="intake-file-card-remove"
                          onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                          type="button"
                          aria-label="Verwijder"
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                        <div className="intake-file-card-icon">
                          <i className={`fa-solid ${fileTypeIcon(f.name)}`} />
                        </div>
                        <div className="intake-file-card-name">{f.name}</div>
                        <div className="intake-file-card-meta">
                          {fileExtension(f.name).toUpperCase()} &middot; {formatFileSize(f.size)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {fileError && (
                  <div className="intake-error">
                    <i className="fa-solid fa-circle-exclamation me-2" />
                    {fileError}
                  </div>
                )}

                {/* Already uploaded documents from backend */}
                {existingDocs.length > 0 && (
                  <>
                    <label className="intake-label" style={{ marginTop: "0.75rem" }}>
                      Eerder geüpload
                    </label>
                    <div className="intake-file-grid">
                      {existingDocs.map((doc) => (
                        <div key={doc.id} className="intake-file-card intake-file-card-existing">
                          <div className="intake-file-card-icon">
                            <i className={`fa-solid ${fileTypeIcon(doc.filename)}`} />
                          </div>
                          <div className="intake-file-card-name">{doc.display_name}</div>
                          <div className="intake-file-card-meta">
                            {fileExtension(doc.filename).toUpperCase()} &middot; {doc.type}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* File preview overlay */}
                {previewFile && (
                  <FilePreviewOverlay
                    file={previewFile}
                    onClose={() => setPreviewFile(null)}
                  />
                )}
              </>
            )}

            {error && (
              <div className="intake-error">
                <i className="fa-solid fa-circle-exclamation me-2" />
                {error}
              </div>
            )}
          </div>

          {/* Footer actions inside the panel */}
          <div className="intake-panel-footer">
            <button className="intake-skip-btn" onClick={onSkipToChat} type="button">
              <i className="fa-solid fa-comments me-2" />
              Liever via de chat?
            </button>
            <div className="intake-steps">
              {([1, 2, 3, 4] as IntakeStep[]).map((s) => (
                <div
                  key={s}
                  className={`intake-step-dot ${s === step ? "active" : ""} ${s < step ? "done" : ""}`}
                />
              ))}
            </div>
            <div className="intake-footer-actions">
              {step > 1 && (
                <button
                  className="overlay-btn-secondary"
                  onClick={() => setStep((step - 1) as IntakeStep)}
                  disabled={saving}
                  type="button"
                >
                  <i className="fa-solid fa-arrow-left me-1" />
                  Vorige
                </button>
              )}
              <button
                className="overlay-btn-primary"
                onClick={handleNext}
                disabled={saving || !isStepValid()}
                type="button"
              >
                {saving ? "Opslaan..." : step === 4 ? (
                  <>Afronden <i className="fa-solid fa-check ms-1" /></>
                ) : (
                  <>Volgende <i className="fa-solid fa-arrow-right ms-1" /></>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

/* ---- Chat Panel ---- */

/** Map pipeline current_stage values to readable labels */
const STAGE_LABELS: Record<string, string> = {
  timeline: "Tijdlijn",
  summary: "Samenvatting",
  legal_framework: "Juridisch Raamwerk",
};

/** Map system message types to sidebar tab keys and icons */
const SYSTEM_MSG_MAP: Record<string, { tab: TabKey; icon: string; label: string }> = {
  timeline_ready: { tab: "tijdlijn", icon: "fa-timeline", label: "Tijdlijn" },
  summary_ready: { tab: "samenvatting", icon: "fa-file-lines", label: "Samenvatting" },
  legal_framework_ready: { tab: "juridisch", icon: "fa-gavel", label: "Juridisch Raamwerk" },
  evidence_ready: { tab: "bewijs", icon: "fa-folder-open", label: "Bewijs/Documenten" },
};

function ChatPanel({
  caseId,
  messages,
  onMessagesChange,
  pipelineStatus,
  onTabChange,
}: {
  caseId: string;
  messages: ChatMessage[];
  onMessagesChange: (msgs: ChatMessage[]) => void;
  pipelineStatus: PipelineStatusResponse | null;
  onTabChange: (tab: TabKey) => void;
}) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [checklist, setChecklist] = useState<ChecklistProgress | null>(null);

  // Keep a ref to the latest messages so async callbacks never go stale
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll chat_history while pipeline is running to pick up system messages
  useEffect(() => {
    const isRunning = pipelineStatus?.status === "running";
    if (isRunning && !chatPollRef.current) {
      chatPollRef.current = setInterval(async () => {
        try {
          const data = await fetchCaseDetail(caseId);
          // Only update if new messages arrived
          if (data.chat_history.length > messagesRef.current.length) {
            onMessagesChange(data.chat_history);
          }
        } catch {
          // ignore polling errors
        }
      }, 4000);
    }
    if (!isRunning && chatPollRef.current) {
      // One final fetch to catch the last system message
      fetchCaseDetail(caseId)
        .then((data) => {
          if (data.chat_history.length > messagesRef.current.length) {
            onMessagesChange(data.chat_history);
          }
        })
        .catch(() => {});
      clearInterval(chatPollRef.current);
      chatPollRef.current = null;
    }
    return () => {
      if (chatPollRef.current) {
        clearInterval(chatPollRef.current);
        chatPollRef.current = null;
      }
    };
  }, [pipelineStatus?.status, caseId, onMessagesChange]);

  /** Auto-scroll to the newest message */
  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  /** Auto-resize the textarea as the user types */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    onMessagesChange([...messages, userMsg]);
    setInput("");
    setAttachments([]);
    setSending(true);

    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const res = await sendChatMessage(caseId, text);

      const assistantMsg: ChatMessage = {
        id: res.reply.id,
        role: "assistant",
        content: res.reply.content,
        timestamp: res.reply.timestamp,
      };
      onMessagesChange([...messagesRef.current, assistantMsg]);

      if (res.checklist_progress) {
        setChecklist(res.checklist_progress);
      }
    } catch {
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: "Er is een fout opgetreden. Probeer het opnieuw.",
        timestamp: new Date().toISOString(),
      };
      onMessagesChange([...messagesRef.current, errMsg]);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    setAttachments((prev) => [...prev, ...Array.from(files)]);
    // Reset so the same file can be re-selected
    e.target.value = "";
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  const isEmpty = messages.length === 0 && !sending;
  const pipelineRunning = pipelineStatus?.status === "running";

  return (
    <div className="chat-container">
      {/* Checklist progress bar */}
      {checklist && checklist.phases.length > 0 && (
        <div className="chat-checklist">
          {checklist.phases.map((phase) => (
            <div
              key={phase.id}
              className={`checklist-phase ${phase.complete ? "complete" : ""} ${phase.id === checklist.current_phase ? "current" : ""}`}
            >
              <div className="checklist-phase-bar">
                <div
                  className="checklist-phase-fill"
                  style={{ width: phase.total > 0 ? `${(phase.filled / phase.total) * 100}%` : "0%" }}
                />
              </div>
              <span className="checklist-phase-label">{phase.label}</span>
              <span className="checklist-phase-count">{phase.filled}/{phase.total}</span>
            </div>
          ))}
        </div>
      )}

      {/* Messages area */}
      <div className="chat-scroll-area">
        <div className="chat-messages-container">
          {isEmpty && !pipelineRunning && (
            <div className="chat-empty">
              <Image
                src="/robocaat-logo-transparent.png"
                alt="LawBuddy"
                width={64}
                height={64}
                className="chat-empty-icon"
              />
              <h4>Welkom bij LawBuddy</h4>
              <p>Stel een vraag over uw zaak of beschrijf uw situatie om te beginnen.</p>
            </div>
          )}

          {messages.map((msg) => {
            // System messages get special card rendering
            if (msg.role === "system" && msg.type) {
              const meta = SYSTEM_MSG_MAP[msg.type];
              return (
                <div key={msg.id} className="chat-row chat-row-system">
                  <button
                    className="chat-system-card"
                    onClick={() => meta && onTabChange(meta.tab)}
                    type="button"
                  >
                    <div className="chat-system-card-icon">
                      <i className={`fa-solid ${meta?.icon ?? "fa-circle-info"}`} />
                    </div>
                    <div className="chat-system-card-body">
                      <span className="chat-system-card-label">
                        {meta?.label ?? "Update"}
                      </span>
                      <span className="chat-system-card-text">{msg.content}</span>
                    </div>
                  </button>
                </div>
              );
            }

            return (
              <div key={msg.id} className={`chat-row chat-row-${msg.role}`}>
                <div className={`chat-bubble chat-${msg.role}`}>
                  {msg.role === "assistant" && (
                    <div className="chat-avatar chat-avatar-assistant">
                      <Image
                        src="/robocaat-logo-transparent.png"
                        alt="LawBuddy"
                        width={72}
                        height={72}
                        className="chat-avatar-img"
                      />
                    </div>
                  )}
                  <div className="chat-bubble-body">
                    {msg.role === "assistant" ? (
                      <div
                        className="chat-bubble-content"
                        dangerouslySetInnerHTML={{ __html: chatMarkdownToHtml(msg.content) }}
                      />
                    ) : (
                      <div className="chat-bubble-content">{msg.content}</div>
                    )}
                    <div className="chat-bubble-time">
                      {new Date(msg.timestamp).toLocaleString("nl-NL", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="chat-row chat-row-assistant">
              <div className="chat-bubble chat-assistant">
                <div className="chat-avatar chat-avatar-assistant">
                  <i className="fa-solid fa-scale-balanced" />
                </div>
                <div className="chat-bubble-body">
                  <div className="chat-typing">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Active pipeline stage shown inline as a card */}
          {pipelineRunning && pipelineStatus && (
            <div className="chat-row chat-row-system">
              <div className="chat-pipeline-card">
                <Image
                  src="/robocaat-logo-transparent.png"
                  alt="LawBuddy"
                  width={36}
                  height={36}
                  className="chat-pipeline-card-logo"
                />
                <div className="chat-pipeline-card-body">
                  <span className="chat-pipeline-card-agent">
                    {STAGE_LABELS[pipelineStatus.current_stage] ?? pipelineStatus.current_stage}
                  </span>
                  <span className="chat-pipeline-card-message">
                    {pipelineStatus.detail ?? "Bezig met analyseren..."}
                  </span>
                </div>
                <div className="chat-pipeline-card-spinner" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          {attachments.length > 0 && (
            <div className="chat-attachments">
              {attachments.map((file, i) => (
                <div key={i} className="chat-attachment-chip">
                  <i className="fa-solid fa-paperclip me-1" />
                  <span className="chat-attachment-name">{file.name}</span>
                  <button
                    className="chat-attachment-remove"
                    onClick={() => removeAttachment(i)}
                    aria-label="Verwijder bijlage"
                  >
                    <i className="fa-solid fa-xmark" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="chat-input-row">
            <button
              className="chat-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Bestand toevoegen"
              type="button"
            >
              <i className="fa-solid fa-paperclip" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="chat-file-input"
              multiple
              onChange={handleFileSelect}
            />
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              placeholder="Stel een vraag over uw zaak..."
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
            />
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={sending || !input.trim()}
              title="Verstuur"
              type="button"
            >
              <i className="fa-solid fa-paper-plane" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Markdown-to-HTML for assistant chat messages */
function chatMarkdownToHtml(md: string): string {
  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h6>$1</h6>")
    .replace(/^## (.+)$/gm, "<h5>$1</h5>")
    .replace(/^# (.+)$/gm, "<h4>$1</h4>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*<\/li>)/g, "<ul>$1</ul>")
    .replace(/<\/ul>\s*<ul>/g, "")
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
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

function renderFacts(obj: Record<string, unknown>, depth: number, parentPath = ""): React.ReactNode[] {
  const rows: React.ReactNode[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = parentPath ? `${parentPath}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      rows.push(
        <tr key={path}>
          <td
            colSpan={2}
            className="node-property-key"
            style={{ paddingLeft: `${16 + depth * 20}px`, paddingTop: depth === 0 ? "14px" : "10px" }}
          >
            {formatKey(key)}
          </td>
        </tr>
      );
      rows.push(...renderFacts(value as Record<string, unknown>, depth + 1, path));
    } else {
      rows.push(
        <tr key={path}>
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
