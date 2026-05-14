"use client";

import { useMemo } from "react";
import { DocumentTreeNode } from "@/lib/api";
import { naturalCompare } from "@/lib/naturalSort";

interface DocumentTreeProps {
  tree: DocumentTreeNode;
  onNodeClick: (uri: string) => void;
  /** When true, omit the "Documentstructuur" heading */
  headless?: boolean;
}

/** Sort children by their label using natural Dutch legal ordering */
function sortChildren(children: DocumentTreeNode[]): DocumentTreeNode[] {
  return [...children].sort((a, b) => {
    const labelA = a.label ?? a.titel ?? a.uri;
    const labelB = b.label ?? b.titel ?? b.uri;
    return naturalCompare(labelA, labelB);
  });
}

function depthClass(depth: number): string {
  if (depth <= 1) return "doc-depth-0";
  if (depth === 2) return "doc-depth-1";
  if (depth === 3) return "doc-depth-2";
  if (depth === 4) return "doc-depth-3";
  return "doc-depth-4";
}

function nodeTypeClass(type?: string): string {
  if (!type) return "";
  return `doc-type-${type}`;
}

interface TreeNodeProps {
  node: DocumentTreeNode;
  depth: number;
  onNodeClick: (uri: string) => void;
}

function TreeNode({ node, depth, onNodeClick }: TreeNodeProps) {
  const hasText = !!node.textContent;
  const hasChildren = node.children.length > 0;
  const isLid = node.type === "lid";
  const heading = [node.label, node.titel].filter(Boolean).join(" — ");

  // Lid: label is clickable, text is not
  if (isLid) {
    return (
      <div className={`doc-node ${depthClass(depth)} ${nodeTypeClass(node.type)}`}>
        <div className="doc-lid-inline">
          <span
            className="doc-lid-label doc-lid-label-clickable"
            onClick={() => onNodeClick(node.uri)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") onNodeClick(node.uri); }}
          >
            {heading || node.uri}
          </span>
          {hasText && <span className="doc-lid-text">{node.textContent}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={`doc-node ${depthClass(depth)} ${nodeTypeClass(node.type)}`}>
      <div
        className={`doc-node-header ${hasText ? "doc-node-leaf" : ""}`}
        onClick={() => onNodeClick(node.uri)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") onNodeClick(node.uri); }}
      >
        <span className="doc-node-label">{heading || node.uri}</span>
      </div>

      {hasText && (
        <div className="doc-text-content">
          {node.textContent}
        </div>
      )}

      {hasChildren && (
        <div className="doc-children">
          {sortChildren(node.children).map((child) => (
            <TreeNode
              key={child.uri}
              node={child}
              depth={depth + 1}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DocumentTree({ tree, onNodeClick, headless }: DocumentTreeProps) {
  const sortedRoot = useMemo(() => sortChildren(tree.children), [tree.children]);

  return (
    <div className="document-tree">
      {!headless && (
        <div className="section-heading">
          <i className="fa-solid fa-book-open me-2" />
          Documentstructuur
        </div>
      )}
      <div className="doc-tree-container">
        {sortedRoot.map((child) => (
          <TreeNode
            key={child.uri}
            node={child}
            depth={1}
            onNodeClick={onNodeClick}
          />
        ))}
      </div>
    </div>
  );
}
