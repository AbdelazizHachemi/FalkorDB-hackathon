# Held — Graph-backed handoffs for AI agents

**When one agent hands off a decision, the next agent should inherit the evidence—not just a chat transcript.**

Held is a synthetic multi-agent handoff demo built for [Graph Hacks: Context for AI Agents](https://www.wemakedevs.org/hackathons/falkordb), powered by FalkorDB. A ward agent records a hold in the graph; a pharmacy agent in a fresh session retrieves the connected reason before a restart can be allowed.

> **Live demo:** [throw-winston-beneficial-partner.trycloudflare.com](https://throw-winston-beneficial-partner.trycloudflare.com)
>
> **Demo video:** [Watch the hackathon walkthrough](https://youtu.be/sWFOinI4W1c)
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

## Video and live demo

Watch the [hackathon walkthrough](https://youtu.be/sWFOinI4W1c), then try the [live demo](https://throw-winston-beneficial-partner.trycloudflare.com). The live app uses a temporary Cloudflare Quick Tunnel, so its URL may change or stop working; the video and source remain useful if it is offline. Make sure the video is viewable by judges without signing in.

## How it works

- `src/graph.ts` owns parameterized FalkorDB queries, graph writes, and the deterministic `blockPath` decision.
- `src/agents.ts` exposes the ward and pharmacy actions used by both HTTP and MCP.
- `src/server.ts` serves the demo page and HTTP routes.
- `src/mcp.ts` exposes `record_finding`, `propose_order`, `why`, and `health` as MCP tools.
- `src/seed.ts` creates two independent synthetic graphs, `held_a` and `held_b`.
- `src/check.ts` checks the central story, including parallel requests after the hold exists.

### Graph data model

Each synthetic patient has a separate FalkorDB graph (`held_a` or `held_b`). Both graphs model `Patient`, `Admission`, `Person`, `Agent`, `Drug`, `Label`, and `Policy` nodes; the demo adds `Finding`, `Hold`, `Attempt`, and `Order` nodes as the scenario runs.

Key relationships are `Patient-[:HAS]->Admission`, `Person-[:OWNS]->Admission`, `Agent-[:RECORDED]->Finding-[:ON]->Admission`, and `Hold-[:BLOCKS]->Drug`. A hold also connects to its evidence and governing context through `Hold-[:BECAUSE]->Finding`, `Hold-[:CITES]->Label`, and `Hold-[:UNDER]->Policy`. `Agent-[:HANDOFF]->Agent` records the agent transition. Attempts connect to drugs with `Attempt-[:TRIED]->Drug`; allowed proposals additionally create `Person-[:ORDERED]->Order-[:OF]->Drug` and `Order-[:DURING]->Admission`.

### Cypher decision query

`blockPath` in `src/graph.ts` searches for an active hold and returns the evidence chain used to explain a blocked proposal. The `$drug` value is passed as a query parameter:

```cypher
MATCH (d:Drug {id: $drug})<-[:BLOCKS]-(h:Hold)
WHERE h.invalid_at IS NULL
MATCH (h)-[:BECAUSE]->(f:Finding)
MATCH (h)-[:CITES]->(l:Label)
MATCH (h)-[:UNDER]->(p:Policy)
MATCH (f)-[:ON]->(adm:Admission)<-[:OWNS]-(prescriber:Person {role: 'prescriber'})
RETURN d.name AS drug,
       h.id AS hold,
       f.kind AS finding,
       l.sentence AS label,
       l.url AS url,
       p.text AS policy,
       prescriber.name AS prescriber,
       adm.id AS admission
```

`proposeOrder` blocks when this query returns a row; otherwise it allows the proposal. `recordFinding` writes the finding and hold, and `proposeOrder` writes the attempt and—only when allowed—the order. See `src/graph.ts` for the parameterized write queries.

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
- [Demo video](https://youtu.be/sWFOinI4W1c)
- [Graph Hacks: Context for AI Agents](https://www.wemakedevs.org/hackathons/falkordb)
- [Build story draft](./BLOG.md)
