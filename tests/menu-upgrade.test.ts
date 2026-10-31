import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { upgradeMenuPhotography } from "../lib/menu-upgrade";
import { menuRank, isMenuImage } from "../lib/menu-assets";
import type { Product, Ingredient } from "../lib/types";

test("photo/menu upgrade adds featured dishes once while preserving custom prices, photos and stock", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE products(id TEXT PRIMARY KEY,data TEXT);CREATE TABLE ingredients(id TEXT PRIMARY KEY,data TEXT);CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,appliedAt TEXT);",
  );
  const photo = "data:image/png;base64,AAAA";
  db.prepare("INSERT INTO products VALUES(?,?)").run(
    "cappuccino",
    JSON.stringify({
      id: "cappuccino",
      price: 20300,
      image: photo,
      name: "Custom coffee",
    }),
  );
  db.prepare("INSERT INTO products VALUES(?,?)").run(
    "chai",
    JSON.stringify({ id: "chai", price: 9700, image: "", name: "Masala Chai" }),
  );
  db.prepare("INSERT INTO ingredients VALUES(?,?)").run(
    "beans",
    JSON.stringify({ id: "beans", stock: 123 }),
  );
  upgradeMenuPhotography(db);
  const get = (table: string, id: string) =>
    JSON.parse(
      (
        db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id) as {
          data: string;
        }
      ).data,
    );
  assert.equal(get("products", "cappuccino").image, photo);
  assert.equal(get("products", "cappuccino").price, 20300);
  assert.equal(get("products", "chai").price, 9700);
  assert.equal(get("products", "chai").image, "/menu/chai-v1.webp");
  assert.equal(get("ingredients", "beans").stock, 123);
  for (const id of ["pizza", "samosa", "pizza-combo"])
    assert.ok(get("products", id).price > 0);
  const dishes = (
    db.prepare("SELECT data FROM products").all() as { data: string }[]
  )
    .map((x) => JSON.parse(x.data) as Product)
    .sort((a, b) => menuRank(a.id) - menuRank(b.id));
  assert.deepEqual(
    dishes.slice(0, 4).map((p) => p.id),
    ["pizza", "chai", "samosa", "pizza-combo"],
  );
  const pizzaDough = get("ingredients", "pizzaDough") as Ingredient;
  pizzaDough.stock = 7;
  db.prepare("UPDATE ingredients SET data=? WHERE id=?").run(
    JSON.stringify(pizzaDough),
    "pizzaDough",
  );
  upgradeMenuPhotography(db);
  assert.equal(get("ingredients", "pizzaDough").stock, 7);
  assert.equal(
    (
      db.prepare("SELECT COUNT(*) AS count FROM products").get() as {
        count: number;
      }
    ).count,
    14,
  );
  assert.ok(isMenuImage("/menu/pizza-v1.webp"));
  assert.equal(isMenuImage("/menu/../../private.webp"), false);
  db.close();
});
