"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

// "Describe the home" (spec 0012): hands the text to the assistant, which fills
// its composer without sending (spec 0006, AC-13). Signed out visitors pass
// through sign in and come back to the same address.
export function DescribeBox({ examples }: { examples: readonly string[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const q = text.trim();
        router.push(q ? `/assistant?${new URLSearchParams({ q })}` : "/assistant");
      }}
    >
      <label htmlFor="describe-home" className="sr-only">
        Describe the home you&apos;re looking for
      </label>
      <Textarea
        id="describe-home"
        rows={3}
        maxLength={500}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="A 4 bedroom family home in Uposhohor or Shibgonj, around 2 crore, near a good school"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit">Ask the assistant</Button>
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            lang={/[ঀ-৿]/u.test(example) ? "bn" : undefined}
            onClick={() => setText(example)}
            className="rounded-full border border-line-strong bg-surface-raised px-3 py-1.5 text-xs text-fg hover:bg-surface-sunken"
          >
            {example}
          </button>
        ))}
      </div>
    </form>
  );
}
