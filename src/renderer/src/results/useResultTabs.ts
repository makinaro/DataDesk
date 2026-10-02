import { useState } from 'react';
import type { ArtifactRef } from '../agent/agentState';
import { initialTabs, openTab, PREVIEW_TAB, syncArtifacts } from './resultTabs';

/** A request from the chat to show an artifact; `n` makes repeat clicks on one chip count. */
export interface FocusRequest {
  id: string;
  n: number;
}

/**
 * The Results tabs, kept above the panel so closing a tab survives a layout switch or a trip to
 * compare mode (both remount the panel). Outside events adjust the tabs while rendering
 * ("previous props" pattern, no effects): new artifacts open, picking a dataset opens its
 * preview, and a chart chip opens its chart.
 */
export function useResultTabs(
  artifacts: readonly ArtifactRef[],
  dataset: string | null,
  focus: FocusRequest | null,
) {
  const [tabs, setTabs] = useState(initialTabs);

  const artifactIds = artifacts.map((a) => a.id).join(',');
  const [prevArtifactIds, setPrevArtifactIds] = useState('');
  if (artifactIds !== prevArtifactIds) {
    setPrevArtifactIds(artifactIds);
    setTabs((t) =>
      syncArtifacts(
        t,
        artifacts.map((a) => a.id),
      ),
    );
  }
  const [prevDataset, setPrevDataset] = useState(dataset);
  if (dataset !== prevDataset) {
    setPrevDataset(dataset);
    if (dataset !== null) setTabs((t) => openTab(t, PREVIEW_TAB));
  }
  const [prevFocus, setPrevFocus] = useState(focus);
  if (focus !== prevFocus) {
    setPrevFocus(focus);
    if (focus && artifacts.some((a) => a.id === focus.id)) setTabs((t) => openTab(t, focus.id));
  }

  return [tabs, setTabs] as const;
}
