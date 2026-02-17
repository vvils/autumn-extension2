import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
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
};

const ALLOWED_ELEMENTS = ['p', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'br'];

interface MarkdownContentProps {
  content: string;
}

export default memo(function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <ReactMarkdown allowedElements={ALLOWED_ELEMENTS} unwrapDisallowed components={components}>
      {content}
    </ReactMarkdown>
  );
});
