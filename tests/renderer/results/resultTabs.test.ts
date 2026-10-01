import { describe, expect, it } from 'vitest';
import {
  closeTab,
  initialTabs,
  openTab,
  PREVIEW_TAB,
  syncArtifacts,
  type TabsState,
} from '../../../src/renderer/src/results/resultTabs';

const tabs = (open: string[], active: string | null, seen: string[] = []): TabsState => ({
  open,
  active,
  seen,
});

describe('result tabs', () => {
  it('starts with the data preview open', () => {
    expect(initialTabs).toEqual(tabs([PREVIEW_TAB], PREVIEW_TAB));
  });

  it('opens new artifacts as tabs and selects the newest', () => {
    const state = syncArtifacts(initialTabs, ['c1', 'r1']);
    expect(state).toEqual(tabs([PREVIEW_TAB, 'c1', 'r1'], 'r1', ['c1', 'r1']));
  });

  it('closing the selected tab selects its right neighbour, else its left one', () => {
    const state = tabs([PREVIEW_TAB, 'c1', 'r1'], 'c1');
    expect(closeTab(state, 'c1')).toEqual(tabs([PREVIEW_TAB, 'r1'], 'r1'));
    expect(closeTab(tabs([PREVIEW_TAB, 'c1'], 'c1'), 'c1')).toEqual(
      tabs([PREVIEW_TAB], PREVIEW_TAB),
    );
    expect(closeTab(tabs(['c1'], 'c1'), 'c1')).toEqual(tabs([], null));
  });

  it('closing another tab keeps the selection', () => {
    expect(closeTab(tabs([PREVIEW_TAB, 'c1', 'r1'], 'r1'), PREVIEW_TAB)).toEqual(
      tabs(['c1', 'r1'], 'r1'),
    );
  });

  it('a closed artifact stays closed when later artifacts arrive, until reopened', () => {
    let state = syncArtifacts(initialTabs, ['c1']);
    state = closeTab(state, 'c1');
    state = syncArtifacts(state, ['c1', 'c2']);
    expect(state.open).toEqual([PREVIEW_TAB, 'c2']);
    state = openTab(state, 'c1');
    expect(state).toMatchObject({ open: [PREVIEW_TAB, 'c2', 'c1'], active: 'c1' });
  });

  it('a conversation reset closes artifact tabs but keeps the preview', () => {
    let state = syncArtifacts(initialTabs, ['c1', 'r1']);
    state = syncArtifacts(state, []);
    expect(state).toEqual(tabs([PREVIEW_TAB], PREVIEW_TAB, []));
  });

  it('reopening an open tab just selects it', () => {
    const state = tabs([PREVIEW_TAB, 'c1'], 'c1');
    expect(openTab(state, PREVIEW_TAB)).toEqual(tabs([PREVIEW_TAB, 'c1'], PREVIEW_TAB));
  });
});
