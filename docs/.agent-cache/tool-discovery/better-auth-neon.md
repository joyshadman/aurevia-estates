# Tool discovery: Better Auth, Neon, hCaptcha

Date: 2026-10-22
Scope: skills and MCP servers only. Nothing was installed.

## Installed (excluded from candidates)

From `skills-lock.json` and `.claude/skills/` (18 entries, same set):
ai-sdk, architect, audit, check, debug, develop, document, prisma-client-api, prisma-orm-setup, react-email, receiving-webhooks, resend, scope, sentry-nextjs-sdk, supabase, supabase-postgres-best-practices, sync, test, vercel-react-best-practices.

Note: `skills-lock.json` lists `vercel-react-best-practices` and `ai-sdk` only once each; no Better Auth or Neon skill is installed.

## Better Auth

Skill candidates, from `npx skills find` and `npx skills add better-auth/skills --list` (listed, not installed):

- `better-auth/skills` (official org, Better Auth). Skills:
  - `better-auth-best-practices`: server and client config, adapters, sessions, plugins.
  - `create-auth`: scaffold auth in an existing app, route handlers, OAuth.
  - `better-auth-security-best-practices`: rate limits, secrets, CSRF, trusted origins, cookies.
  - `email-and-password-best-practices`: verification, reset flow, password policy.
  - `organization-best-practices`: orgs, roles, RBAC (only if orgs are needed).
  - `two-factor-authentication-best-practices`: TOTP, OTP, backup codes.
- Unofficial, not verified, not recommended without review: `secondsky/claude-skills@better-auth`, `jezweb/claude-skills@better-auth`, `bobmatnyc/claude-mpm-skills@better-auth-*`, `next-safe-action/skills@safe-action-better-auth`, `andrelandgraf/fullstackrecipes@better-auth-setup`.

MCP candidates:
- Better Auth docs MCP server (official, docs search only, not an auth implementation): `npx auth@latest mcp --claude-code` (CLI option per better-auth.com/docs/ai-resources/mcp; remote endpoint https://mcp.better-auth.com/mcp).
- Better Auth MCP plugin (`@better-auth/mcp`) is for protecting your own app as an MCP OAuth server. Not relevant for this project's login. Source notes it may be deprecated in favor of the OAuth Provider plugin; unverified.

## Neon

Skill candidates, from `npx skills find` and `--list`:

- `neondatabase/agent-skills` (official Neon org). Skills:
  - `neon`: overview, picks Neon for backend, CLI and MCP setup.
  - `neon-postgres`: connections, pooled vs direct, migrations, branching. Best match for `DATABASE_URL` work.
  - `neon-postgres-branches`: branch-per-test workflows.
  - `neon-postgres-egress-optimizer`: cost and query overfetch.
  - `neon-auth`: Managed Better Auth. Overlaps with the chosen Better Auth; use only if Neon Auth is picked.
  - `neon-functions`, `neon-object-storage`, `neon-ai-gateway`, `neon-realtime`, `claimable-postgres`: outside the current stack; skip unless needed.
- `neondatabase/ai-rules` (official Neon org). Skills:
  - `neon-serverless`: configures `@neondatabase/serverless` for Next.js and Vercel. Most relevant here.
  - `neon-drizzle`: Drizzle ORM, not used here (project uses Prisma).
  - `neon-auth`, `neon-js`, `neon-toolkit`, `add-neon-docs`: lower relevance.
- `neondatabase/postgres-skills@postgres-best-practices` (official Neon org): appeared in find results, not confirmed with `--list`.
- Unofficial, not recommended: `sickn33/agentic-awesome-skills@neon-postgres`, `clickhouse/agent-skills@infra-postgres`.

MCP candidates:
- Official Neon MCP server, remote: `https://mcp.neon.tech/mcp`.
- Setup per https://neon.com/docs/ai/neon-mcp-server: `npx neon@latest mcp` (interactive wizard that writes the config and asks which agents to install into and how to authenticate). Or `npx neon@latest plugins` (installs the MCP server plus agent skills).
- A direct `claude mcp add` line is NOT documented on the page I fetched. Inferred form, unverified: `claude mcp add --transport http neon https://mcp.neon.tech/mcp`. Check the Neon "Connect MCP clients" guide (https://neon.com/docs/ai/connect-mcp-clients-to-neon) before using it.

## hCaptcha

- No official hCaptcha skill found.
- Search hits were all unofficial captcha-solving or anti-bot bypass skills (for example `browserbase/skills@what-antibot`, `biggora/claude-plugins-registry@captcha`, `manyuegong33/r0crawl_skills@vendor-hcaptcha`). Not credible for a production signup flow; not recommended.
- No hCaptcha MCP server found.

## Notes

- The project chose Better Auth. `neondatabase/agent-skills@neon-auth` and `neondatabase/ai-rules@neon-auth` would push toward Neon's managed auth instead; pick one.
- Search budget: 3 web searches, 1 fetch used.
