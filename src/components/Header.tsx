"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface HeaderProps {
  tripleCount?: number | null;
  loading?: boolean;
  error?: string | null;
}

export default function Header({ tripleCount, loading, error }: HeaderProps) {
  const pathname = usePathname();
  const isLawBuddy = pathname.startsWith("/lawbuddy");

  return (
    <nav className="navbar app-header px-3 py-0">
      <div className="d-flex align-items-center">
        <Link className="navbar-brand" href="/">
          <Image
            src="/wetbrowser-icon.png"
            alt="LawBrowser"
            width={30}
            height={30}
            className="brand-icon"
          />
          LawBrowser
        </Link>

        <span className="header-divider" />

        <Link
          href="/lawbuddy"
          className={`header-nav-btn ${isLawBuddy ? "active" : ""}`}
        >
          <Image
            src="/robocaat-logo-transparent.png"
            alt="LawBuddy"
            width={44}
            height={44}
            className="lawbuddy-nav-icon"
          />
          LawBuddy
        </Link>
      </div>

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
        {tripleCount != null && !loading && !error && (
          <span className="health-badge badge-online">
            <span className="pulse-dot" />
            {tripleCount.toLocaleString()} triples
          </span>
        )}
      </div>
    </nav>
  );
}
