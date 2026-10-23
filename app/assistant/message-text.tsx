import { Fragment, type ReactNode } from "react";

// A small safe renderer for the assistant's text (spec 0006, *Rendering*):
// paragraphs, `- ` bullet lists, and `**bold**`. No links, images, or HTML:
// everything else shows as plain text.

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((piece, i) =>
    piece.startsWith("**") && piece.endsWith("**") && piece.length > 4 ? (
      <strong key={i} className="font-semibold text-fg">
        {piece.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{piece}</Fragment>
    ),
  );
}

const bullet = /^\s*[-*•]\s+/;

export function MessageText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((line) => line.trim() !== "");
        if (lines.length > 0 && lines.every((line) => bullet.test(line))) {
          return (
            <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
              {lines.map((line, j) => (
                <li key={j}>{inline(line.replace(bullet, ""))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {inline(lines.join("\n"))}
          </p>
        );
      })}
    </div>
  );
}
