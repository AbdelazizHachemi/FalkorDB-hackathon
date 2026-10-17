# Held — Graph Hacks: Context for AI Agents

**A multi-agent handoff that remembers its reason after the chat is gone.**

Built for [Graph Hacks: Context for AI Agents](https://www.wemakedevs.org/hackathons/falkordb), powered by FalkorDB.

> **Live demo:** [throw-winston-beneficial-partner.trycloudflare.com](https://throw-winston-beneficial-partner.trycloudflare.com)
>
> **Safety:** Synthetic demo only. Not for treatment. A clinician decides what a real person takes.

## The demo

Patient A already has an active ibuprofen order. The ward agent records a synthetic kidney finding, creating a hold linked to the finding, public label, admission, prescriber, and policy. Later, a pharmacy agent starts a new session and tries the same restart. It has no old chat to consult: FalkorDB returns the connected reason, and the deterministic decision blocks the restart.

Patient B lives in a separate FalkorDB graph. B has a synthetic headache finding and no hold, so the same restart is allowed. The demo makes the graph consequential: it supplies the evidence used by the decision, not just a picture beside it.

The implementation was built for Graph Hacks. The included check exercises the allow, hold, block, parallel blocked attempts, and separate-patient cases.

## Run locally

Requirements: Node.js 22 or newer, npm, and Docker Compose.

```bash
npm ci
docker compose up -d falkordb
npm run check
npm run dev
```

Open <http://localhost:8787>. To reset the synthetic graphs separately, run `npm run seed`. **Both `npm run seed` and `npm run check` delete and recreate `held_a` and `held_b`.** Do not run them against demo data you intend to keep.

For a production-style local stack, `docker compose up -d --build` also starts the app and a Cloudflare Quick Tunnel. Read “Deploy on a VPS” first; the tunnel URL is temporary.

## Walk-through and video

The live demo is a [temporary Cloudflare Quick Tunnel](https://throw-winston-beneficial-partner.trycloudflare.com). It is up at the time this README was updated; Quick Tunnel URLs can change or stop working. Check the URL before submitting.

### Record the demo

Record a single browser window and your narration. Keep it under three minutes. Before recording, reset only the synthetic demo graphs on the VPS so the first Patient A restart is allowed:

```bash
ssh -i ~/.ssh/id_ed25519_falkordb_hackathon_vps USER@VPS_IP
cd FalkorDB-hackathon
docker compose run --rm app npm run seed
```

This intentionally resets both demo graphs. Reload the live page before recording and confirm it responds. Show the full browser window and click these controls in order: **Patient A → Restart ibuprofen → Record kidney finding → Restart ibuprofen → Patient B → Restart ibuprofen**. The second restart on A should be blocked; B should be allowed. Avoid showing terminals with credentials, private keys, or other personal information.

### Suggested narration (about 90 seconds)

> “This is Held, my entry for Graph Hacks: Context for AI Agents, powered by FalkorDB. It demonstrates an agent handoff where the graph—not a copied chat transcript—carries the reason for a decision.”
>
> “Patient A is synthetic. Nothing is held yet, so the pharmacy agent can propose an ibuprofen restart.”
>
> “Now the ward agent records a synthetic kidney finding. That writes a hold connected to the finding, an openFDA label, the admission, the prescriber, and the policy.”
>
> “I’m starting a new pharmacy session. The chat is empty, but FalkorDB still has the hold. The graph query returns the path behind it, so the restart is blocked. You can see the finding, cited label, prescriber, admission, and policy in the result.”
>
> “Patient B is stored in a different FalkorDB graph. B has a headache and no hold, so the same proposed restart is allowed. Patient A’s hold did not cross into B’s graph.”
>
> “The decision is deterministic Cypher, not a model-generated medical recommendation. This is fictional demo data, not for treatment; a clinician makes real care decisions.”

### Where to host the recording

Recommended: upload the video to **YouTube as Unlisted**, then open the link in a private/incognito window to confirm judges can view it without signing in. Unlisted means anyone with the link can watch, so don’t show secrets or personal information. Loom or another host with a publicly accessible link is also fine. Put the final video URL in the hackathon submission and replace the “Video” line below.

- **Video:** Not recorded yet.

## How it works

- `src/graph.ts` owns parameterized FalkorDB queries, graph writes, and the deterministic `blockPath` decision.
- `src/agents.ts` exposes the ward and pharmacy actions used by both HTTP and MCP.
- `src/server.ts` serves the demo page and HTTP routes.
- `src/mcp.ts` exposes `record_finding`, `propose_order`, `why`, and `health` as MCP tools.
- `src/seed.ts` creates two independent synthetic graphs, `held_a` and `held_b`.
- `src/check.ts` checks the central story, including parallel requests after the hold exists.

The decision is intentionally narrow: `proposeOrder` allows only when `blockPath` returns no row. FalkorDB being unavailable produces no decision; there is no in-memory graph fallback. The parallel check proves that concurrent proposals are blocked when the hold already exists; it does not claim to solve a race where a hold is created between the path read and order write.

The demo is not a clinical system. It does not diagnose, recommend treatment, supply doses, or use real patient data.

## Hackathon tracks

1. **Agents that act:** the pharmacy action is allowed or blocked based on a FalkorDB query.
2. **Memory and coordination:** a new session reads the ward agent’s graph-written hold; a separate patient graph stays isolated.
3. **Company brain:** the returned path connects the decision to its prescriber, admission, policy, finding, and cited label.

## AI disclosure

Cursor with Grok assisted in producing the repository from the Held build specification. I am responsible for reviewing and explaining the implementation. The allow/block decision is deterministic Cypher in `src/graph.ts`; a model does not choose it.

## Deployment

The VPS deployment uses Docker Compose and a Cloudflare Quick Tunnel, so no domain or inbound HTTP/HTTPS firewall ports are required. FalkorDB is reachable only on the private Compose network, with its Browser port bound to VPS loopback for optional SSH-tunnel access. Its data is stored in a named volume.

Quick Tunnels are intended for testing and development: URLs are temporary, may change on restart, have no uptime guarantee, support up to 200 in-flight requests, and do not support Server-Sent Events. The API has no authentication. Use fictional data only, do not expose secrets, and stop the demo when it is no longer needed. Never open FalkorDB port `6379` to the public internet.

To update a running checkout on the VPS:

```bash
git pull
docker compose up -d --build
docker compose logs cloudflared
```

Use the URL shown in the tunnel logs if it has changed. To inspect the app and database:

```bash
docker compose logs -f app cloudflared falkordb
```

## Project links

- [Live demo](https://throw-winston-beneficial-partner.trycloudflare.com)
- [Graph Hacks: Context for AI Agents](https://www.wemakedevs.org/hackathons/falkordb)
- [Build story draft](./BLOG.md)
