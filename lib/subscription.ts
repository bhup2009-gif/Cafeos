import { db, get } from "./db";
import { indiaDay } from "./types";
export type Subscription = {
  installedOn: string;
  expiresOn: string;
  reminderOn: string;
  daysRemaining: number;
  status: "free" | "renewal-due" | "expired";
  supportPhone: string;
  checkedOn: string;
};
const DAY = 86400000;
const dayTime = (day: string) => Date.parse(`${day}T00:00:00Z`);
// Six calendar months; clamp month-end installations to the last valid day.
export function freeExpiry(installedOn: string) {
  const start = new Date(dayTime(installedOn));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 6, 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(start.getUTCDate(), last));
  return end.toISOString().slice(0, 10);
}
export function subscriptionStatus(installedOn: string, checkedOn: string): Subscription {
  const expiresOn = freeExpiry(installedOn);
  const daysRemaining = Math.round((dayTime(expiresOn) - dayTime(checkedOn)) / DAY);
  return {
    installedOn, expiresOn, checkedOn, daysRemaining,
    reminderOn: new Date(dayTime(expiresOn) - 10 * DAY).toISOString().slice(0, 10),
    status: daysRemaining <= 0 ? "expired" : daysRemaining <= 10 ? "renewal-due" : "free",
    supportPhone: "9713921705",
  };
}
// Called only from runtime requests, never during builds. Stored once per outlet DB.
export function subscriptionSnapshot(now = new Date()) {
  const today = indiaDay(now);
  db.prepare("INSERT OR IGNORE INTO metadata(id,data) VALUES(?,?)")
    .run("subscription", JSON.stringify({ installedOn: today }));
  const stored = get<{ installedOn: string }>("metadata", "subscription")!;
  return subscriptionStatus(stored.installedOn, today);
}
