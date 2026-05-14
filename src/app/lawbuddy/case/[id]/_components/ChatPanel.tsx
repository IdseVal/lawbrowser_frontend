"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import {
  fetchCaseDetail,
  sendChatMessage,
  ChatMessage,
  ChecklistProgress,
  PipelineStatusResponse,
} from "@/lib/api";
import type { TabKey } from "./types";

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

export default function ChatPanel({
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
