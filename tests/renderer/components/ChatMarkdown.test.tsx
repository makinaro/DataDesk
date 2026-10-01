import { act, cleanup, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatMarkdown } from '../../../src/renderer/src/components/ChatMarkdown';
import { ResultsFocusProvider } from '../../../src/renderer/src/results/ResultsFocus';
import { CHART_ID, createFakeApi } from '../fakeApi';
import { renderWithProviders } from '../renderApp';

function renderMarkdown(text: string, api = createFakeApi(), onFocus = vi.fn()) {
  const result = renderWithProviders(
    <ResultsFocusProvider onFocus={onFocus}>
      <article aria-label="Answer">
        <ChatMarkdown text={text} />
      </article>
    </ResultsFocusProvider>,
    api,
  );
  return { ...result, onFocus, answer: screen.getByRole('article', { name: 'Answer' }) };
}

describe('ChatMarkdown', () => {
  it('renders bold, italics, lists and inline code', () => {
    const { answer } = renderMarkdown(
      '**West** sold _most_.\n\n- one\n- two\n\n1. first\n\nUse `SUM(units)`.',
    );
    expect(within(answer).getByText('West').tagName).toBe('STRONG');
    expect(within(answer).getByText('most').tagName).toBe('EM');
    expect(within(answer).getAllByRole('list')).toHaveLength(2);
    expect(within(answer).getByText('SUM(units)').tagName).toBe('CODE');
  });

  it('renders GFM tables', () => {
    const { answer } = renderMarkdown(
      '| Region | Units |\n|---|---:|\n| West | 210 |\n| East | 139 |',
    );
    const table = within(answer).getByRole('table');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Region', 'Units']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });

  it('highlights fenced code with CSS classes and copies the raw code', async () => {
    const api = createFakeApi();
    const sql = 'SELECT region, SUM(units)\nFROM sales\nGROUP BY region;';
    const { answer, user } = renderMarkdown(`Query:\n\n\`\`\`sql\n${sql}\n\`\`\``, api);

    const code = answer.querySelector('pre code');
    expect(code).toHaveClass('hljs', 'language-sql');
    expect(code?.querySelector('.hljs-keyword')).toHaveTextContent('SELECT');
    expect(answer.querySelector('[style]')).toBeNull();
    expect(within(answer).getByText('sql')).toBeInTheDocument();

    await user.click(within(answer).getByRole('button', { name: 'Copy code' }));
    expect(api.clipboard.writeText).toHaveBeenCalledWith(sql);
    expect(await within(answer).findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('treats DuckDB fences as SQL and leaves unknown languages plain', () => {
    const { answer } = renderMarkdown(
      '```duckdb\nSELECT 1;\n```\n\n```klingon\nqapla\n```\n\n```\nplain\n```',
    );
    const blocks = answer.querySelectorAll('pre code');
    expect(blocks).toHaveLength(3);
    expect(blocks[0]?.querySelector('.hljs-keyword')).toHaveTextContent('SELECT');
    expect(blocks[1]).toHaveTextContent('qapla');
    expect(blocks[2]).toHaveTextContent('plain');
  });

  describe('while streaming', () => {
    it('shows an unclosed code fence as code so far', () => {
      const { answer } = renderMarkdown('Here:\n\n```sql\nSELECT region,\n  SUM(un');
      expect(answer.querySelector('pre code')).toHaveTextContent(/SELECT region,\s+SUM\(un/);
      expect(answer).not.toHaveTextContent('```');
    });

    it('shows a table as soon as its header and delimiter rows arrive', () => {
      const { answer } = renderMarkdown('| Region | Units |\n|---|---|\n| West | 21');
      const table = within(answer).getByRole('table');
      expect(within(table).getAllByRole('row')).toHaveLength(2);
      expect(within(table).getByText('21')).toBeInTheDocument();
    });

    it('does not crash on half-written markup', () => {
      for (const partial of ['**bo', '[link](http', '| a |', '```', '- ', '[[chart:12']) {
        expect(() => renderMarkdown(partial)).not.toThrow();
        cleanup();
      }
    });
  });

  describe('untrusted model output', () => {
    it('never renders raw HTML as elements', () => {
      const { answer } = renderMarkdown(
        'Hi <script>alert(1)</script> <img src=x onerror="alert(2)"> <iframe src="https://evil"></iframe>\n\n<div onclick="x()">block</div>',
      );
      expect(answer.querySelector('script, img, iframe, div[onclick]')).toBeNull();
      expect(answer).toHaveTextContent('<script>alert(1)</script>');
    });

    it('unwraps links and images to plain text', () => {
      const { answer } = renderMarkdown(
        'See [the docs](https://evil.example/?q=leak) and [x](javascript:alert(1)) and ![chart](https://evil.example/pixel.png) and https://bare.example',
      );
      expect(answer.querySelector('a, img')).toBeNull();
      expect(answer).toHaveTextContent('See the docs and x and chart and https://bare.example');
    });
  });

  describe('chart references', () => {
    it('turns [[chart:<id>]] into a chip named after the chart that focuses it', async () => {
      const api = createFakeApi();
      const { answer, user, onFocus } = renderMarkdown(
        `I charted it as [[chart:${CHART_ID}]].`,
        api,
      );
      act(() => {
        api.emit({
          kind: 'artifact',
          artifactKind: 'chart',
          id: CHART_ID,
          title: 'Units by region',
        });
      });
      const chip = within(answer).getByRole('button', { name: 'Show chart: Units by region' });
      await user.click(chip);
      expect(onFocus).toHaveBeenCalledWith(CHART_ID);
      expect(answer).not.toHaveTextContent('[[chart:');
    });

    it('shows an unknown chart as a disabled chip, and leaves code alone', () => {
      const { answer } = renderMarkdown(`Old: [[chart:${CHART_ID}]]\n\n\`[[chart:${CHART_ID}]]\``);
      expect(
        within(answer).getByRole('button', { name: 'Chart not in this conversation' }),
      ).toBeDisabled();
      expect(within(answer).getByText(`[[chart:${CHART_ID}]]`).tagName).toBe('CODE');
    });
  });
});
