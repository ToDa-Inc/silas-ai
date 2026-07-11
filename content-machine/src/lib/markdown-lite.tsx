import type { ReactNode } from "react";

/** Strip LLM wrapper tags like `<ICP_Analysis>`. */
export function stripDocMarkupTags(text: string): string {
  return text.replace(/<\/?[A-Za-z][A-Za-z0-9_-]*>/g, "").trim();
}

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = re.exec(text))) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    if (match[1]) {
      parts.push(
        <strong key={`${keyPrefix}-b-${i++}`} className="font-semibold text-zinc-100">
          {match[1]}
        </strong>,
      );
    } else {
      const em = match[2] || match[3];
      if (em) {
        parts.push(
          <em key={`${keyPrefix}-i-${i++}`} className="text-zinc-300">
            {em}
          </em>,
        );
      }
    }
    last = match.lastIndex;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

type MarkdownLiteProps = {
  content: string;
  className?: string;
};

/**
 * Lightweight markdown renderer for strategy docs — no raw `**`, `#`, or `*` syntax.
 */
export function MarkdownLite({ content, className }: MarkdownLiteProps) {
  const cleaned = stripDocMarkupTags(content);
  const lines = cleaned.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let listOrdered = false;

  const flushList = () => {
    if (!listItems.length) return;
    const listClass =
      "ml-4 space-y-1.5 text-sm leading-relaxed text-zinc-400 marker:text-amber-300/70";
    if (listOrdered) {
      blocks.push(
        <ol key={`ol-${blocks.length}`} className={`${listClass} list-decimal`}>
          {listItems.map((item, idx) => (
            <li key={idx}>{parseInline(item, `ol-${blocks.length}-${idx}`)}</li>
          ))}
        </ol>,
      );
    } else {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className={`${listClass} list-disc`}>
          {listItems.map((item, idx) => (
            <li key={idx}>{parseInline(item, `ul-${blocks.length}-${idx}`)}</li>
          ))}
        </ul>,
      );
    }
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushList();
      blocks.push(<hr key={`hr-${blocks.length}`} className="border-white/10" />);
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const text = heading[2];
      const headingClass =
        level === 1
          ? "text-base font-bold tracking-tight text-white"
          : level === 2
            ? "text-sm font-bold text-zinc-100"
            : "text-xs font-bold uppercase tracking-[0.14em] text-amber-200/90";
      const Tag = level === 1 ? "h3" : level === 2 ? "h4" : "h5";
      blocks.push(
        <Tag key={`h-${blocks.length}`} className={headingClass}>
          {parseInline(text, `h-${blocks.length}`)}
        </Tag>,
      );
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      if (listItems.length && !listOrdered) flushList();
      listOrdered = true;
      listItems.push(ordered[1]);
      continue;
    }

    const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bullet) {
      if (listItems.length && listOrdered) flushList();
      listOrdered = false;
      listItems.push(bullet[1]);
      continue;
    }

    flushList();
    blocks.push(
      <p key={`p-${blocks.length}`} className="text-sm leading-relaxed text-zinc-400">
        {parseInline(trimmed, `p-${blocks.length}`)}
      </p>,
    );
  }

  flushList();

  if (!blocks.length) {
    return (
      <p className={className ?? "text-sm leading-relaxed text-zinc-500 italic"}>
        {cleaned || "—"}
      </p>
    );
  }

  return <div className={className ?? "space-y-3"}>{blocks}</div>;
}
