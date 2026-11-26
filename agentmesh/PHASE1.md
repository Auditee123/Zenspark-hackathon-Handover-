# Phase 1 report: the AgentMesh hosts on localhost (26 Nov 2026)

## Summary
The three exported hosts **install, start and are healthy** on 8001–8003, and the runtime contract is captured
(`API.md`). **Every agent run is blocked by a platform network issue.** Azure Content Safety and Prompt Shield
can't be reached privately from the Zenspark VPN, and all three agents are `strict`, so they refuse to run without
them. That needs the organisers or the mentor.

## What works
| Item | Result |
|---|---|
| Service principal (from `.env`) | Entra sign-in OK; Azure DevOps scope and Cognitive Services scope tokens issued |
| Private package feed | `agentzoo-sdk` 1.58.16 and `agentzoo-agent-horizontal` installed with the service principal (no `az`, no PAT) |
| Python | 3.12.16 (Homebrew); 3.14 avoided |
| VPN to the platform services | All 6 MCP services resolve to a private address and answer `/health` 200 |
| Hosts | `handover-orchestrator` :8001, `handover-qa` :8002, `handover-kt-session` :8003: `/health` = healthy |
| Contract | `/openapi.json` saved for all three; schemas and behaviour in `API.md` |
| Open questions settled | No SSE route (poll instead). `/approvals/{id}` body confirmed, including `submitted` + `input` for forms. Decisions are synchronous. H3's 2 approvals return 202 `partial` after the first |

## What is blocked
Every `POST /invoke` on all three hosts fails in 2–4 s, before any node runs:

```
status: error
error: input_governance_blocked: content_safety:unavailable,prompt_shield:unavailable
```

The host log shows:

```
Azure Content Safety call failed (skipped-auth-failed) …
azure.core.exceptions.HttpResponseError: (403) Public access is disabled. Please configure private endpoint.
Azure Prompt Shield call failed … 403 Forbidden
Prompt Shield unavailable; failing closed for strict agent
Input governance blocked invoke for agent 'handover-qa': ['content_safety:unavailable', 'prompt_shield:unavailable']
```

**Diagnosis:**

- **Not a credentials problem.** The service principal gets a Cognitive Services token. The 403 comes from the
  resource's network rule ("public access disabled").
- **The VPN doesn't reach the resource privately.** The Content Safety resource (`AZURE_CONTENT_SAFETY_ENDPOINT` in
  `.env`) only accepts calls through a private endpoint. Over the Zenspark VPN, even the VPN's own DNS server
  (`10.0.0.4`) resolves its hostname, and its `privatelink` name, to the **public** address. The platform services
  resolve to private addresses and work.
- **Hence the difference from the Builder.** The Builder's backend runs inside the network where the private
  endpoint exists. A laptop on the VPN doesn't get that private DNS entry.
- **All three agents fail closed.** They are `governance_level: strict`, and the SDK blocks strict agents when
  Prompt Shield is unavailable. The SDK reads no other setting here; the only related variable is the endpoint.

Not yet tested, because of the block:

- the qa answers;
- the kt turns;
- the orchestrator path (H2, then an approval, then the `review_plan` form);
- the "no registered table" fallback (`AGENT_NAME_PREFIX=wee77963`);
- `write_refused`.

## Options (needs a decision)
1. **Organisers fix the network (recommended; no change to our agents).** Ask them to make the Content Safety
   resource's private endpoint resolvable over the Zenspark VPN. That means linking the
   Cognitive Services `privatelink` private DNS zone to the VNet or DNS forwarder behind VPN DNS
   `10.0.0.4`, and allowing the route. Or they can allow the VPN's address range on the resource's network rules.
2. **Mentor provides a different `AZURE_CONTENT_SAFETY_ENDPOINT`** that is reachable from the VPN, with the
   *Cognitive Services User* role for our service principal. We only change `.env`.
3. **Lower governance in the Builder** from `strict` to `standard` on the three agents, then re-export.
   - Runs would then continue with Content Safety *not applied* and Prompt Shield *regex-only*. The SDK flags this
     visibly as "fail open".
   - This weakens the governance story for the jury, and changes the agents. It's your call, made in the Builder.

Not done, by design: editing `/etc/hosts`, patching the SDK, or editing the YAML locally.

## Questions for the mentor (copy-paste)
> Our exported agent hosts run on a laptop over the Zenspark VPN. They reach all six MCP services, but Azure Content
> Safety and Prompt Shield return `403 Public access is disabled. Please configure private endpoint.` Over the VPN,
> the content safety hostname (and its privatelink name) resolves to the public address, even via the VPN DNS
> 10.0.0.4, so our strict agents fail closed with `input_governance_blocked: content_safety:unavailable,
> prompt_shield:unavailable`.
>
> 1. Can the Cognitive Services `privatelink` private DNS zone be made resolvable on the VPN, or the VPN
>    range allowed on the resource?
> 2. Failing that, is there a content-safety endpoint we should use for local hosts?
> 3. Or should locally run agents use governance `standard` instead of `strict`?

## Housekeeping
- **Smoke-test transcripts** are in `agentmesh/smoke/` (gitignored). The Priya input was extracted from kit
  Appendix E.
- **Harmless warnings in the host logs:**
  - the tracing collector `ca-phoenix.internal` is unreachable from the laptop;
  - "governance violation record failed: PostgreSQL at localhost:5432 rejected SSL upgrade". The SDK tries to
    record violations in a default local Postgres; something else on this Mac listens on 5432.
- The `/invocations` store has no runs yet. Governance blocks happen before a run is recorded.
