import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// The report's own headings sit under the page's, so each is demoted two levels. A wide table
// scrolls sideways inside a box a keyboard can reach, each box labelled by its number so the
// landmarks are distinct. Images are not fetched: an outside image would tell its host the
// viewer's address, so only the alt text is shown.
function componentsFor(): ComponentProps<typeof ReactMarkdown>["components"] {
  let tables = 0;
  return {
    h1: ({ children }) => <h3>{children}</h3>,
    h2: ({ children }) => <h4>{children}</h4>,
    h3: ({ children }) => <h5>{children}</h5>,
    a: ({ href, children }) => (
      <a href={href} rel="noreferrer">
        {children}
      </a>
    ),
    table: ({ children }) => {
      tables += 1;
      return (
        <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label={`Table ${tables} in the report`}>
          <table>{children}</table>
        </div>
      );
    },
    img: ({ alt }) => <span className="text-muted-foreground">[image{alt ? `: ${alt}` : ""}]</span>,
  };
}

/**
 * Fetched Markdown (the canary report) rendered as React elements: tables, lists, links and
 * emphasis, never raw HTML (`skipHtml`), with react-markdown's own URL safety for links.
 */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={componentsFor()}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
