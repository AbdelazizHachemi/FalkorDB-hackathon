# Held

Patient A is already on ibuprofen. Nothing is held, so a restart is allowed.
The ward agent records a kidney finding. The hold cites a public ibuprofen label and the policy that a hold survives the shift.
A new session has an empty chat. The pharmacy agent tries to restart ibuprofen. FalkorDB returns the path, and the restart is blocked.
Patient B is a different graph. A headache does not copy A's hold, so the same restart is allowed.

Synthetic demo. Not for treatment. A clinician decides what a real person takes.

The FalkorDB implementation was written for Graph Hacks.

## Run

Ports come from the FalkorDB getting-started page: server `6379`, browser `3000`. The Held page is `8787`.

```bash
docker compose up -d
npm install
npm run check
npm start
```

Open http://localhost:8787. FalkorDB Browser is http://localhost:3000.

The app and database ports bind to loopback by default. The API has no authentication and is for this synthetic demo only. Do not expose it publicly without putting it behind access controls; keep the FalkorDB ports private.

`npm run check` deletes `held_a` and `held_b`, seeds them, and exits 0 only when every step holds.
`npm run seed` loads the same two graphs without the asserts.

## Deploy on a VPS

The Compose stack runs the app and FalkorDB privately and exposes the app through a Cloudflare Quick Tunnel. It requires no domain or Cloudflare account. Port 3000 is bound to VPS loopback for optional SSH-tunnel access to FalkorDB Browser, and FalkorDB data uses a named Docker volume. Quick Tunnel URLs are temporary, may change when the tunnel restarts, and have no uptime guarantee. The app's demo API has no authentication and accepts synthetic writes. Use fictional data only; do not enter credentials or sensitive information, and take the demo offline when it is no longer needed.

Requirements: a Linux VPS with Docker Engine and the Compose plugin, outbound internet access, and SSH access on TCP port 22. The tunnel uses outbound connections; no inbound HTTP/HTTPS firewall ports are needed. Do not open 6379.

1. Push this folder to the public `AbdelazizHachemi/FalkorDB-hackathon` repository. From this folder, initialize and push only this project:

   ```bash
   git init -b main
   git add .
   git commit -m "Prepare Held hackathon demo"
   git remote add origin https://github.com/AbdelazizHachemi/FalkorDB-hackathon.git
   git push -u origin main
   ```

   Do not run these commands from the parent `infra` repository.

2. Add your SSH public key to the VPS in your provider's console. From the computer holding the private key, print the public key with:

   ```bash
   cat ~/.ssh/id_ed25519_falkordb_hackathon_vps.pub
   ```

   Connect using the account your provider supplied:

   ```bash
   ssh -i ~/.ssh/id_ed25519_falkordb_hackathon_vps USER@VPS_IP
   ```

3. On the VPS, install Docker Engine and the Compose plugin using Docker's official Ubuntu installation steps: <https://docs.docker.com/engine/install/ubuntu/>. Add your login account to the `docker` group only if you understand that membership grants root-equivalent access; otherwise prefix Docker commands with `sudo`.

4. Clone the public repo and start FalkorDB:

   ```bash
   git clone https://github.com/AbdelazizHachemi/FalkorDB-hackathon.git
   cd FalkorDB-hackathon
   docker compose up -d falkordb
   ```

5. Seed the two synthetic graphs once, then build and start the app and tunnel:

   ```bash
   docker compose run --rm app npm run seed
   docker compose up -d --build
   docker compose ps
   docker compose logs cloudflared
   ```

   Copy the `https://….trycloudflare.com` URL from the `cloudflared` logs and open it in a browser. `npm run seed` resets `held_a` and `held_b`; do not rerun it if you need to retain demo activity. The named FalkorDB volume survives container recreation; `docker compose down -v` deletes it. Cloudflare documents Quick Tunnels as testing/development only; they have no uptime guarantee, support up to 200 in-flight requests, and do not support Server-Sent Events (SSE).

6. For updates, run `git pull` and `docker compose up -d --build`; if the tunnel restarts and gets a new URL, get it again with `docker compose logs cloudflared`. To inspect logs, use `docker compose logs -f app cloudflared falkordb`. For FalkorDB Browser from your computer, open an SSH tunnel with `ssh -i ~/.ssh/id_ed25519_falkordb_hackathon_vps -L 3000:127.0.0.1:3000 USER@VPS_IP`, then browse to <http://localhost:3000>.

## Graph model

Two graphs. Same schema. No shared nodes. Isolation is the graph name, not a tenant filter.

| Graph | Patient | Hold at seed |
| --- | --- | --- |
| `held_a` | `patient_a` | none |
| `held_b` | `patient_b` | none |

`held_a` starts with one active ibuprofen order written by Mina Cole. `held_b` starts with a headache finding and no hold.

Labels: `Patient`, `Admission`, `Person`, `Agent`, `Drug`, `Order`, `Finding`, `Hold`, `Label`, `Policy`, `Attempt`.

A hold with no `invalid_at` is in force. Times are epoch milliseconds. The block query does no datetime math.

| Memory word | Where it lives |
| --- | --- |
| Episodic | `Attempt` and `Finding`, with `at` |
| Semantic | `Drug`, `Label`, `Person`, `Admission`, `Policy` |
| Procedural | `Hold` whose `invalid_at` is null |
| History | Attempts remain after the page session id changes |
| Shared state | The pharmacy agent reads the hold the ward agent wrote. `HANDOFF` records the hand |
| Separate tenant | `held_a` and `held_b` |

The label sentence was copied from openFDA on 10 October 2026, set id `00872852-680a-41b3-901b-b991b12a176d`:

> Patients at greatest risk of this reaction are those with impaired renal function, heart failure, liver dysfunction, those taking diuretics and ACE inhibitors, and the elderly.

## Cypher

`proposeOrder` allows only when `blockPath` returns no row. The decision is this query, not a model.

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

A `kidney_impairment` finding writes the hold in the same query. `invalid_at` is left unset. A headache writes the finding only. The writes are in `src/graph.ts`.

On a block, `proposeOrder` writes an `Attempt` and a `HANDOFF`, and it does not write an `Order`. On an allow, the pharmacist `rafi` writes an active order during the admission.

## Live URL

No public URL yet. Do not deploy this on the DevLearnOps VPS.

Local page: http://localhost:8787
Health: http://localhost:8787/health
Video file: not recorded.

## Tracks

1. Agents that act. The restart is allowed or blocked because `blockPath` returned rows.
2. Memory and coordination. A new session, the other agent, the hold still in force, the other patient isolated.
3. Company brain. The path names who ordered, which admission, which policy, and which label.

## AI disclosure

Cursor, with Grok, wrote this repo from the Held spec. `proposeOrder` is deterministic Cypher. A model does not choose allow or block. If the model is down, the block still happens.

## MCP

The page does not need an MCP client. The same four tools are at `POST /mcp`. This is a real `tools/list` response:

```text
record_finding  Writes a finding to FalkorDB. kidney_impairment also writes a hold.
propose_order   Writes an attempt to FalkorDB. Creates an order only when blockPath returns no row.
why             Reads FalkorDB. Returns the blockPath rows for a patient and drug.
health          Reads FalkorDB. Runs RETURN 1.
```

## Kill test

1. `npm start`
2. `docker compose stop`
3. `GET /health` returns 503. **Restart ibuprofen** prints `no decision`.
4. `docker compose start`
5. The same restart on Patient A is blocked again. There is no in-memory graph.

## Not for treatment

The patients are fictional. Held blocks a synthetic order in a demo. It does not treat anyone, name a dose, or load a real medication list.
