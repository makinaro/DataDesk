import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../../../src/renderer/src/api';
import { DatasetSidebar } from '../../../src/renderer/src/components/DatasetSidebar';
import { createFakeApi, summary } from '../fakeApi';

function Harness() {
  const [selected, setSelected] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  return (
    <DatasetSidebar
      selected={selected}
      onSelect={setSelected}
      revision={revision}
      onChanged={() => {
        setRevision((r) => r + 1);
      }}
    />
  );
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

  it('re-registering the selected dataset refreshes its schema', async () => {
    const { api } = renderSidebar();
    const zone = screen.getByTestId('dataset-dropzone');
    const drop = () => {
      fireEvent.drop(zone, {
        dataTransfer: { types: ['Files'], files: [new File(['a'], 'sales.csv')] },
      });
    };
    drop();
    await screen.findByRole('list', { name: 'Columns of sales' });
    const before = api.datasets.schema.mock.calls.length;
    drop();
    await waitFor(() => {
      expect(api.datasets.schema.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it('reports every failed file from a multi-file drop', async () => {
    const api = createFakeApi({}, []);
    api.datasets.registerFile
      .mockResolvedValueOnce({ ok: false, error: { code: 'REJECTED', message: 'Bad A.' } } as never)
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'REJECTED', message: 'Bad B.' },
      } as never);
    renderSidebar(api);
    const files = [new File(['x'], 'a.txt'), new File(['y'], 'b.txt')];
    fireEvent.drop(screen.getByTestId('dataset-dropzone'), {
      dataTransfer: { types: ['Files'], files },
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('a.txt: Bad A.');
    expect(alert).toHaveTextContent('b.txt: Bad B.');
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

describe('removing a dataset', () => {
  const twoDatasets = () => createFakeApi({}, [summary('sales'), summary('events')]);
  const item = (name: string) =>
    within(screen.getByRole('list', { name: 'Registered datasets' })).getByRole('button', {
      name: new RegExp(`^${name}`),
    });

  it('right-click → Remove dataset… → confirm removes it from the list', async () => {
    const { api, user } = renderSidebar(twoDatasets());
    await screen.findByText('events');
    fireEvent.contextMenu(item('sales'), { clientX: 40, clientY: 80 });

    const menu = screen.getByRole('menu', { name: 'Dataset sales' });
    expect(within(menu).getByRole('menuitem', { name: 'Remove dataset…' })).toHaveFocus();
    await user.keyboard('{Enter}');

    const dialog = screen.getByRole('alertdialog', { name: 'Remove "sales"?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

    expect(api.datasets.remove).toHaveBeenCalledWith('sales');
    await waitFor(() => {
      expect(screen.queryByText('sales')).not.toBeInTheDocument();
    });
    expect(screen.getByText('events')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('Delete on a focused dataset asks first, and Escape cancels without removing', async () => {
    const { api, user } = renderSidebar(twoDatasets());
    await screen.findByText('events');
    item('events').focus();
    await user.keyboard('{Delete}');
    expect(screen.getByRole('alertdialog', { name: 'Remove "events"?' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(api.datasets.remove).not.toHaveBeenCalled();
  });

  it('the menu closes on Escape or a click elsewhere', async () => {
    const { user } = renderSidebar();
    await screen.findByText('sales');
    fireEvent.contextMenu(item('sales'));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.contextMenu(item('sales'));
    await user.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('shows why a removal failed', async () => {
    const api = twoDatasets();
    api.datasets.remove.mockResolvedValueOnce({
      ok: false,
      error: { code: 'REJECTED', message: 'Catalog is busy.' },
    } as never);
    const { user } = renderSidebar(api);
    await screen.findByText('sales');
    item('sales').focus();
    await user.keyboard('{Delete}');
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Catalog is busy.');
    expect(screen.getByText('sales')).toBeInTheDocument();
  });
});
