/** The Results panel's tabs, as pure functions so the rules are testable without React. */

export const PREVIEW_TAB = 'preview';

export interface TabsState {
  /** Tab ids left to right: PREVIEW_TAB or an artifact id. */
  open: string[];
  /** The selected tab; null when every tab is closed. */
  active: string | null;
  /** Artifact ids already shown once. A closed one stays closed until reopened on purpose. */
  seen: string[];
}

export const initialTabs: TabsState = { open: [PREVIEW_TAB], active: PREVIEW_TAB, seen: [] };

/** Opens a tab (appended at the end if it was closed) and selects it. */
export function openTab(state: TabsState, id: string): TabsState {
  const open = state.open.includes(id) ? state.open : [...state.open, id];
  return { ...state, open, active: id };
}

/**
 * Closes a tab. If it was selected, its right neighbour takes over (else the left one), like
 * VS Code and browsers do.
 */
export function closeTab(state: TabsState, id: string): TabsState {
  const index = state.open.indexOf(id);
  if (index < 0) return state;
  const open = state.open.filter((t) => t !== id);
  const active = state.active === id ? (open[index] ?? open[index - 1] ?? null) : state.active;
  return { ...state, open, active };
}

/**
 * Brings the tabs in line with the conversation's artifacts: new ones open and the newest is
 * selected; tabs whose artifact is gone (a conversation reset) close.
 */
export function syncArtifacts(state: TabsState, artifactIds: readonly string[]): TabsState {
  const fresh = artifactIds.filter((id) => !state.seen.includes(id));
  let next: TabsState = {
    ...state,
    seen: [...state.seen.filter((id) => artifactIds.includes(id)), ...fresh],
  };
  for (const gone of state.open.filter((t) => t !== PREVIEW_TAB && !artifactIds.includes(t))) {
    next = closeTab(next, gone);
  }
  for (const id of fresh) next = openTab(next, id);
  return next;
}
