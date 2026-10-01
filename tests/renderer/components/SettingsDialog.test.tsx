import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiProvider } from '../../../src/renderer/src/api';
import { SettingsDialog } from '../../../src/renderer/src/components/SettingsDialog';
import { createFakeApi } from '../fakeApi';

const KEY = 'sk-ant-visible-only-while-typing';

function renderDialog(api = createFakeApi()) {
  const onClose = vi.fn();
  render(
    <ApiProvider api={api}>
      <SettingsDialog onClose={onClose} />
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
});
