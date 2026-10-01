import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { AgentProvider } from '../../src/renderer/src/agent/AgentProvider';
import { ApiProvider } from '../../src/renderer/src/api';
import { AppearanceProvider } from '../../src/renderer/src/appearance/AppearanceProvider';
import { createFakeApi } from './fakeApi';

/** Renders UI inside the same providers as main.tsx, backed by a fake bridge. */
export function renderWithProviders(ui: ReactNode, api = createFakeApi()) {
  render(
    <ApiProvider api={api}>
      <AppearanceProvider>
        <AgentProvider>{ui}</AgentProvider>
      </AppearanceProvider>
    </ApiProvider>,
  );
  return { api, user: userEvent.setup() };
}
