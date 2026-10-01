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

  it('swaps the chat for compare mode and back, ending the compare sessions on leaving', async () => {
    const { api, user } = renderWithProviders(<App />);
    const toggle = screen.getByRole('button', { name: 'Compare' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Compare providers' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Chat' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Datasets' })).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByRole('region', { name: 'Chat' })).toBeInTheDocument();
    expect(api.compare.reset).toHaveBeenCalledOnce();
  });
});
