"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchNode, NodeResponse, RelationGroup } from "@/lib/api";

interface NodeViewProps {
  initialNodeId: string;
  isUri: boolean;
  onClose: () => void;
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

/** Check if a property predicate should be hidden from the properties table */
function isHiddenPredicate(predicate: string): boolean {
  const local = shortenUri(predicate);
  return local.startsWith("active_") || local.startsWith("inactive_") || local === "hasChild";
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

export default function NodeView({ initialNodeId, isUri, onClose }: NodeViewProps) {
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
      setData(result);
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

  // Filter relation predicates out of the properties table
  const displayProperties = Object.entries(data.properties).filter(
    ([predicate]) => !isHiddenPredicate(predicate)
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

      <h5 className="node-title mb-4">{shortenUri(data.uri)}</h5>

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

      {/* Children */}
      {data.children.length > 0 && (
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

      {data.children.length === 0 && displayProperties.length === 0 && !hasRelations && (
        <p className="no-results">
          <i className="fa-regular fa-folder-open me-2" />
          This node has no properties or children.
        </p>
      )}
    </div>
  );
}
