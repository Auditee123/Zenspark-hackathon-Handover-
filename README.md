# Handover on AgentMesh (ZenSpark ZE_000046)

Three AgentMesh agents (`handover-orchestrator`, `handover-qa`, `handover-kt-session`) run as their exported
agent hosts on localhost, driven by a React front end grown from the AgentMesh Serve scaffold. All data is synthetic.

## Before you start

- **This repo is public.** The exported hosts and the downloaded kit contain private platform URLs, so
  `agentmesh/hosts/` and `inputs/` are gitignored. Never commit an `.env` file.
- Run `make setup` once: it enables `.githooks/pre-commit`, which blocks secrets and private endpoints.
- Connect the **Zenspark VPN**. The hosts call the AgentMesh platform services on a private network.

## Hosts

| Agent | Port |
|---|---|
| handover-orchestrator | 8001 |
| handover-qa | 8002 |
| handover-kt-session | 8003 |

1. Put the host ZIPs (Builder → Deploy → Download ZIP) in `inputs/zips/`.
2. `make hosts-unpack`. This creates `agentmesh/hosts/<agent>/` and its `.env` (port, `AUTH_MODE=dev`, empty `AZURE_*` lines).
3. Fill in `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET` in each `.env` (from the organisers).
4. `make hosts`, then `make health`. The first start installs the AgentMesh SDK and a spaCy model (about 400 MB).

To change an agent, edit it in the AgentMesh Builder, export again, and re-run `make hosts-unpack`.
