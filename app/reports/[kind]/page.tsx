import { headers } from "next/headers";
import { authenticate, DomainError } from "@/lib/auth";
import { reportFor } from "@/lib/reports";
import Print from "./print";
export const dynamic = "force-dynamic";
export default async function ReportPage({
  params, searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{from?:string;to?:string}>;
}) {
  let report;
  try {
    const h = await headers();
    const user = authenticate(
      new Request("http://localhost", {
        headers: { cookie: h.get("cookie") || "" },
      }),
    );
    const { kind } = await params;
    if (!["customers", "customers-marketing", "orders", "inventory", "ca-transactions", "ca-suppliers", "ca-payroll", "ca-stock"].includes(kind)) throw Error();
    const range=await searchParams;
    report = reportFor(user, kind,range.from,range.to);
  } catch (error) {
    return (
      <main className="print-page">
        <h1>{error instanceof DomainError ? error.message : "Sign in with an authorised account to view this report."}</h1>
        <a href="/">Open CaféOS</a>
      </main>
    );
  }
  return (
    <main className="export-print">
      <header>
        <p>CAFÉOS · {report.outlet}</p>
        <h1>{report.title} report</h1>
        <p>
          {report.rows.length} rows · Generated{" "}
          {new Date(report.generatedAt).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          })}{" "}
          IST · Money in INR
        </p>
      </header>
      <Print />
      <table>
        <thead>
          <tr>
            {report.headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!report.rows.length && <p>No records yet.</p>}
    </main>
  );
}
