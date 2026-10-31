"use client";
import { useEffect, useState } from "react";
import {
  FileText,
  FileSpreadsheet,
  Mail,
  Maximize,
  Minimize,
} from "lucide-react";
export function FullscreenButton() {
  const [full, setFull] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const sync = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  return (
    <>
      <button
        className="theme-trigger fullscreen-trigger"
        aria-label={full ? "Exit fullscreen" : "Enter fullscreen"}
        title={full ? "Exit fullscreen" : "Fullscreen"}
        onClick={async () => {
          try {
            setError("");
            if (document.fullscreenElement) await document.exitFullscreen();
            else if (document.documentElement.requestFullscreen)
              await document.documentElement.requestFullscreen();
            else
              setError("Use your browser’s fullscreen command on this device.");
          } catch {
            setError("Use your browser’s fullscreen command on this device.");
          }
        }}
      >
        {full ? <Minimize size={18} /> : <Maximize size={18} />}
      </button>
      {error && (
        <span
          role="status"
          className="fullscreen-error"
          onClick={() => setError("")}
        >
          {error}
        </span>
      )}
    </>
  );
}
export function ExportTools({
  kind,
  online,
}: {
  kind: "orders" | "inventory";
  online: boolean;
}) {
  const [email, setEmail] = useState(false),
    [to, setTo] = useState(""),
    [format, setFormat] = useState("xlsx");
  const label = kind === "orders" ? "Orders" : "Inventory";
  return (
    <section className="export-tools" aria-label={`${label} export options`}>
      <div className="export-buttons">
        <a
          aria-disabled={!online}
          className="export-pdf"
          href={online ? `/reports/${kind}` : undefined}
          target="_blank"
          rel="noreferrer"
          title="Open printable report and save as PDF"
        >
          <FileText size={18} /> PDF
        </a>
        <a
          aria-disabled={!online}
          href={online ? `/api/export?kind=${kind}&format=csv` : undefined}
        >
          <FileText size={18} /> CSV
        </a>
        <a
          aria-disabled={!online}
          href={online ? `/api/export?kind=${kind}&format=xlsx` : undefined}
        >
          <FileSpreadsheet size={18} /> Excel
        </a>
        <button
          disabled={!online}
          onClick={() => setEmail(!email)}
          aria-expanded={email}
        >
          <Mail size={18} /> Email
        </button>
      </div>
      {!online && (
        <small>Connect to the café server to export current records.</small>
      )}
      {email && (
        <form
          className="email-export"
          onSubmit={(e) => {
            e.preventDefault();
            if (!online) return;
            const link = document.createElement("a");
            link.href = `/api/export?kind=${kind}&format=${format}`;
            link.download = "";
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`CaféOS ${label} report`)}&body=${encodeURIComponent(`Hi,\n\nPlease find the CaféOS ${label.toLowerCase()} report attached.\n\nThank you.`)}`;
          }}
        >
          <label>
            Recipient email
            <input
              type="email"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="manager@example.com"
            />
          </label>
          <label>
            Attachment format
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="xlsx">Excel (.xlsx)</option>
              <option value="csv">CSV (.csv)</option>
            </select>
          </label>
          <p>
            Downloads the report and opens your email app. Attach the downloaded
            file before sending.
          </p>
          <button className="primary compact" disabled={!online}>
            Download & open email
          </button>
        </form>
      )}
    </section>
  );
}
