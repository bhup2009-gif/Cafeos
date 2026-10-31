import type { DatabaseSync } from "node:sqlite";
import type { Product } from "./types";
import { products, ingredients } from "./seed";
import { menuImages, isMenuImage } from "./menu-assets";

/** Add the requested dishes/photos once, without resetting staff-edited prices or stock. */
export function upgradeMenuPhotography(database: DatabaseSync) {
  database.exec("BEGIN IMMEDIATE");
  try {
    if (
      database
        .prepare("SELECT version FROM schema_migrations WHERE version=2")
        .get()
    ) {
      database.exec("COMMIT");
      return;
    }
    for (const ingredient of ingredients) {
      database
        .prepare("INSERT OR IGNORE INTO ingredients(id,data) VALUES(?,?)")
        .run(ingredient.id, JSON.stringify(ingredient));
    }
    for (const product of products) {
      const row = database
        .prepare("SELECT data FROM products WHERE id=?")
        .get(product.id) as { data: string } | undefined;
      if (!row)
        database
          .prepare("INSERT INTO products(id,data) VALUES(?,?)")
          .run(product.id, JSON.stringify(product));
      else {
        const existing = JSON.parse(row.data) as Product;
        if (!existing.image || isMenuImage(existing.image)) {
          database
            .prepare("UPDATE products SET data=? WHERE id=?")
            .run(
              JSON.stringify({ ...existing, image: menuImages[product.id] }),
              product.id,
            );
        }
      }
    }
    database
      .prepare("INSERT INTO schema_migrations(version,appliedAt) VALUES(2,?)")
      .run(new Date().toISOString());
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
