import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../src/renderer/src/api';
import { AppearanceProvider } from '../../../src/renderer/src/appearance/AppearanceProvider';
import { SettingsDialog } from '../../../src/renderer/src/components/SettingsDialog';
import { createFakeApi } from '../fakeApi';

const KEY = 'sk-ant-visible-only-while-typing';

function renderDialog(api = createFakeApi()) {
  const onClose = vi.fn();
  render(
    <ApiProvider api={api}>
      <AppearanceProvider>
        <SettingsDialog onClose={onClose} />
      </AppearanceProvider>
    </ApiProvider>,
  );
  return { api, onClose };
}

describe('SettingsDialog', () => {
  it('shows set / not-set status for each provider', async () => {
    renderDialog(createFakeApi({ openai: true }));
    await waitFor(() => {
      expect(screen.getByTestId('status-openai')).toHaveTextContent('Set');
    });
    expect(screen.getByTestId('status-anthropic')).toHaveTextContent('Not set');
  });

  it('uses password inputs and clears the key after saving', async () => {
    const user = userEvent.setup();
    const { api } = renderDialog();
    const input = screen.getByLabelText('Anthropic');
    expect(input).toHaveAttribute('type', 'password');

    await user.type(input, KEY);
    await user.click(screen.getByRole('button', { name: 'Save Anthropic key' }));

    expect(api.secrets.set).toHaveBeenCalledWith('anthropic', KEY);
    expect(input).toHaveValue('');
    await waitFor(() => {
      expect(screen.getByTestId('status-anthropic')).toHaveTextContent('Set');
    });
    expect(document.body.innerHTML).not.toContain(KEY);
  });

  it('clears a key', async () => {
    const user = userEvent.setup();
    const { api } = renderDialog(createFakeApi({ huggingface: true }));
    await waitFor(() => {
      expect(screen.getByTestId('status-huggingface')).toHaveTextContent('Set');
    });
    await user.click(screen.getByRole('button', { name: 'Clear Hugging Face key' }));
    expect(api.secrets.clear).toHaveBeenCalledWith('huggingface');
    await waitFor(() => {
      expect(screen.getByTestId('status-huggingface')).toHaveTextContent('Not set');
    });
  });

  it('recovers if the bridge itself rejects (buttons re-enable, error shown)', async () => {
    const user = userEvent.setup();
    const api = createFakeApi({ openai: true });
    api.secrets.clear.mockRejectedValueOnce(new Error('No handler registered'));
    renderDialog(api);
    const clearButton = screen.getByRole('button', { name: 'Clear OpenAI key' });
    await waitFor(() => {
      expect(clearButton).toBeEnabled();
    });
    await user.click(clearButton);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach');
    expect(clearButton).toBeEnabled();
  });

  it('shows errors from main (e.g. encryption unavailable)', async () => {
    const user = userEvent.setup();
    const api = createFakeApi();
    api.secrets.set.mockResolvedValueOnce({
      ok: false,
      error: { code: 'UNAVAILABLE', message: 'OS-level encryption is unavailable.' },
    } as never);
    renderDialog(api);
    await user.type(screen.getByLabelText('OpenAI'), KEY);
    await user.click(screen.getByRole('button', { name: 'Save OpenAI key' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('encryption is unavailable');
  });

  it('says what the Hugging Face token sends, that downloads ask first, and the reset', () => {
    renderDialog(createFakeApi());
    expect(screen.getByText(/Hugging Face receives the search words/)).toHaveTextContent(
      /never uploads your files.*private or gated.*read-only token.*Every download asks you first.*starts a new conversation/,
    );
  });

  it('says that choosing OpenAI as the provider sends it the whole conversation', () => {
    renderDialog(createFakeApi());
    expect(screen.getByText(/Enables column search/)).toHaveTextContent(
      /choose OpenAI as the analyst’s provider.*whole conversation.*sample rows and query results.*storage off and tracing disabled/,
    );
  });

  it('switches the analyst to OpenAI with an OpenAI model', async () => {
    const user = userEvent.setup();
    const { api } = renderDialog(createFakeApi({ openai: true }));
    await user.click(screen.getByRole('tab', { name: 'Analyst' }));
    const provider = await screen.findByLabelText('Provider');
    expect(provider).toHaveValue('anthropic');
    expect(screen.getByLabelText('Model')).toHaveValue('sonnet');

    await user.selectOptions(provider, 'openai');
    const model = screen.getByLabelText('Model');
    expect(model).toHaveValue('gpt-5.4-mini');
    expect(screen.getByText(/Hugging Face tools are only available with Claude/)).toBeVisible();
    await user.selectOptions(model, 'gpt-5.5');
    await user.click(screen.getByRole('button', { name: 'Save analyst settings' }));

    expect(api.settings.setAgent).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openai', openaiModel: 'gpt-5.5', model: 'sonnet' }),
    );
    expect(await screen.findByText(/Saved/)).toBeVisible();
  });

  it('opens on API keys; arrow keys move between the tabs', async () => {
    const user = userEvent.setup();
    renderDialog();
    const keys = screen.getByRole('tab', { name: 'API keys' });
    expect(keys).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'API keys' })).toBeInTheDocument();

    keys.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Analyst' })).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Analyst' })).toBeInTheDocument();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('tab', { name: 'Appearance' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('applies and saves a theme without touching agent settings', async () => {
    const user = userEvent.setup();
    const { api } = renderDialog();
    await user.click(screen.getByRole('tab', { name: 'Appearance' }));
    const light = screen.getByRole('radio', { name: /Light/ });
    expect(screen.getByRole('radio', { name: /Dark/ })).toBeChecked();

    await user.click(light);

    expect(light).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(api.settings.setAppearance).toHaveBeenCalledWith({
      theme: 'light',
      layout: 'results-first',
    });
    expect(api.settings.setAgent).not.toHaveBeenCalled();
  });

  it('switches the layout and saves it alongside the theme', async () => {
    const user = userEvent.setup();
    const { api } = renderDialog();
    await user.click(screen.getByRole('tab', { name: 'Appearance' }));
    expect(screen.getByRole('radio', { name: /Results-first/ })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: /Chat-first/ }));

    expect(screen.getByRole('radio', { name: /Chat-first/ })).toBeChecked();
    expect(api.settings.setAppearance).toHaveBeenCalledWith({
      theme: 'dark',
      layout: 'chat-first',
    });
  });

  it('reverts the theme and says why when saving fails', async () => {
    const user = userEvent.setup();
    const api = createFakeApi();
    api.settings.setAppearance.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INTERNAL', message: 'Disk full.' },
    } as never);
    renderDialog(api);
    await user.click(screen.getByRole('tab', { name: 'Appearance' }));
    await user.click(screen.getByRole('radio', { name: /Slate/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Disk full.');
    expect(screen.getByRole('radio', { name: /Dark/ })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
