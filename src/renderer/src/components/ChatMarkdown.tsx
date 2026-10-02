import bash from 'highlight.js/lib/languages/bash';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import r from 'highlight.js/lib/languages/r';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import yaml from 'highlight.js/lib/languages/yaml';
import { memo, useEffect, useState, type ComponentProps } from 'react';
import Markdown, { type Components, type ExtraProps } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { CHART_REF } from '../../../shared/artifacts';
import { useAgent } from '../agent/AgentProvider';
import { useApi } from '../api';
import { useResultsFocus } from '../results/ResultsFocus';
import { ChartIcon, CopyIcon } from './icons';

/*
 * Markdown safety (same rules as ReportMarkdown): no rehype-raw, so raw HTML shows as text;
 * links are unwrapped to their text and images replaced by their alt text, because model output must not be a
 * click-to-leak or load-on-view path. Highlighting emits only hljs-* classes, never inline
 * styles, so it fits the CSP. Streaming needs no special casing: CommonMark already treats an
 * unclosed fence as code to the end, and a GFM table renders once its delimiter row arrives.
 */

const HIGHLIGHT = {
  languages: { bash, javascript, json, python, r, sql, typescript, yaml },
  aliases: { sql: ['duckdb'] },
};

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName: string; hProperties: Record<string, string> };
}

/** Turns [[chart:<id>]] in prose (not code) into a span the `span` component makes a chip. */
function remarkChartRefs() {
  const visit = (node: MdNode) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child): MdNode[] => {
      if (child.type !== 'text' || !child.value) {
        visit(child);
        return [child];
      }
      const out: MdNode[] = [];
      let last = 0;
      for (const match of child.value.matchAll(CHART_REF)) {
        out.push({ type: 'text', value: child.value.slice(last, match.index) });
        out.push({
          type: 'chartRef',
          children: [],
          data: { hName: 'span', hProperties: { dataChartId: (match[1] ?? '').toLowerCase() } },
        });
        last = match.index + match[0].length;
      }
      if (out.length === 0) return [child];
      out.push({ type: 'text', value: child.value.slice(last) });
      return out;
    });
  };
  return visit;
}

type HastElement = NonNullable<ExtraProps['node']>;

function textOf(node: HastElement | HastElement['children'][number]): string {
  if (node.type === 'text') return node.value;
  return node.type === 'element' ? node.children.map(textOf).join('') : '';
}

function ChartChip({ id }: { id: string }) {
  const { state } = useAgent();
  const focus = useResultsFocus();
  const chart = state.artifacts.find((a) => a.kind === 'chart' && a.id === id);
  const base = 'mx-0.5 inline-flex items-center gap-1 rounded border px-1.5 align-baseline text-xs';
  if (!chart) {
    return (
      <button
        type="button"
        disabled
        aria-label="Chart not in this conversation"
        className={`${base} border-line text-faint`}
      >
        <ChartIcon size={12} />
        Chart
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-label={`Show chart: ${chart.title}`}
      onClick={() => {
        focus(chart.id);
      }}
      className={`${base} border-strong text-fg hover:bg-raised`}
    >
      <ChartIcon size={12} />
      {chart.title}
    </button>
  );
}

function CodeBlock({ node, children, ...props }: ComponentProps<'pre'> & ExtraProps) {
  const api = useApi();
  const [copied, setCopied] = useState(false);
  const code = node?.children[0];
  const classes = code?.type === 'element' ? code.properties.className : undefined;
  const language = Array.isArray(classes)
    ? classes.find((c): c is string => typeof c === 'string' && c.startsWith('language-'))
    : undefined;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      setCopied(false);
    }, 1500);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  async function copy() {
    // mdast-util-to-hast adds a trailing newline to every code block.
    const raw = code ? textOf(code).replace(/\n$/, '') : '';
    try {
      const result = await api.clipboard.writeText(raw);
      if (result.ok) setCopied(true);
    } catch {
      // No handler (e.g. a broken bridge): the button just doesn't confirm.
    }
  }

  return (
    <div className="code-block">
      <div className="flex items-center justify-between px-3 py-1 text-xs text-faint">
        <span>{language?.slice('language-'.length) ?? 'code'}</span>
        <button
          type="button"
          aria-label={copied ? 'Copied' : 'Copy code'}
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-raised hover:text-fg"
        >
          <CopyIcon />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre {...props}>{children}</pre>
    </div>
  );
}

const components: Components = {
  pre: CodeBlock,
  // Never an <img>: it would load on view. The alt text keeps the meaning.
  img: ({ alt }) => alt ?? null,
  span: ({ node, ...props }) => {
    const id = node?.properties.dataChartId;
    return typeof id === 'string' ? <ChartChip id={id} /> : <span {...props} />;
  },
};

/** Renders an analyst message. Memoized: finished messages don't re-parse on every delta. */
export const ChatMarkdown = memo(function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className="chat-prose">
      <Markdown
        remarkPlugins={[remarkGfm, remarkChartRefs]}
        rehypePlugins={[[rehypeHighlight, HIGHLIGHT]]}
        disallowedElements={['a']}
        unwrapDisallowed
        components={components}
      >
        {text}
      </Markdown>
    </div>
  );
});
