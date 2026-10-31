import { caReport, caReportKinds } from "./ca-reports";
import { all, get } from "./db";
import { permit } from "./auth";
import {
  indiaDay,
  orderServiceLabel,
  type User,
  type Order,
  type Ingredient,
  type AppData,
} from "./types";
export type Report = {
  title: string;
  outlet: string;
  generatedAt: string;
  headers: string[];
  rows: (string | number)[][];
};
export function reportFor(user: User, kind: string, from?: string, to?: string): Report {
  if (caReportKinds.includes(kind)) return caReport(user,kind,from,to);
  const base = {
    outlet: get<AppData["settings"]>("metadata", "settings")!.outlet,
    generatedAt: new Date().toISOString(),
  };
  if (kind === "customers" || kind === "customers-marketing") {
    permit(user, ["owner", "manager"]);
    return {...base, title: kind === "customers" ? "Customer contacts" : "Customers with marketing consent",
      headers: ["Name", "Phone", "Email", "Marketing consent", "Consent recorded", "Visits"],
      rows: all<AppData["customers"][number]>("customers").filter(c => kind !== "customers-marketing" || c.marketingConsent === true).sort((a,b)=>a.name.localeCompare(b.name)).map(c=>[c.name,c.phone || "",c.email || "",c.marketingConsent ? "Yes" : "No",c.consentAt || "",c.visits])};
  }
  if (kind === "orders") {
    permit(user, ["owner", "manager", "cashier"]);
    return {
      ...base,
      title: "Orders",
      headers: [
        "Order",
        "Created (India)",
        "Invoice",
        "Service",
        "Customer",
        "Subtotal (INR)",
        "Discount (INR)",
        "Tax (INR)",
        "Total (INR)",
        "Refund (INR)",
        "Status",
        "Payment methods",
      ],
      rows: all<Order>("orders")
        .sort((a, b) => b.number - a.number)
        .map((o) => [
          o.number,
          new Date(o.createdAt).toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
          }),
          o.invoice || "",
          orderServiceLabel(o),
          o.customer || "Walk-in",
          o.subtotal / 100,
          o.discount / 100,
          o.tax / 100,
          o.total / 100,
          o.refund / 100,
          o.status,
          o.payments.map((p) => p.method).join(" + "),
        ]),
    };
  }
  permit(user, ["owner", "manager"]);
  if (kind !== "inventory") throw Error("Unknown report");
  return {
    ...base,
    title: "Inventory",
    headers: [
      "Ingredient",
      "Unit",
      "On hand",
      "Reorder level",
      "Health",
      "Unit cost (INR)",
      "Stock value (INR)",
    ],
    rows: all<Ingredient>("ingredients").map((i) => [
      i.name,
      i.unit,
      i.stock,
      i.low,
      i.stock < i.low ? "Running low" : "Well stocked",
      i.cost / 100,
      Math.round(i.stock * i.cost) / 100,
    ]),
  };
}
// Prefix formula-like CSV cells so spreadsheet software treats user text as text.
export function csvCell(v: string | number) {
  const text = String(v);
  return (
    '"' +
    (typeof v === "string" && /^[\s]*[=+\-@\t\r]/.test(text)
      ? "'" + text
      : text
    ).replaceAll('"', '""') +
    '"'
  );
}
export const reportCSV = (r: Report) =>
  "\ufeff" +
  [r.headers, ...r.rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
const xml = (v: string) =>
  v
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
// Open XML workbook in an uncompressed ZIP container; no server-side spreadsheet runtime needed.
function zip(files: Record<string, string>) {
  const entries: Buffer[] = [],
    central: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const n = Buffer.from(name),
      d = Buffer.from(value),
      crc = crc32(d);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50);
    h.writeUInt16LE(20, 4);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(d.length, 18);
    h.writeUInt32LE(d.length, 22);
    h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(d.length, 20);
    c.writeUInt32LE(d.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    entries.push(h, n, d);
    central.push(c, n);
    offset += h.length + n.length + d.length;
  }
  const cd = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...entries, cd, end]);
}
export function reportXLSX(r: Report) {
  const column = (n: number) => {
    let s = "";
    for (n++; n; n = Math.floor((n - 1) / 26))
      s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  };
  const rows = [r.headers, ...r.rows]
    .map(
      (row, i) =>
        `<row r="${i + 1}">${row.map((v, j) => (typeof v === "number" ? `<c r="${column(j)}${i + 1}"><v>${v}</v></c>` : `<c r="${column(j)}${i + 1}" t="inlineStr"><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`)).join("")}</row>`,
    )
    .join("");
  return zip({
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels":
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(r.title)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels":
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols>${r.headers.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="23" customWidth="1"/>`).join("")}</cols><sheetData>${rows}</sheetData><autoFilter ref="A1:${column(r.headers.length - 1)}${r.rows.length + 1}"/></worksheet>`,
  });
}
export const reportFilename = (kind: string) => `cafeos-${kind}-${indiaDay()}`;
