import {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { db } from "./db";
import type { User, Role } from "./types";
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function permit(user: User, roles: Role[]) {
  if (!roles.includes(user.role))
    throw new DomainError("Your role cannot perform this action", 403);
}
export function login(id: string, password: string) {
  const attempt = db
    .prepare("SELECT count,until FROM login_attempts WHERE id=?")
    .get(id) as { count: number; until: number } | undefined;
  if (attempt && attempt.count >= 5 && attempt.until > Date.now())
    throw new DomainError("Too many attempts. Try again in one minute.", 429);
  const row = db.prepare("SELECT * FROM users WHERE id=?").get(id) as
    (User & { salt: string; password: string }) | undefined;
  const candidate = scryptSync(password, row?.salt || "dummy-salt", 32);
  if (!row || !timingSafeEqual(candidate, Buffer.from(row.password, "hex"))) {
    db.prepare(
      "INSERT INTO login_attempts VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET count=excluded.count,until=excluded.until",
    ).run(
      id,
      (attempt && attempt.until > Date.now() ? attempt.count : 0) + 1,
      Date.now() + 60000,
    );
    throw new DomainError("Account or password is incorrect", 401);
  }
  db.prepare("DELETE FROM login_attempts WHERE id=?").run(id);
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    hash(token),
    row.id,
    Date.now() + 8 * 3600000,
  );
  return { token, user: { id: row.id, name: row.name, role: row.role } };
}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function authenticate(request: Request): User {
  const token =
    request.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)cafeos_session=([^;]+)/)?.[1] || "";
  const r = db
    .prepare(
      "SELECT u.id,u.name,u.role FROM sessions s JOIN users u ON u.id=s.userId WHERE s.token=? AND s.expires>?",
    )
    .get(hash(token), Date.now()) as User | undefined;
  if (!r) throw new DomainError("Please sign in", 401);
  return r;
}
export function changePassword(
  user: User,
  oldPassword: string,
  password: string,
) {
  const row = db
    .prepare("SELECT salt,password FROM users WHERE id=?")
    .get(user.id) as { salt: string; password: string };
  if (
    !timingSafeEqual(
      scryptSync(oldPassword, row.salt, 32),
      Buffer.from(row.password, "hex"),
    )
  )
    throw new DomainError("Current password is incorrect");
  const salt = randomBytes(16).toString("hex");
  db.prepare("UPDATE users SET salt=?,password=? WHERE id=?").run(
    salt,
    scryptSync(password, salt, 32).toString("hex"),
    user.id,
  );
  db.prepare("DELETE FROM sessions WHERE userId=?").run(user.id);
}
