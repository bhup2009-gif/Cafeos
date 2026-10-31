import {
  reportFor,
  reportCSV,
  reportXLSX,
  reportFilename,
} from "@/lib/reports";
import { paymentQRRecord } from "@/lib/billing";
import { subscriptionSnapshot } from "@/lib/subscription";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, login, DomainError, hash } from "@/lib/auth";
import { db } from "@/lib/db";
import { snapshot, execute } from "@/lib/service";
import { offerRecord, uploadedRaster } from "@/lib/communications";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  if (error instanceof DomainError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof z.ZodError)
    return NextResponse.json(
      {
        error: error.issues
          .map((x) => `${x.path.join(".")}: ${x.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  console.error(error);
  return NextResponse.json(
    {
      error:
        "The operation could not be completed. Your last saved data is safe.",
    },
    { status: 500 },
  );
}
export async function GET(request: NextRequest) {
  try {
    subscriptionSnapshot();
    if (request.nextUrl.pathname === "/api/export") {
      const user = authenticate(request),
        kind = request.nextUrl.searchParams.get("kind"),
        format = request.nextUrl.searchParams.get("format");
      if (
        !kind ||
        !["customers", "customers-marketing", "orders", "inventory", "ca-transactions", "ca-suppliers", "ca-payroll", "ca-stock"].includes(kind) ||
        !format ||
        !["csv", "xlsx"].includes(format)
      )
        throw new DomainError("Choose a valid report and format");
      const report = reportFor(user, kind, request.nextUrl.searchParams.get("from") || undefined, request.nextUrl.searchParams.get("to") || undefined),
        content =
          format === "csv"
            ? reportCSV(report)
            : new Uint8Array(reportXLSX(report));
      return new NextResponse(content, {
        headers: {
          "Content-Type":
            format === "csv"
              ? "text/csv; charset=utf-8"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${reportFilename(kind)}.${format}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    if (
      ["/api/offer-image", "/api/payment-qr"].includes(request.nextUrl.pathname)
    ) {
      authenticate(request);
      const offer =
        request.nextUrl.pathname === "/api/payment-qr"
          ? paymentQRRecord()
          : offerRecord();
      if (!offer) throw new DomainError("No offer banner", 404);
      const { bytes, contentType } = uploadedRaster(offer.image);
      return new NextResponse(new Uint8Array(bytes), {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'",
        },
      });
    }
    if (request.nextUrl.pathname !== "/api/state")
      throw new DomainError("Not found", 404);
    return NextResponse.json(snapshot(authenticate(request)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    let sameOrigin = false;
    try {
      const parsed = new URL(origin || "");
      sameOrigin =
        parsed.host === request.headers.get("host") &&
        ["http:", "https:"].includes(parsed.protocol);
    } catch {}
    if (!sameOrigin)
      throw new DomainError("Cross-origin request rejected", 403);
    subscriptionSnapshot();
    const raw = await request.text();
    if (raw.length > 900000) throw new DomainError("Request too large", 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new DomainError("Invalid JSON");
    }
    const path = request.nextUrl.pathname;
    if (path === "/api/login") {
      const input = z
        .object({
          id: z.enum(["owner", "manager", "cashier", "barista"]),
          password: z.string().min(1).max(200),
        })
        .parse(body);
      const { token, user } = login(input.id, input.password);
      const response = NextResponse.json({ user });
      response.cookies.set("cafeos_session", token, {
        httpOnly: true,
        sameSite: "strict",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 28800,
      });
      return response;
    }
    const user = authenticate(request);
    if (path === "/api/logout") {
      const token = request.cookies.get("cafeos_session")?.value || "";
      db.prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
      const res = NextResponse.json({ ok: true });
      res.cookies.delete("cafeos_session");
      return res;
    }
    if (path !== "/api/command") throw new DomainError("Not found", 404);
    return NextResponse.json({ result: execute(user, body) });
  } catch (e) {
    return failure(e);
  }
}
