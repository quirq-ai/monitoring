import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// The report's own headings sit under the page's, so each is demoted two levels.
const components: ComponentProps<typeof ReactMarkdown>["components"] = {
  h1: ({ children }) => <h3>{children}</h3>,
  h2: ({ children }) => <h4>{children}</h4>,
  h3: ({ children }) => <h5>{children}</h5>,
  a: ({ href, children }) => (
    <a href={href} rel="noreferrer">
      {children}
    </a>
  ),
};

/**
 * Fetched Markdown (the canary report) rendered as React elements: tables, lists, links and
 * emphasis, never raw HTML (`skipHtml`), with react-markdown's own URL safety for links.
 */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
