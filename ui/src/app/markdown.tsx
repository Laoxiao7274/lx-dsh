// Compact, dependency-free markdown for chat text (no raw HTML, safe by construction).
// Supports: fenced code, inline code, bold, italic, links, headings, lists, quotes, hr.
import { Fragment, type ReactNode } from 'react';

const BT = String.fromCharCode(96);
const FENCE = BT + BT + BT;

// A GFM table separator row: only pipes, colons, dashes, spaces — and it must
// contain at least one pipe and one dash.
function isTableSep(l: string): boolean {
  const t = l.trim();
  if (!t.includes('|') || !t.includes('-')) return false;
  return /^[\s|:-]+$/.test(t);
}

function emphasis(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(
        <a
          key={keyBase + '-a' + k}
          href={m[2]}
          target="_blank"
          rel="noreferrer"
          className="text-brand-2 underline decoration-brand-2/40 underline-offset-2 hover:decoration-brand-2"
        >
          {m[1]}
        </a>,
      );
    } else if (m[3] !== undefined) {
      out.push(
        <strong key={keyBase + '-b' + k} className="font-semibold text-foreground">
          {m[3]}
        </strong>,
      );
    } else {
      out.push(<em key={keyBase + '-i' + k}>{m[4]}</em>);
    }
    last = m.index + m[0].length;
    k += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(BT + '([^' + BT + ']*)' + BT, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(...emphasis(text.slice(last, m.index), keyBase + '-' + k));
    out.push(
      <code key={keyBase + '-code' + k} className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[12px] text-brand-2/90">
        {m[1]}
      </code>,
    );
    last = m.index + m[0].length;
    k += 1;
  }
  if (last < text.length) out.push(...emphasis(text.slice(last), keyBase + '-' + k));
  return out;
}

export function md(text: string): ReactNode {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith(FENCE)) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith(FENCE)) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <div key={key++} className="my-2 overflow-hidden rounded-md border border-sidebar-border bg-code-bg">
          {lang ? (
            <div className="border-b border-sidebar-border bg-surface-1 px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">
              {lang}
            </div>
          ) : null}
          <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[11.5px] leading-[1.65] text-secondary-foreground">
            {buf.join('\n')}
          </pre>
        </div>,
      );
      continue;
    }

    // GFM table: a header row with pipes, followed by a separator row
    // (| :--- | :---: | --- | etc.).
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const parseRow = (l: string): string[] =>
        l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      const header = parseRow(line);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(parseRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div key={key++} className="my-2 overflow-x-auto rounded-md border border-sidebar-border">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {header.map((cell, j) => (
                  <th key={j} className="border-b border-sidebar-border bg-surface-1 px-3 py-1.5 text-left font-semibold text-secondary-foreground">
                    {inline(cell, 'th' + key + '-' + j)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, j) => (
                <tr key={j}>
                  {row.map((cell, k) => (
                    <td key={k} className="border-b border-sidebar-border/60 px-3 py-1.5 text-foreground/90">
                      {inline(cell, 'td' + key + '-' + j + '-' + k)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls =
        level === 1
          ? 'mt-4 mb-2 text-[15px] font-bold tracking-tight'
          : level === 2
            ? 'mt-3.5 mb-1.5 text-[14px] font-bold'
            : 'mt-3 mb-1 text-[13.5px] font-semibold';
      const Tag = ('h' + Math.min(level + 1, 4)) as 'h2' | 'h3' | 'h4';
      blocks.push(
        <Tag key={key++} className={cls}>
          {inline(h[2], 'h' + key)}
        </Tag>,
      );
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push(<div key={key++} className="my-3 h-px bg-sidebar-border" />);
      i += 1;
      continue;
    }

    const ordered = /^\s*\d+[.)]\s+/.test(line);
    const bulleted = /^\s*([-*])\s+/.test(line);
    if (ordered || bulleted) {
      const reItem = ordered ? /^\s*\d+[.)]\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
      const items: string[] = [];
      while (i < lines.length) {
        const m2 = reItem.exec(lines[i]);
        if (!m2) break;
        items.push(m2[1]);
        i += 1;
      }
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag
          key={key++}
          className={ordered ? 'my-1.5 list-decimal space-y-0.5 pl-5' : 'my-1.5 list-disc space-y-0.5 pl-5'}
        >
          {items.map((it, j) => (
            <li key={j}>{inline(it, 'li' + key + '-' + j)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    if (line.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote key={key++} className="my-2 border-l-2 border-brand-1/50 pl-3 text-[13px] text-muted-foreground">
          {inline(buf.join(' '), 'q' + key)}
        </blockquote>,
      );
      continue;
    }

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const buf: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith(FENCE) &&
      !/^#/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !lines[i].startsWith('>')
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={key++} className="my-1.5 leading-[1.7]">
        {inline(buf.join(' '), 'p' + key)}
      </p>,
    );
  }
  return <Fragment>{blocks}</Fragment>;
}
