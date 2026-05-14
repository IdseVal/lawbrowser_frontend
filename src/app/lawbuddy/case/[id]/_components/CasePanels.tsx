"use client";

import React from "react";
import {
  TimelineEntry,
  EvidenceDoc,
  LegalFrameworkEntry,
} from "@/lib/api";

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

function formatKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

export function SummaryPanel({ content }: { content: string | null }) {
  if (!content) return <p className="text-muted p-4">Geen samenvatting beschikbaar.</p>;
  return (
    <div className="panel-content">
      <h5 className="panel-title">Samenvatting</h5>
      <div className="summary-content" dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }} />
    </div>
  );
}

export function TimelinePanel({ entries }: { entries: TimelineEntry[] | null }) {
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

export function LegalFrameworkPanel({ entries }: { entries: LegalFrameworkEntry[] | null }) {
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

export function EvidencePanel({ docs }: { docs: EvidenceDoc[] | null }) {
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

export function CaseFactsPanel({ facts }: { facts: Record<string, unknown> | null }) {
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

export function SettingsPanel({ settings }: { settings: Record<string, unknown> | null }) {
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
