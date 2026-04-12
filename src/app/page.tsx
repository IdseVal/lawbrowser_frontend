"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import SearchBar from "@/components/SearchBar";
import EuropeMap from "@/components/EuropeMap";
import NodeView from "@/components/NodeView";
import { fetchHealth } from "@/lib/api";

interface ActiveNode {
  id: string;
  isUri: boolean;
}

export default function Home() {
  const [tripleCount, setTripleCount] = useState<number | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState<ActiveNode | null>(null);

  useEffect(() => {
    fetchHealth()
      .then((data) => {
        setTripleCount(data.triple_count);
        setHealthError(null);
      })
      .catch((err) => {
        setHealthError(err instanceof Error ? err.message : "Connection failed");
      })
      .finally(() => setHealthLoading(false));
  }, []);

  function handleCountryClick(country: string) {
    setActiveNode({ id: country, isUri: true });
  }

  function handleSearchSelect(uri: string) {
    setActiveNode({ id: uri, isUri: true });
  }

  function handleCloseNode() {
    setActiveNode(null);
  }

  return (
    <>
      <Header
        tripleCount={tripleCount}
        loading={healthLoading}
        error={healthError}
      />

      <main className="container py-4">
        <SearchBar onSelectResult={handleSearchSelect} />

        {activeNode ? (
          <NodeView
            key={activeNode.id}
            initialNodeId={activeNode.id}
            isUri={activeNode.isUri}
            onClose={handleCloseNode}
          />
        ) : (
          <EuropeMap onSelectCountry={handleCountryClick} />
        )}
      </main>
    </>
  );
}
