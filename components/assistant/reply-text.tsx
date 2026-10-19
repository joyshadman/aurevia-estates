import { Fragment, type ReactNode } from "react";

// The assistant's text, safely (spec 0006, *Rendering*): paragraphs, `- `
// bullet lists, and `**bold**`. No links, images, or HTML ever render.

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((piece, i) =>
    piece.startsWith("**") && piece.endsWith("**") && piece.length > 4 ? (
      <strong key={i} className="font-semibold">
        {piece.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{piece}</Fragment>
    ),
  );
}

export function ReplyText({ text, className }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((line) => line.trim() !== "");
        if (lines.length > 0 && lines.every((line) => /^\s*[-*•]\s+/.test(line))) {
          return (
            <ul key={i} className="my-2 list-disc space-y-1 pl-5">
              {lines.map((line, j) => (
                <li key={j}>{inline(line.replace(/^\s*[-*•]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="my-2 first:mt-0 last:mb-0">
            {lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                {inline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
