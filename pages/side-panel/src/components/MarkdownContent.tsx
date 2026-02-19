import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memo } from 'react';

const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  code: ({ className, children }) => {
    const isBlock = className?.includes('language-') || false;
    if (isBlock) {
      return <code className="block text-[12px]">{children}</code>;
    }
    return <code className="rounded bg-black/[0.06] px-1.5 py-0.5 text-[12px]">{children}</code>;
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-gray-100 p-3 text-gray-800 last:mb-0">{children}</pre>
  ),
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline">
      {children}
    </a>
  ),
  h2: ({ children }) => <h2 className="mb-2 mt-3 text-[15px] font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1.5 mt-2.5 text-[14px] font-semibold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-1 mt-2 text-[13px] font-semibold first:mt-0">{children}</h4>,
  hr: () => <hr className="my-3 border-gray-200" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-gray-200 last:mb-0">
      <table className="min-w-full text-[12px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-gray-100">{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="whitespace-nowrap px-2.5 py-1.5 text-left font-semibold text-gray-700">{children}</th>
  ),
  td: ({ children }) => <td className="px-2.5 py-1.5 text-gray-600">{children}</td>,
};

const ALLOWED_ELEMENTS = [
  'p',
  'strong',
  'em',
  'code',
  'pre',
  'ul',
  'ol',
  'li',
  'a',
  'br',
  'h2',
  'h3',
  'h4',
  'hr',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];

interface MarkdownContentProps {
  content: string;
}

export default memo(function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      allowedElements={ALLOWED_ELEMENTS}
      unwrapDisallowed
      components={components}>
      {content}
    </ReactMarkdown>
  );
});
