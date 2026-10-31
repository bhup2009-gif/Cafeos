/** Preserve the current draft before replacing it with another order. */
export async function prepareOrderSwitch<T extends { id: string; lines: unknown[]; mode?: string; tableNo?: number | null }>(
  current: T | null,
  target: T,
  saveCurrent: (current: T) => Promise<unknown>,
  resolveTarget: (target: T) => Promise<T>,
  handleUnassigned?: (current: T, target: T) => Promise<T>,
): Promise<T> {
  // Reopening the current table must keep edits already in its panel.
  if (current?.id === target.id) return current;
  if (current?.lines.length && current.mode === "Dine-in" && !current.tableNo && handleUnassigned)
    return handleUnassigned(current, await resolveTarget(target));
  if (current?.lines.length) await saveCurrent(current);
  return resolveTarget(target);
}

export function restoreTableAssignment<T extends { id: string; mode: string; tableNo: number | null }>(draft: T, saved?: T): T {
  if (draft.mode === "Dine-in" && !draft.tableNo && saved?.mode === "Dine-in" && saved.tableNo)
    return { ...draft, tableNo: saved.tableNo };
  return draft;
}
