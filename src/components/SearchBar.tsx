"use client";

import { useState, FormEvent } from "react";
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
  const [searched, setSearched] = useState(false);

  async function handleSearch(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearching(true);
    setSearched(true);
    try {
      const data = await searchNodes(trimmed);
      setResults(data.results);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="search-section mb-4">
      <h4 className="search-title">Search</h4>

      <form onSubmit={handleSearch} className="search-input-group">
        <input
          type="text"
          className="form-control"
          placeholder="Search laws, articles, cases..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          className="btn-search"
          type="submit"
          disabled={searching}
          aria-label="Search"
        >
          {searching ? (
            <i className="fa-solid fa-spinner fa-spin" />
          ) : (
            <i className="fa-solid fa-magnifying-glass" />
          )}
        </button>
      </form>

      {searched && !searching && results.length === 0 && (
        <p className="no-results">
          <i className="fa-regular fa-face-meh me-2" />
          No results found
        </p>
      )}

      {results.length > 0 && (
        <div className="search-results">
          {results.map((r) => (
            <button
              key={r.uri}
              type="button"
              className="search-result-item"
              onClick={() => onSelectResult(r.uri)}
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
