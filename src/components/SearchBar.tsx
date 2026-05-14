"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { searchNodes, SearchResult } from "@/lib/api";

interface SearchBarProps {
  onSelectResult: (uri: string) => void;
}

function shortenType(type: string): string {
  if (type.includes("#")) return type.split("#").pop() ?? type;
  if (type.includes("/")) return type.split("/").pop() ?? type;
  return type;
}

export default function SearchBar({ onSelectResult }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const doSearch = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setOpen(false);
      return;
    }
    const seq = ++seqRef.current;
    setSearching(true);
    searchNodes(trimmed).then((data) => {
      if (seq !== seqRef.current) return;
      setResults(data.results);
      setOpen(data.results.length > 0);
    }).catch(() => {
      if (seq === seqRef.current) { setResults([]); setOpen(false); }
    }).finally(() => {
      if (seq === seqRef.current) setSearching(false);
    });
  }, []);

  function handleInputChange(value: string) {
    setQuery(value);
    doSearch(value);
  }

  function handleSelect(uri: string) {
    setOpen(false);
    onSelectResult(uri);
  }

  return (
    <div className="search-section mb-4" ref={wrapperRef}>
      <h4 className="search-title">Search</h4>

      <div className="search-input-group">
        <input
          type="text"
          className="form-control"
          placeholder="Search laws, articles, cases..."
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
        />
        <div className="search-input-icon" aria-hidden="true">
          {searching ? (
            <i className="fa-solid fa-spinner fa-spin" />
          ) : (
            <i className="fa-solid fa-magnifying-glass" />
          )}
        </div>
      </div>

      {open && results.length > 0 && (
        <div className="search-results search-results-dropdown">
          {results.map((r) => (
            <button
              key={r.uri}
              type="button"
              className="search-result-item"
              onClick={() => handleSelect(r.uri)}
            >
              <div>
                <strong>{r.label || r.citeertitel || r.uri}</strong>
                {r.titel && <div className="result-subtitle">{r.titel}</div>}
              </div>
              {r.type && (
                <span className="type-badge">{shortenType(r.type)}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
