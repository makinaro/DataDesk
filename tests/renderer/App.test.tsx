import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from '../../src/renderer/src/App';
import { renderWithProviders } from './renderApp';

function renderApp() {
  return renderWithProviders(<App />).user;
}

describe('App shell', () => {
  it('renders the four work areas', () => {
    renderApp();
    expect(screen.getByRole('heading', { name: 'DataDesk' })).toBeInTheDocument();
    for (const name of ['Datasets', 'Chat', 'Charts & report', 'Agent timeline']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
  });

  it('toggles the timeline drawer', async () => {
    const user = renderApp();
    const toggle = screen.getByRole('button', { name: 'Timeline' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(screen.queryByRole('region', { name: 'Agent timeline' })).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens and closes settings', async () => {
    const user = renderApp();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
