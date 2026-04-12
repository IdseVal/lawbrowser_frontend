"use client";

import Image from "next/image";

interface HeaderProps {
  tripleCount: number | null;
  loading: boolean;
  error: string | null;
}

export default function Header({ tripleCount, loading, error }: HeaderProps) {
  return (
    <nav className="navbar app-header px-3 py-0">
      <a className="navbar-brand" href="/">
        <Image
          src="/wetbrowser-icon.png"
          alt="LawBrowser"
          width={30}
          height={30}
          className="brand-icon"
        />
        LawBrowser
      </a>

      <div className="d-flex align-items-center">
        {loading && (
          <span className="health-badge badge-loading">
            <span className="pulse-dot" />
            Connecting
          </span>
        )}
        {error && (
          <span className="health-badge badge-offline" title={error}>
            <i className="fa-solid fa-circle-xmark" />
            Offline
          </span>
        )}
        {tripleCount !== null && !loading && !error && (
          <span className="health-badge badge-online">
            <span className="pulse-dot" />
            {tripleCount.toLocaleString()} triples
          </span>
        )}
      </div>
    </nav>
  );
}
