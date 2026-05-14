"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import {
  submitIntakeStory,
  submitIntakeLocation,
  submitIntakeCounterparty,
  submitIntakeEvidence,
  fetchIntakeStory,
  fetchIntakeLocation,
  fetchIntakeCounterparty,
  fetchIntakeEvidence,
  IntakeEvidenceUpload,
} from "@/lib/api";

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

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "csv",
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "tif", "svg",
  "txt", "rtf", "eml", "zip", "rar",
]);

/* ---- File Preview Overlay ---- */

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

export default function IntakeForm({
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
      case 3: return true;
      case 4: return true;
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
                      Eerder ge\u00fcpload
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
