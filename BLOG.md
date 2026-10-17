# The next shift was not allowed to restart ibuprofen

Patient A was already on ibuprofen. The page session was new, and the chat box was empty. The pharmacy agent still could not restart the drug.

The ward agent had written a hold on an earlier request. That hold stayed in FalkorDB after the session id changed. The pharmacy agent did not receive a transcript. It ran one Cypher path: order, hold, finding, label, prescriber, admission, policy. The path returned a row, so the restart was blocked. The row named Mina Cole, a public ibuprofen label sentence about impaired renal function, and the policy that a hold stays in force across sessions until a clinician clears it.

Patient B is a second graph, `held_b`. B has a headache and no hold. The same restart was allowed. A's hold did not leak across the graph name.

Stopping FalkorDB made `GET /health` return 503. The button printed `no decision`. Starting the database brought the same block back. Nothing in the Node process stores a second copy of the graph.

This is a synthetic demo. A clinician decides what a real person takes.

The query that decides is `blockPath` in `src/graph.ts`.
