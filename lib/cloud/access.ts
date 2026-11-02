import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { cloudSQL } from "./client";
import { cloudMode, withOutletState, db, type OutletState } from "../db";
import { DomainError, hash, login, authenticate } from "../auth";
const token = (request: Request, name = "cafeos_session") =>
  request.headers
    .get("cookie")
    ?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] || "";
export function subscriptionAllowed(
  status: string,
  expiresAt: string | Date,
  now = Date.now(),
) {
  if (
    status !== "active" ||
    !Number.isFinite(new Date(expiresAt).getTime()) ||
    new Date(expiresAt).getTime() <= now
  )
    throw new DomainError(
      "Subscription inactive or expired. Contact your platform administrator to renew. Your data is retained.",
      403,
    );
}
export async function throttle(id: string, failed = false) {
  const sql = cloudSQL();
  if (failed) {
    await sql`INSERT INTO cafeos_cloud.attempts(id,count,until_at) VALUES(${id},1,now()+interval '1 minute') ON CONFLICT(id) DO UPDATE SET count=CASE WHEN cafeos_cloud.attempts.until_at>now() THEN cafeos_cloud.attempts.count+1 ELSE 1 END,until_at=now()+interval '1 minute'`;
    return;
  }
  const rows =
    await sql`SELECT count FROM cafeos_cloud.attempts WHERE id=${id} AND until_at>now()`;
  if (rows[0]?.count >= 5)
    throw new DomainError("Too many attempts. Try again in one minute.", 429);
}
export async function outletRequest<T>(
  request: Request,
  write: boolean,
  fn: () => T | Promise<T>,
  outletCode?: string,
): Promise<T> {
  if (!cloudMode()) return fn();
  const sql = cloudSQL(),
    sessionHash = hash(token(request));
  return sql.begin(async (tx) => {
    const rows = outletCode
      ? await tx`SELECT o.*,t.status,t.expires_at,t.created_at AS installed_on FROM cafeos_cloud.outlets o JOIN cafeos_cloud.tenants t ON t.id=o.tenant_id WHERE o.code=${outletCode.toUpperCase()} FOR UPDATE OF o,t`
      : await tx`SELECT o.*,t.status,t.expires_at,t.created_at AS installed_on FROM cafeos_cloud.sessions s JOIN cafeos_cloud.outlets o ON o.id=s.outlet_id JOIN cafeos_cloud.tenants t ON t.id=o.tenant_id WHERE s.token_hash=${sessionHash} AND s.expires_at>now() ${write ? tx`FOR UPDATE OF o,t` : tx``}`;
    const row = rows[0];
    if (!row)
      throw new DomainError(
        outletCode ? "Outlet or account is incorrect" : "Please sign in",
        401,
      );
    subscriptionAllowed(row.status, row.expires_at);
    await tx`SELECT set_config('cafeos.outlet_id',${row.id},true)`;
    await tx.unsafe("SET LOCAL ROLE cafeos_outlet_runtime");
    const scoped =
      await tx`SELECT state FROM cafeos_cloud.outlets WHERE id=${row.id}`;
    if (!scoped[0]) throw new DomainError("Outlet access denied", 403);
    const run = await withOutletState(
      scoped[0].state as OutletState,
      {
        installedOn: row.installed_on,
        expiresAt: row.expires_at,
        tenantId: row.tenant_id,
        outletId: row.id,
        outletCode: row.code,
      },
      fn,
    );
    subscriptionAllowed(row.status, row.expires_at);
    if (write)
      await tx`UPDATE cafeos_cloud.outlets SET state=${tx.json(run.state as any)},version=version+1 WHERE id=${row.id}`;
    await tx.unsafe("RESET ROLE");
    // Login returns its freshly generated opaque session, all other responses remain internal.
    if (outletCode) {
      const result = run.result as { token: string };
      await tx`INSERT INTO cafeos_cloud.sessions(token_hash,outlet_id,expires_at) VALUES(${hash(result.token)},${row.id},now()+interval '8 hours')`;
    }
    return run.result;
  }) as Promise<T>;
}
export async function subscriberLogin(
  request: Request,
  input: { outletCode?: string; id: string; password: string },
) {
  if (!cloudMode()) return login(input.id, input.password);
  if (!input.outletCode) throw new DomainError("Enter your outlet ID");
  const attempt =
    "subscriber:" + hash(input.outletCode.toUpperCase() + ":" + input.id);
  await throttle(attempt);
  try {
    const result = await outletRequest(
      request,
      true,
      () => login(input.id, input.password),
      input.outletCode,
    );
    await cloudSQL()`DELETE FROM cafeos_cloud.attempts WHERE id=${attempt}`;
    return result;
  } catch (e) {
    if (e instanceof DomainError && e.status === 401)
      await throttle(attempt, true);
    throw e;
  }
}
export const credential = (value: string) => {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(value, salt, 32).toString("hex") };
};
export const matches = (value: string, salt: string, digest: string) => {
  const actual = scryptSync(value, salt, 32),
    expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
export async function platformLogin(input: {
  id: string;
  password: string;
  key: string;
}) {
  const sql = cloudSQL(),
    attempt = "platform:" + hash(input.id);
  await throttle(attempt);
  const rows =
    await sql`SELECT * FROM cafeos_cloud.admins WHERE id=${input.id}`;
  const row = rows[0];
  const validPassword = matches(
    input.password,
    row?.salt || "dummy",
    row?.password_hash || "0".repeat(64),
  );
  const validKey = (
    row?.keys || [{ salt: "dummy", hash: "0".repeat(64), active: true }]
  )
    .map((k: any) => matches(input.key, k.salt, k.hash) && k.active)
    .some(Boolean);
  if (!row || !validPassword || !validKey) {
    await throttle(attempt, true);
    throw new DomainError("Admin credentials are incorrect", 401);
  }
  await sql`DELETE FROM cafeos_cloud.attempts WHERE id=${attempt}`;
  const session = randomBytes(32).toString("hex");
  await sql`INSERT INTO cafeos_cloud.admin_sessions VALUES(${hash(session)},${row.id},now()+interval '2 hours')`;
  return session;
}
export async function platformAdmin(request: Request) {
  const rows =
    await cloudSQL()`SELECT a.id,a.name FROM cafeos_cloud.admin_sessions s JOIN cafeos_cloud.admins a ON a.id=s.admin_id WHERE s.token_hash=${hash(token(request, "cafeos_platform"))} AND s.expires_at>now()`;
  if (!rows[0])
    throw new DomainError("Please sign in as a platform administrator", 401);
  return rows[0] as { id: string; name: string };
}
export async function platformAudit(
  actor: string,
  action: string,
  detail: string,
  sql: any = cloudSQL(),
) {
  await sql`INSERT INTO cafeos_cloud.audit(id,actor,action,detail) VALUES(${randomUUID()},${actor},${action},${detail})`;
}
export async function subscriberIdentity(request: Request) {
  const rows =
    await cloudSQL()`SELECT o.id,o.code,o.tenant_id FROM cafeos_cloud.sessions s JOIN cafeos_cloud.outlets o ON o.id=s.outlet_id WHERE s.token_hash=${hash(token(request))} AND s.expires_at>now()`;
  return rows[0];
}
export function manageStaff(
  user: ReturnType<typeof authenticate>,
  input: { id: string; name: string; role: string; password: string },
) {
  if (!["owner", "manager"].includes(user.role))
    throw new DomainError("Your role cannot manage staff", 403);
  if (input.id === "owner" || input.role === "owner")
    throw new DomainError("Owner credentials use account recovery");
  const exists = db
    .prepare("SELECT role FROM users WHERE id=?")
    .get(input.id) as { role: string } | undefined;
  if (exists?.role === "owner")
    throw new DomainError("Owner credentials use account recovery");
  const c = credential(input.password);
  db.prepare(
    "INSERT INTO users(id,name,role,salt,password) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role,salt=excluded.salt,password=excluded.password",
  ).run(input.id, input.name, input.role, c.salt, c.hash);
  db.prepare("DELETE FROM sessions WHERE userId=?").run(input.id);
  const id = randomUUID();
  db.prepare("INSERT INTO audit(id,data) VALUES(?,?)").run(
    id,
    JSON.stringify({
      id,
      actor: user.name,
      action: "staff.saved",
      detail: `${input.id}: ${input.role}; previous sessions revoked`,
      createdAt: new Date().toISOString(),
    }),
  );
}
