import { randomUUID } from "node:crypto";
import { z } from "zod";
import { get, put } from "./db";
import { DomainError, permit } from "./auth";
import {
  indiaDay,
  type User,
  type OfferBanner,
  type OfferRecord,
  type TeamNotice,
} from "./types";
const date = z.iso.date();
const author = (user: User) => ({
  id: user.id,
  name: user.name,
  role: user.role as "owner" | "manager",
});
export function uploadedRaster(image: string) {
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match) throw new DomainError("Choose a PNG, JPEG or WebP image");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 600000)
    throw new DomainError(
      "Please use an image smaller than 600 KB after processing",
    );
  const valid =
    match[1] === "png"
      ? bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
      : match[1] === "jpeg"
        ? bytes.subarray(0, 3).toString("hex") === "ffd8ff"
        : bytes.subarray(0, 4).toString() === "RIFF" &&
          bytes.subarray(8, 12).toString() === "WEBP";
  if (!valid)
    throw new DomainError("The image content does not match its file type");
  return { bytes, contentType: `image/${match[1]}` };
}
export function offerRecord() {
  return get<OfferRecord>("metadata", "offerBanner") || null;
}
export function visibleOffer(): OfferBanner | null {
  const record = offerRecord(),
    today = indiaDay();
  if (
    !record ||
    !record.active ||
    record.startsOn > today ||
    record.endsOn < today
  )
    return null;
  const { image, ...banner } = record;
  return { ...banner, imageUrl: `/api/offer-image?v=${record.version}` };
}
export function offerForEditor(user: User): OfferBanner | null {
  if (user.role !== "owner") return null;
  const record = offerRecord();
  if (!record) return null;
  const { image, ...banner } = record;
  return { ...banner, imageUrl: `/api/offer-image?v=${record.version}` };
}
export function saveOffer(user: User, payload: unknown): OfferBanner {
  permit(user, ["owner"]);
  const p = z
    .object({
      version: z.number().int().min(0),
      title: z.string().trim().min(1).max(80),
      image: z.string().max(810000).optional(),
      startsOn: date,
      endsOn: date,
    })
    .parse(payload);
  if (p.endsOn < p.startsOn)
    throw new DomainError("The end date must be on or after the start date");
  const old = offerRecord();
  if (p.version !== (old?.version || 0))
    throw new DomainError(
      "The offer changed. Reopen the editor to use the latest version.",
      409,
    );
  const image = p.image || old?.image;
  if (!image) throw new DomainError("Upload an offer banner image first");
  uploadedRaster(image);
  const record: OfferRecord = {
    title: p.title,
    image,
    startsOn: p.startsOn,
    endsOn: p.endsOn,
    active: true,
    version: (old?.version || 0) + 1,
    author: author(user),
    updatedAt: new Date().toISOString(),
  };
  put("metadata", "offerBanner", record);
  return offerForEditor(user)!;
}
export function hideOffer(user: User, payload: unknown) {
  permit(user, ["owner"]);
  const p = z.object({ version: z.number().int().min(1) }).parse(payload);
  const old = offerRecord();
  if (!old) throw new DomainError("No offer has been uploaded", 404);
  if (p.version !== old.version)
    throw new DomainError("The offer changed. Reopen the editor.", 409);
  put("metadata", "offerBanner", {
    ...old,
    active: false,
    version: old.version + 1,
    author: author(user),
    updatedAt: new Date().toISOString(),
  });
  return { ok: true };
}
function storedNotices() {
  return get<TeamNotice[]>("metadata", "teamNotices") || [];
}
export function teamNotices() {
  const today = indiaDay();
  return storedNotices()
    .filter((n) => !n.archived && (!n.expiresOn || n.expiresOn >= today))
    .sort(
      (a, b) =>
        Number(b.priority === "important") -
          Number(a.priority === "important") ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
}
export function saveNotice(user: User, payload: unknown): TeamNotice {
  permit(user, ["owner", "manager"]);
  const p = z
    .object({
      id: z.string().max(100).optional(),
      version: z.number().int().min(0),
      message: z.string().trim().min(1).max(500),
      priority: z.enum(["normal", "important"]),
      expiresOn: date.nullable(),
    })
    .parse(payload);
  if (p.expiresOn && p.expiresOn < indiaDay())
    throw new DomainError("Choose today or a future expiry date");
  const notices = storedNotices();
  const old = p.id ? notices.find((n) => n.id === p.id) : undefined;
  if (p.id && !old) throw new DomainError("Notice not found", 404);
  if (old?.archived)
    throw new DomainError("This notice has been archived", 409);
  if (old && old.author.id !== user.id)
    throw new DomainError("You can edit your own team notices only", 403);
  if (p.version !== (old?.version || 0))
    throw new DomainError("The notice changed. Reopen it before editing.", 409);
  const now = new Date().toISOString();
  const notice: TeamNotice = {
    id: old?.id || randomUUID(),
    message: p.message,
    priority: p.priority,
    expiresOn: p.expiresOn,
    version: (old?.version || 0) + 1,
    author: old?.author || author(user),
    createdAt: old?.createdAt || now,
    updatedAt: now,
    archived: false,
  };
  put(
    "metadata",
    "teamNotices",
    old
      ? notices.map((n) => (n.id === old.id ? notice : n))
      : [...notices, notice],
  );
  return notice;
}
export function archiveNotice(user: User, payload: unknown) {
  permit(user, ["owner", "manager"]);
  const p = z
    .object({ id: z.string(), version: z.number().int().min(1) })
    .parse(payload);
  const notices = storedNotices(),
    old = notices.find((n) => n.id === p.id);
  if (!old) throw new DomainError("Notice not found", 404);
  if (user.role !== "owner" && old.author.id !== user.id)
    throw new DomainError("You can archive your own team notices only", 403);
  if (p.version !== old.version)
    throw new DomainError("The notice changed. Refresh the team board.", 409);
  put(
    "metadata",
    "teamNotices",
    notices.map((n) =>
      n.id === old.id
        ? {
            ...n,
            archived: true,
            version: n.version + 1,
            updatedAt: new Date().toISOString(),
          }
        : n,
    ),
  );
  return { ok: true };
}
