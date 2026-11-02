import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes, randomUUID } from "node:crypto";
import { cloudSQL } from "@/lib/cloud/client";
import {
  platformAdmin,
  platformLogin,
  platformAudit,
  credential,
  matches,
} from "@/lib/cloud/access";
import { createOutletState, cloudMode, withOutletState, db } from "@/lib/db";
import { DomainError, hash } from "@/lib/auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function fail(e: unknown) {
  return NextResponse.json(
    {
      error:
        e instanceof DomainError
          ? e.message
          : e instanceof z.ZodError
            ? e.issues.map((i) => i.message).join("; ")
            : "Platform operation failed. No credentials were logged.",
    },
    {
      status:
        e instanceof DomainError
          ? e.status
          : e instanceof z.ZodError
            ? 400
            : 500,
    },
  );
}
const noStore = { "Cache-Control": "private, no-store" };
export async function GET(req: NextRequest) {
  try {
    if (!cloudMode())
      throw new DomainError("Platform management requires cloud mode", 503);
    const admin = await platformAdmin(req),
      sql = cloudSQL();
    const tenants =
      await sql`SELECT t.id,t.name,t.plan,t.status,t.expires_at,t.created_at,t.max_outlets,coalesce(jsonb_agg(jsonb_build_object('id',o.id,'code',o.code,'name',o.name)) FILTER (WHERE o.id IS NOT NULL),'[]'::jsonb) AS outlets FROM cafeos_cloud.tenants t LEFT JOIN cafeos_cloud.outlets o ON o.tenant_id=t.id GROUP BY t.id ORDER BY t.created_at DESC`;
    const audit =
      await sql`SELECT actor,action,detail,created_at FROM cafeos_cloud.audit ORDER BY created_at DESC LIMIT 50`;
    return NextResponse.json({ admin, tenants, audit }, { headers: noStore });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    if (!cloudMode())
      throw new DomainError("Platform management requires cloud mode", 503);
    let sameOrigin = false;
    try {
      const origin = new URL(req.headers.get("origin") || "");
      sameOrigin =
        origin.host === req.headers.get("host") &&
        ["http:", "https:"].includes(origin.protocol);
    } catch {}
    if (!sameOrigin)
      throw new DomainError("Cross-origin request rejected", 403);
    const raw = await req.text();
    if (raw.length > 20000) throw new DomainError("Request too large", 413);
    const body = JSON.parse(raw),
      sql = cloudSQL();
    if (body.action === "login") {
      const p = z
        .object({
          id: z.string().min(1).max(80),
          password: z.string().min(1).max(200),
          key: z.string().min(1).max(200),
        })
        .parse(body);
      const token = await platformLogin(p),
        res = NextResponse.json({ ok: true }, { headers: noStore });
      res.cookies.set("cafeos_platform", token, {
        httpOnly: true,
        secure: req.nextUrl.protocol === "https:",
        sameSite: "strict",
        path: "/",
        maxAge: 7200,
      });
      return res;
    }
    const admin = await platformAdmin(req);
    if (body.action === "logout") {
      await sql`DELETE FROM cafeos_cloud.admin_sessions WHERE token_hash=${hash(req.cookies.get("cafeos_platform")?.value || "")}`;
      const res = NextResponse.json({ ok: true });
      res.cookies.delete("cafeos_platform");
      return res;
    }
    if (body.action === "create") {
      const p = z
        .object({
          name: z.string().trim().min(1).max(80),
          outletName: z.string().trim().min(1).max(80),
          code: z
            .string()
            .trim()
            .regex(/^[A-Za-z0-9_-]{3,30}$/),
          plan: z.string().trim().min(1).max(40),
          expiresAt: z.string().datetime({ offset: true }),
          ownerPassword: z.string().min(12).max(200),
          maxOutlets: z.coerce.number().int().min(1).max(500).default(1),
        })
        .parse(body);
      if (Date.parse(p.expiresAt) <= Date.now())
        throw new DomainError("Choose a future expiry");
      const id = randomUUID(),
        outlet = randomUUID(),
        state = createOutletState(p.outletName, p.ownerPassword);
      await sql.begin(async (tx) => {
        await tx`INSERT INTO cafeos_cloud.tenants(id,name,plan,status,expires_at,max_outlets) VALUES(${id},${p.name},${p.plan},'active',${p.expiresAt},${p.maxOutlets})`;
        await tx`INSERT INTO cafeos_cloud.outlets(id,tenant_id,code,name,state) VALUES(${outlet},${id},${p.code.toUpperCase()},${p.outletName},${tx.json(state as any)})`;
        await platformAudit(
          admin.id,
          "subscriber.created",
          `${p.name}; outlet ${p.code.toUpperCase()}`,
          tx,
        );
      });
      return NextResponse.json({ ok: true }, { headers: noStore });
    }
    if (body.action === "subscription") {
      const p = z
        .object({
          tenantId: z.string().uuid(),
          status: z.enum(["active", "suspended"]),
          expiresAt: z.string().datetime({ offset: true }),
          plan: z.string().trim().min(1).max(40),
          maxOutlets: z.coerce.number().int().min(1).max(500),
        })
        .parse(body);
      await sql.begin(async (tx) => {
        const changed =
          await tx`UPDATE cafeos_cloud.tenants SET status=${p.status},expires_at=${p.expiresAt},plan=${p.plan},max_outlets=${p.maxOutlets} WHERE id=${p.tenantId} RETURNING id`;
        if (!changed[0]) throw new DomainError("Subscriber not found", 404);
        await platformAudit(
          admin.id,
          "subscription.updated",
          `${p.tenantId}: ${p.status}; ${p.expiresAt}; data retained`,
          tx,
        );
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "outlet") {
      const p = z
        .object({
          tenantId: z.string().uuid(),
          name: z.string().trim().min(1).max(80),
          code: z.string().regex(/^[A-Za-z0-9_-]{3,30}$/),
          ownerPassword: z.string().min(12).max(200),
        })
        .parse(body);
      const state = createOutletState(p.name, p.ownerPassword);
      await sql.begin(async (tx) => {
        const t =
          await tx`SELECT id,max_outlets FROM cafeos_cloud.tenants WHERE id=${p.tenantId} FOR UPDATE`;
        if (!t[0]) throw new DomainError("Subscriber not found", 404);
        const [count] =
          await tx`SELECT count(*)::integer AS count FROM cafeos_cloud.outlets WHERE tenant_id=${p.tenantId}`;
        if (count.count >= t[0].max_outlets)
          throw new DomainError(
            "Outlet limit reached. Update the subscription limit first.",
          );
        await tx`INSERT INTO cafeos_cloud.outlets(id,tenant_id,code,name,state) VALUES(${randomUUID()},${p.tenantId},${p.code.toUpperCase()},${p.name},${tx.json(state as any)})`;
        await platformAudit(
          admin.id,
          "outlet.created",
          `${p.tenantId}: ${p.code.toUpperCase()}`,
          tx,
        );
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "resetOwner") {
      const p = z
        .object({
          outletId: z.string().uuid(),
          password: z.string().min(12).max(200),
        })
        .parse(body);
      await sql.begin(async (tx) => {
        const [o] =
          await tx`SELECT * FROM cafeos_cloud.outlets WHERE id=${p.outletId} FOR UPDATE`;
        if (!o) throw new DomainError("Outlet not found", 404);
        const digest = credential(p.password);
        const run = await withOutletState(o.state, undefined, () => {
          db.prepare("UPDATE users SET salt=?,password=? WHERE id=?").run(
            digest.salt,
            digest.hash,
            "owner",
          );
          db.prepare("DELETE FROM sessions WHERE userId=?").run("owner");
        });
        await tx`UPDATE cafeos_cloud.outlets SET state=${tx.json(run.state as any)},version=version+1 WHERE id=${o.id}`;
        await platformAudit(admin.id, "owner.password.reset", o.code, tx);
      });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "replaceKey") {
      const p = z
        .object({
          password: z.string().max(200),
          key: z.string().max(200),
          slot: z.number().int().min(0).max(2),
        })
        .parse(body);
      const newKey = randomBytes(24).toString("base64url");
      await sql.begin(async (tx) => {
        const [a] =
          await tx`SELECT * FROM cafeos_cloud.admins WHERE id=${admin.id} FOR UPDATE`;
        if (
          !matches(p.password, a.salt, a.password_hash) ||
          !a.keys
            .map((k: any) => matches(p.key, k.salt, k.hash) && k.active)
            .some(Boolean)
        )
          throw new DomainError("Current credentials are incorrect", 401);
        const keys = [...a.keys];
        keys[p.slot] = { ...credential(newKey), active: true };
        await tx`UPDATE cafeos_cloud.admins SET keys=${tx.json(keys)} WHERE id=${admin.id}`;
        await tx`DELETE FROM cafeos_cloud.admin_sessions WHERE admin_id=${admin.id}`;
        await platformAudit(
          admin.id,
          "admin.key.replaced",
          `Slot ${p.slot + 1}; sessions revoked`,
          tx,
        );
      });
      const res = NextResponse.json({ key: newKey }, { headers: noStore });
      res.cookies.delete("cafeos_platform");
      return res;
    }
    throw new DomainError("Unknown platform action");
  } catch (e) {
    if ((e as { code?: string })?.code === "23505")
      return fail(new DomainError("That outlet ID already exists", 409));
    return fail(e);
  }
}
