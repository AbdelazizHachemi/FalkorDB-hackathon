# The next shift was not allowed to restart ibuprofen

*My project story for Graph Hacks: Context for AI Agents, powered by FalkorDB.*

**Held is a synthetic multi-agent handoff demo. A ward agent records a hold in FalkorDB; a pharmacy agent, in a new session, has to discover the reason before it can propose a restart.**

[Try the live demo](https://throw-winston-beneficial-partner.trycloudflare.com) · [View the source](https://github.com/AbdelazizHachemi/FalkorDB-hackathon)

## The challenge I chose

Graph Hacks asked builders to give agents connected context, memory across sessions, and decisions people can trace. I wanted the graph to do more than sit beside an agent as a visualization. It had to change what the agent did.

That became **Held**: a fictional shift-change handoff. Patient A has an active ibuprofen order. A ward agent records a synthetic kidney finding and writes a hold. Later, a pharmacy agent opens a new session and tries to restart the drug. It has no ward chat to reread. It has to ask FalkorDB.

The point is not medication advice. The patients are fictional, and the app is not for treatment. A clinician makes decisions about real people.

## Make the graph consequential

When the pharmacy agent calls `proposeOrder`, the application runs one parameterized Cypher query, `blockPath`. The query follows the hold to its finding, the cited public label, the policy, the prescriber, and the admission.

If FalkorDB returns a path, the operation is blocked and the result shows the reason. If the path is empty, the proposal is allowed. The decision is deterministic application logic—not a language model’s interpretation of a paragraph.

That choice shaped the whole demo. The graph is the memory and the evidence behind the action. If FalkorDB is unavailable, the service returns no decision; it does not quietly fall back to an in-memory copy.

## Two agents, no shared transcript

The ward agent records the finding and creates a hold connected to the drug, finding, label, and policy. A `HANDOFF` edge records the transfer to the pharmacy agent.

The pharmacy agent gets a new session ID. It does not inherit the ward conversation. It reads the graph, records an attempt, and either blocks without creating an order or creates an active synthetic order when no hold exists.

The second graph matters just as much. Patient B lives in `held_b`, separate from Patient A’s `held_a`. B has a headache finding and no hold. The same restart is allowed there; A’s context does not leak across graphs.

## A small demo with an observable check

I kept the scope to one scene: an allow, the ward handoff, a block with its evidence, and an allow in the other patient’s graph. The browser page uses the same agent functions as the MCP tools, so the demo is still easy to follow without installing a separate MCP client.

The project includes `npm run check` to rebuild the two synthetic graphs and assert the expected behavior. It checks that the initial proposal is allowed, the kidney finding creates an active hold, a later proposal is blocked with the label and policy in its result, concurrent proposals are blocked once the hold exists, and Patient B remains clear.

That concurrency check is deliberately specific: it tests parallel pharmacy proposals after the hold is present. It is not a claim that a simultaneous hold write and order write are transactionally serialized.

## Built for Graph Hacks

I built Held for **Graph Hacks: Context for AI Agents**, the online WeMakeDevs hackathon powered by FalkorDB. The entry maps to the event’s themes in one connected flow:

- **Agents that act:** the graph query decides whether a proposal is allowed.
- **Memory and coordination:** the pharmacy agent discovers a hold written by another agent after a session change.
- **Company brain:** the answer can be traced through the people, admission, policy, finding, and label connected to the decision.

The [live demo](https://throw-winston-beneficial-partner.trycloudflare.com) is published through a Cloudflare Quick Tunnel from my VPS. That made a public demo possible without buying a domain. The trade-off is that Quick Tunnel URLs are temporary and have no uptime guarantee, so the video and source are important companions to the live link.

## What I learned

The useful question was not “how do I make an agent sound intelligent?” It was “what must the next agent be able to recover, and how can a person inspect why it acted?” Modeling the hold as connected, persistent state answered both.

Keeping the decision narrow also made the demo easier to explain. The model can help build or narrate the project, but the allow/block rule is visible in Cypher and can be tested without a model call.

The limits matter. This is a hackathon-scale synthetic demonstration, not a medication-safety product. Its API has no authentication, its sample data is not clinical evidence, and a graph path is not a substitute for professional judgment.

## Project links and disclosure

- **Live demo:** [Held on Cloudflare Quick Tunnel](https://throw-winston-beneficial-partner.trycloudflare.com)
- **Source:** [AbdelazizHachemi/FalkorDB-hackathon](https://github.com/AbdelazizHachemi/FalkorDB-hackathon)
- **Event:** [Graph Hacks: Context for AI Agents](https://www.wemakedevs.org/hackathons/falkordb)
- **Demo video:** add the public or unlisted video URL here after recording.

Cursor with Grok assisted in producing the repository from the Held build specification. I reviewed the project and remain responsible for explaining it. The decision is deterministic Cypher; a model does not choose whether to allow or block.
