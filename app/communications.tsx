"use client";
import { useState, type FormEvent } from "react";
import {
  Megaphone,
  ImagePlus,
  Upload,
  Edit3,
  Archive,
  AlertTriangle,
  Crown,
  ShieldCheck,
  Plus,
  Clock,
  Check,
} from "lucide-react";
import {
  indiaDay,
  type OfferBanner,
  type TeamNotice,
  type User,
} from "@/lib/types";
export function AuthorTag({
  author,
}: {
  author: { name: string; role: "owner" | "manager" };
}) {
  return (
    <span
      className={`author-tag author-${author.role}`}
      title={`${author.name} · ${author.role}`}
    >
      {author.role === "owner" ? (
        <Crown size={11} />
      ) : (
        <ShieldCheck size={11} />
      )}
      <span>{author.role === "owner" ? "Owner" : "Manager"}</span>
    </span>
  );
}
export function TeamNoticeStrip({
  notices,
  canWrite,
  onOpen,
}: {
  notices: TeamNotice[];
  canWrite: boolean;
  onOpen: () => void;
}) {
  const current = notices[0];
  return (
    <button
      className={`team-notice-strip ${current?.priority === "important" ? "is-important" : ""}`}
      aria-label="Team notices"
      onClick={onOpen}
    >
      <Megaphone size={17} />
      {current ? (
        <>
          <span className="top-notice-copy">
            {current.priority === "important" && <strong>Attention</strong>}
            <span>{current.message}</span>
          </span>
          <AuthorTag author={current.author} />
          {notices.length > 1 && (
            <span className="notice-count">+{notices.length - 1}</span>
          )}
        </>
      ) : (
        <span className="top-notice-empty">
          {canWrite ? "Share an update with your team" : "No team notices yet"}
          <span>
            {canWrite
              ? "Owner & manager notices"
              : "Updates from your owner and manager appear here"}
          </span>
        </span>
      )}
      {canWrite && !current && <Plus size={15} />}
    </button>
  );
}
export function OfferSlot({
  offer,
  owner,
  hasSaved,
  onEdit,
}: {
  offer: OfferBanner | null;
  owner: boolean;
  hasSaved: boolean;
  onEdit: () => void;
}) {
  if (!offer && !owner) return null;
  return (
    <section
      className={`offer-slot ${!offer ? "offer-placeholder" : ""}`}
      aria-label="Today's offer"
    >
      {offer ? (
        <>
          <img src={offer.imageUrl} alt={offer.title} />
          <div className="offer-caption">
            <span>{offer.title}</span>
            {owner && (
              <button onClick={onEdit} aria-label="Edit offer banner">
                <Edit3 size={13} /> Edit
              </button>
            )}
          </div>
        </>
      ) : (
        <button className="offer-upload-prompt" onClick={onEdit}>
          <span className="offer-upload-icon">
            <ImagePlus size={22} />
          </span>
          <span>
            <strong>
              {hasSaved
                ? "Manage your offer banner"
                : "Today’s offer, front and centre."}
            </strong>
            <small>
              {hasSaved
                ? "Schedule, replace or show your uploaded banner"
                : "Upload an offer image for everyone to see"}
            </small>
          </span>
          <Plus size={17} />
        </button>
      )}
    </section>
  );
}
export async function prepareBanner(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw Error("Choose a JPG, PNG or WebP image.");
  if (file.size > 12000000) throw Error("Choose an image smaller than 12 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      2400 / image.naturalWidth,
      1200 / image.naturalHeight,
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw Error("Image processing is unavailable in this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.8, 0.7, 0.6]) {
      const data = canvas.toDataURL("image/webp", quality);
      if (data.length < 800000) return data;
    }
    throw Error("Please choose a simpler or smaller banner image.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function OfferEditor({
  offer,
  busy,
  online,
  onSave,
  onHide,
}: {
  offer: OfferBanner | null;
  busy: boolean;
  online: boolean;
  onSave: (value: unknown) => void;
  onHide: () => void;
}) {
  const [title, setTitle] = useState(offer?.title || "Today’s offer"),
    [startsOn, setStartsOn] = useState(offer?.startsOn || indiaDay()),
    [endsOn, setEndsOn] = useState(offer?.endsOn || indiaDay()),
    [image, setImage] = useState<string | undefined>(),
    [processing, setProcessing] = useState(false),
    [error, setError] = useState("");
  const preview = image || offer?.imageUrl;
  return (
    <form
      className="offer-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (!preview) {
          setError("Upload a banner image first.");
          return;
        }
        onSave({
          version: offer?.version || 0,
          title,
          startsOn,
          endsOn,
          ...(image ? { image } : {}),
        });
      }}
    >
      <p className="muted">
        Put today’s special where your team can see it. The banner appears above
        the menu during its scheduled dates.
      </p>
      <label>
        Offer banner image
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setProcessing(true);
            setError("");
            try {
              setImage(await prepareBanner(file));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setProcessing(false);
            }
          }}
        />
      </label>
      <small className="muted">
        Wide images work best · JPG, PNG or WebP · up to 12 MB. We optimise the
        image for the counter screen.
      </small>
      {processing && (
        <p className="muted" role="status">
          Preparing your banner…
        </p>
      )}
      {preview && (
        <div className="offer-image-preview">
          <img src={preview} alt="Offer banner preview" />
        </div>
      )}
      <label>
        Offer title
        <input
          required
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className="form-grid">
        <label>
          Show from
          <input
            required
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
        </label>
        <label>
          Show until
          <input
            required
            type="date"
            min={startsOn}
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
          />
        </label>
      </div>
      <p className="offer-explainer">
        Dates use café time (India). The banner is visual only; prices and
        discounts are managed separately.
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <button className="primary" disabled={busy || processing || !online}>
        <Upload size={16} />
        {busy ? "Saving…" : "Publish offer banner"}
      </button>
      {offer?.active && (
        <button
          className="subtle offer-hide"
          type="button"
          disabled={busy || !online}
          onClick={onHide}
        >
          <Archive size={14} /> Hide banner · keep the image
        </button>
      )}
    </form>
  );
}
export function NoticeBoard({
  notices,
  user,
  busy,
  online,
  onSave,
  onArchive,
}: {
  notices: TeamNotice[];
  user: User;
  busy: boolean;
  online: boolean;
  onSave: (value: unknown) => Promise<boolean>;
  onArchive: (notice: TeamNotice) => void;
}) {
  const writable = ["owner", "manager"].includes(user.role);
  const [editing, setEditing] = useState<TeamNotice | null>(null),
    [message, setMessage] = useState(""),
    [priority, setPriority] = useState<"normal" | "important">("normal"),
    [expiry, setExpiry] = useState(indiaDay());
  const reset = () => {
    setEditing(null);
    setMessage("");
    setPriority("normal");
    setExpiry(indiaDay());
  };
  function edit(notice: TeamNotice) {
    setEditing(notice);
    setMessage(notice.message);
    setPriority(notice.priority);
    setExpiry(notice.expiresOn || "");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await onSave({
      ...(editing ? { id: editing.id } : {}),
      version: editing?.version || 0,
      message,
      priority,
      expiresOn: expiry || null,
    });
    if (ok) reset();
  }
  return (
    <div className="notice-board">
      <p className="muted">
        Important reminders and shift updates, with a clear name and role on
        every note.
      </p>
      <div className="notice-list">
        {notices.map((notice) => (
          <article
            className={`notice-card ${notice.priority === "important" ? "notice-important" : ""}`}
            key={notice.id}
          >
            <div className="notice-card-heading">
              <AuthorTag author={notice.author} />
              <strong>{notice.author.name}</strong>
              {notice.priority === "important" && (
                <span className="notice-priority">
                  <AlertTriangle size={11} /> Important
                </span>
              )}
            </div>
            <p>{notice.message}</p>
            <div className="notice-card-footer">
              <small>
                {new Date(notice.updatedAt).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {notice.expiresOn
                  ? ` · Until ${notice.expiresOn}`
                  : " · Until archived"}
              </small>
              <span>
                {notice.author.id === user.id && (
                  <button
                    aria-label={`Edit notice by ${notice.author.name}`}
                    disabled={busy || !online}
                    onClick={() => edit(notice)}
                  >
                    <Edit3 size={13} /> Edit
                  </button>
                )}
                {(user.role === "owner" || notice.author.id === user.id) && (
                  <button
                    aria-label={`Archive notice by ${notice.author.name}`}
                    disabled={busy || !online}
                    onClick={() => onArchive(notice)}
                  >
                    <Archive size={13} /> Archive
                  </button>
                )}
              </span>
            </div>
          </article>
        ))}
        {!notices.length && (
          <div className="notice-board-empty">
            <Megaphone size={25} />
            <h3>A clear start to the shift.</h3>
            <p>
              No active team notices. Owner and manager updates will appear
              here.
            </p>
          </div>
        )}
      </div>
      {writable && (
        <form className="notice-composer" onSubmit={submit}>
          <div className="notice-compose-heading">
            <h3>{editing ? "Edit your notice" : "Write to the team"}</h3>
            <AuthorTag
              author={{
                name: user.name,
                role: user.role as "owner" | "manager",
              }}
            />
            {editing && (
              <button type="button" className="subtle" onClick={reset}>
                New notice
              </button>
            )}
          </div>
          <label>
            Message for the team
            <textarea
              required
              maxLength={500}
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="A reminder, a little encouragement, or something everyone should know…"
            />
          </label>
          <div className="notice-form-bottom">
            <label>
              Priority
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as "normal" | "important")
                }
              >
                <option value="normal">Team update</option>
                <option value="important">Important / attention</option>
              </select>
            </label>
            <label>
              Show until
              <input
                type="date"
                min={indiaDay()}
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
              <small>Leave empty to keep until archived.</small>
            </label>
          </div>
          <div className="notice-compose-footer">
            <small>
              {message.length}/500 · Posted as {user.name}
            </small>
            <button
              className="primary compact"
              disabled={busy || !online || !message.trim()}
            >
              <Megaphone size={15} />
              {editing ? "Save changes" : "Post team notice"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
