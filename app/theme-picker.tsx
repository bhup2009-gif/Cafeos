"use client";
import { Check, Palette, Coffee } from "lucide-react";
import { themes, type ThemeId } from "@/lib/themes";
import type { CSSProperties } from "react";
export default function ThemePicker({
  value,
  saved,
  onChange,
  onSave,
  onCancel,
  busy,
}: {
  value: ThemeId;
  saved: ThemeId;
  onChange: (id: ThemeId) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="theme-picker">
      <p className="theme-intro">
        Match the workspace to your team’s energy. Preview a mood, then save it
        for everyone at your café.
      </p>
      <fieldset className="theme-options">
        <legend className="sr-only">Choose a team theme</legend>
        {themes.map((theme) => (
          <label
            key={theme.id}
            className={`theme-choice ${value === theme.id ? "is-selected" : ""}`}
          >
            <input
              type="radio"
              name="team-theme"
              aria-label={theme.name}
              value={theme.id}
              checked={value === theme.id}
              onChange={() => onChange(theme.id)}
            />
            <span
              className="theme-mini"
              style={
                {
                  "--sample-bg": theme.background,
                  "--sample-surface": theme.surface,
                  "--sample-ink": theme.ink,
                  "--sample-accent": theme.accent,
                  "--sample-on-accent": theme.onAccent,
                } as CSSProperties
              }
            >
              <span className="theme-mini-head">
                <Coffee size={19} />
                <span>•••</span>
              </span>
              <strong>New order</strong>
              <span className="theme-mini-bill">
                <span>Margherita × 2</span>
                <b>₹598</b>
              </span>
              <span className="theme-mini-pay">Pay now</span>
            </span>
            <span className="theme-choice-title">
              {theme.name}
              <span className="theme-check" aria-hidden="true">
                {value === theme.id && <Check size={13} />}
              </span>
            </span>
            <span className="theme-mood">{theme.mood}</span>
            <span className="theme-swatches" aria-hidden="true">
              {theme.colors.map((color) => (
                <i key={color} style={{ background: color }} />
              ))}
            </span>
            <span className="theme-description">{theme.description}</span>
            {saved === theme.id && (
              <span className="theme-current">Current team theme</span>
            )}
          </label>
        ))}
      </fieldset>
      <div className="theme-preview-note" role="status">
        <Palette size={15} />
        {value === saved
          ? "Your team is using this theme."
          : `Previewing ${themes.find((t) => t.id === value)?.name}. Save to share it with your team.`}
      </div>
      <div className="theme-dialog-actions">
        <button className="secondary" onClick={onCancel} disabled={busy}>
          Cancel preview
        </button>
        <button
          className="primary"
          onClick={onSave}
          disabled={busy || value === saved}
        >
          <Palette size={16} />
          {busy ? "Saving…" : "Save team theme"}
        </button>
      </div>
      <small className="theme-footnote">
        Only the owner can change the theme. Connected team screens update
        automatically.
      </small>
    </div>
  );
}
