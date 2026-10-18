# 0006. AI home finder chat: rationale

The decision record behind [index.md](index.md). `/develop` does not need this file.

## Context

The assistant is the product: the success metric is viewings booked through it. Buyers are local families and families abroad, often on phones, writing in English, Bangla script, or Bangla in Latin letters. The scope's promise is "never invented listings", and the agency's brand rests on hand checked homes.

Forces:
- **Grounding.** A language model will happily invent a home, a price, or a school. Anything shown as a listing must come from the database.
- **Model uncertainty.** Spec 0001 chose `gpt-oss-120b` through OpenRouter, an open weights model whose Bangla quality and tool calling vary by upstream provider.
- **Cost.** Every message costs tokens; spec 0001's spend cap protects the bill but lets one abuser stop the assistant for everyone.
- **Serverless limits.** A reply must finish inside Vercel's function limit (60 seconds on Hobby) and survive the visitor closing the tab.
- **Settled storage.** Spec 0002 already stores AI SDK message parts, briefs, recommendations, and daily usage.
- **Agents know the business.** Office hours, fees, and the viewing process change, and agents, not engineers, know them.

## Options considered

### Option 1: Server tools over the database, computed scores, strict grounding, eval gate (chosen)
The model talks and calls three tools; everything factual comes from tool results, the brief, or the fact sheet.
**Pros**: no invented homes; trustworthy scores; model swappable and testable.
**Cons**: more "ask an advisor" answers; more server code (scoring, near misses, grounding check, eval).

### Option 2: Retrieval augmented generation over listing text (embeddings)
Embed listings and let the model read the nearest ones.
**Pros**: handles fuzzy wishes ("bright, quiet") well.
**Cons**: a vector store and embedding pipeline; budget and bedroom limits become soft, so it can suggest homes over budget; spec 0002 deliberately chose typed filters.

### Option 3: Let the model write the match score and suggest chips
**Pros**: less code; feels adaptive.
**Cons**: unexplainable, unstable numbers; more tokens per reply; chips that promise things the assistant can't do.

### Option 4: General knowledge answers with a caveat
**Pros**: richer replies about neighbourhoods.
**Cons**: confident errors about specific streets, flooding, or schools, presented next to verified listings.

## Rationale

Grounding drives most choices. Typed filters plus tool only listings keep the "never invented" promise structurally, and the server side grounding check plus the eval catch the remaining failure: the model naming a home in prose. A fixed match formula makes the mockup's "96% match" honest and repeatable. The cross check showed that scoring only exact search results would always read 100%, so the search fetches candidates slightly beyond the brief and lets the formula rank them; exact matches lead, and close ones are labelled with what differs. Cards are redrawn from current data on every load, because a saved chat would otherwise keep advertising sold homes.

Running the model test as the first build step, not before the spec, is deliberate: the test only means something with the real tools and seeded listings, and the spec's design does not depend on which model passes; switching is an env var.

The 40 message daily limit answers spec 0001's abuse concern with the table spec 0002 already has. Counting only successful replies keeps failures from punishing buyers.

The engineer chose an agent edited fact sheet over a file in the repo, so the agency can update hours or fees without a deploy. Versioning with authors and restore is the cheapest way to keep that safe, since the text reaches every prompt.

Prefilled, not auto sent, handoffs and fixed chips keep the visitor in control of what is spent and keep the assistant from suggesting things it cannot do.
