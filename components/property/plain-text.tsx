import { Fragment } from "react";

// Listing descriptions are plain text: blank lines separate paragraphs, single
// line breaks stay, nothing else is interpreted (spec 0005, AC-14).
export function PlainText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.trim().split(/\n\s*\n/).filter((p) => p.trim());
  return (
    <div className={className}>
      {paragraphs.map((paragraph, i) => (
        <p key={i} className="mt-4 first:mt-0">
          {paragraph.split("\n").map((line, j) => (
            <Fragment key={j}>
              {j > 0 ? <br /> : null}
              {line}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
