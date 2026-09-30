import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../../src/renderer/src/api';
import { App } from '../../src/renderer/src/App';
import { createFakeApi } from './fakeApi';

describe('App', () => {
  it('renders the product name and opens settings', async () => {
    const user = userEvent.setup();
    render(
      <ApiProvider api={createFakeApi()}>
        <App />
      </ApiProvider>,
    );
    expect(screen.getByRole('heading', { name: 'DataDesk' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'API keys' })).toBeInTheDocument();
  });
});
