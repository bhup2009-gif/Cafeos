"use client";
export default function Print() {
  return (
    <div className="print-controls">
      <button className="primary" onClick={() => window.print()}>
        Print receipt / Save as PDF
      </button>
      <a href="/">Return to CaféOS</a>
    </div>
  );
}
