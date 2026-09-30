import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../src/renderer/src/api';
import { DatasetSidebar } from '../../../src/renderer/src/components/DatasetSidebar';
import { createFakeApi, summary } from '../fakeApi';

function Harness() {
  const [selected, setSelected] = useState<string | null>(null);
  return <DatasetSidebar selected={selected} onSelect={setSelected} />;
}

function renderSidebar(api = createFakeApi({}, [summary('sales')])) {
  render(
    <ApiProvider api={api}>
      <Harness />
    </ApiProvider>,
  );
  return { api, user: userEvent.setup() };
}

describe('DatasetSidebar', () => {
  it('lists registered datasets with format, rows and columns', async () => {
    renderSidebar();
    const list = await screen.findByRole('list', { name: 'Registered datasets' });
    expect(within(list).getByText('sales')).toBeInTheDocument();
    expect(within(list).getByText(/CSV · 60 rows · 3 cols · 2\.0 KB/)).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    renderSidebar(createFakeApi());
    expect(await screen.findByText('No datasets yet.')).toBeInTheDocument();
  });

  it('shows the schema when a dataset is selected, and hides it again', async () => {
    const { user } = renderSidebar();
    await user.click(await screen.findByRole('button', { name: /sales/ }));
    const cols = await screen.findByRole('list', { name: 'Columns of sales' });
    expect(within(cols).getByText('region')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /sales/ }));
    expect(screen.queryByRole('list', { name: 'Columns of sales' })).not.toBeInTheDocument();
  });

  it('registers dropped files and selects the new dataset', async () => {
    const { api } = renderSidebar();
    const file = new File(['a,b\n1,2\n'], 'Events.csv', { type: 'text/csv' });
    const zone = screen.getByTestId('dataset-dropzone');
    fireEvent.dragOver(zone, { dataTransfer: { types: ['Files'], files: [file] } });
    fireEvent.drop(zone, { dataTransfer: { types: ['Files'], files: [file] } });
    await waitFor(() => {
      expect(api.datasets.registerFile).toHaveBeenCalledWith(file);
    });
    expect(await screen.findByRole('list', { name: 'Columns of events' })).toBeInTheDocument();
  });

  it('registers via the Add file… picker', async () => {
    const { api, user } = renderSidebar();
    await user.click(screen.getByRole('button', { name: 'Add file…' }));
    expect(api.datasets.pick).toHaveBeenCalled();
    expect(await screen.findByText('picked')).toBeInTheDocument();
  });

  it('shows the reason when a file is rejected', async () => {
    const api = createFakeApi({}, []);
    api.datasets.registerFile.mockResolvedValueOnce({
      ok: false,
      error: { code: 'REJECTED', message: 'Unsupported file type.' },
    } as never);
    renderSidebar(api);
    const zone = screen.getByTestId('dataset-dropzone');
    const file = new File(['x'], 'notes.txt');
    fireEvent.drop(zone, { dataTransfer: { types: ['Files'], files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('notes.txt: Unsupported file type.');
  });

  it('shows datasets whose file went missing with their error', async () => {
    renderSidebar(
      createFakeApi({}, [
        summary('gone', { rowCount: null, columnCount: null, error: 'File not found' }),
      ]),
    );
    expect(await screen.findByText(/⚠ File not found/)).toBeInTheDocument();
  });
});
