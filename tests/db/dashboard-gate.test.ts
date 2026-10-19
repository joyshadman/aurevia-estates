import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Spec 0004, AC-8: every dashboard page calls `requireAgent()` itself (layouts
// don't rerun on client navigation). A lint rule can't see that, so this walks them.

function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pages(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}

describe("AC-8 (spec 0004): agent gate", () => {
  it("every app/dashboard page calls requireAgent", () => {
    const found = pages(join(process.cwd(), "app/dashboard"));
    expect(found.length).toBeGreaterThan(0);
    const ungated = found.filter((file) => !/requireAgent\(\{/.test(readFileSync(file, "utf8")));
    expect(ungated).toEqual([]);
  });
});
