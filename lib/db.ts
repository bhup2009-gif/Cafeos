import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { products, ingredients } from "./seed";
import { upgradeMenuPhotography } from "./menu-upgrade";
const directory = process.env.CAFEOS_DATA_DIR || join(process.cwd(), "data");
mkdirSync(directory, { recursive: true, mode: 0o700 });
const globalDB = globalThis as unknown as { cafeDB?: DatabaseSync };
export const db =
  globalDB.cafeDB ?? new DatabaseSync(join(directory, "cafeos.sqlite"));
globalDB.cafeDB = db;
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT,role TEXT,salt TEXT,password TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,userId TEXT REFERENCES users(id),expires INTEGER);
CREATE TABLE IF NOT EXISTS login_attempts(id TEXT PRIMARY KEY,count INTEGER,until INTEGER);
CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ingredients(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,number INTEGER UNIQUE,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tickets(id TEXT PRIMARY KEY,orderId TEXT REFERENCES orders(id),data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS closings(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,actor TEXT,fingerprint TEXT,response TEXT);
CREATE TABLE IF NOT EXISTS metadata(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pantry_suppliers(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pantry_purchases(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pantry_expenses(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pantry_payments(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS salary_profiles(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS salary_accruals(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS stock_changes(id TEXT PRIMARY KEY,data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,appliedAt TEXT);
INSERT OR IGNORE INTO schema_migrations VALUES(1,datetime('now'));
`);
if (!db.prepare("SELECT id FROM users LIMIT 1").get()) {
  const credentials: string[] = [
    "CaféOS local starter accounts. Change passwords in Staff before operational use.",
  ];
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const [id, name, role] of [
      ["owner", "Aarav Shah", "owner"],
      ["manager", "Meera Patel", "manager"],
      ["cashier", "Riya Desai", "cashier"],
      ["barista", "Kabir Singh", "barista"],
    ]) {
      const salt = randomBytes(16).toString("hex");
      const password =
        process.env.CAFEOS_DEMO_PASSWORD ||
        randomBytes(9).toString("base64url");
      db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(
        id,
        name,
        role,
        salt,
        scryptSync(password, salt, 32).toString("hex"),
      );
      credentials.push(`${id}: ${password}`);
    }
    for (const p of products)
      db.prepare("INSERT INTO products VALUES(?,?)").run(
        p.id,
        JSON.stringify(p),
      );
    for (const i of ingredients)
      db.prepare("INSERT INTO ingredients VALUES(?,?)").run(
        i.id,
        JSON.stringify(i),
      );
    db.prepare("INSERT INTO metadata VALUES(?,?)").run(
      "settings",
      JSON.stringify({
        taxLabel: "Demo tax",
        loyaltyEvery: 10000,
        outlet: "The Daily Grind",
      }),
    );
    db.exec("COMMIT");
    if (!existsSync(join(directory, "starter-credentials.txt")))
      writeFileSync(
        join(directory, "starter-credentials.txt"),
        credentials.join("\n"),
        { mode: 0o600 },
      );
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
upgradeMenuPhotography(db);

const tables = new Set([
  "products",
  "ingredients",
  "orders",
  "tickets",
  "customers",
  "audit",
  "closings",
  "metadata",
  "stock_changes",
  "salary_profiles", "salary_accruals",
  "pantry_suppliers", "pantry_purchases", "pantry_expenses", "pantry_payments",
]);
export function all<T>(table: string): T[] {
  if (!tables.has(table)) throw Error("Invalid table");
  return (
    db.prepare(`SELECT data FROM ${table}`).all() as { data: string }[]
  ).map((x) => JSON.parse(x.data));
}
export function get<T>(table: string, id: string): T | undefined {
  if (!tables.has(table)) throw Error("Invalid table");
  const r = db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id) as
    { data: string } | undefined;
  return r ? JSON.parse(r.data) : undefined;
}
export function put(table: string, id: string, data: unknown) {
  if (!tables.has(table) || table === "orders") throw Error("Invalid table");
  db.prepare(
    `INSERT INTO ${table}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
  ).run(id, JSON.stringify(data));
}
export function putOrder(data: { id: string; number: number }) {
  db.prepare(
    "INSERT INTO orders(id,number,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
  ).run(data.id, data.number, JSON.stringify(data));
}
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
