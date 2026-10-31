"use client";
import { useEffect } from "react";
export default function ReportPrint() {
  useEffect(() => {
    document.title = "CaféOS report";
  }, []);
  return (
    <div className="print-controls">
      <button className="primary" onClick={() => window.print()}>
        Print / Save as PDF
      </button>
      <a href="/">Return to CaféOS</a>
    </div>
  );
}
