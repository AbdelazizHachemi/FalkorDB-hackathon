import { FalkorDB } from 'falkordb'

export const LABEL_SENTENCE =
  'Patients at greatest risk of this reaction are those with impaired renal function, heart failure, liver dysfunction, those taking diuretics and ACE inhibitors, and the elderly.'

export const LABEL_URL =
  'https://api.fda.gov/drug/label.json?search=set_id:%2200872852-680a-41b3-901b-b991b12a176d%22'

export const POLICY_TEXT =
  'A hold stays in force across sessions until a clinician clears it.'

const DRUG_ID = 'ibuprofen'
const WARD_REASON = 'Hold written. Pharmacy must read it before a restart.'

const PATIENT_GRAPH = {
  patient_a: 'held_a',
  patient_b: 'held_b',
} as const

export type PatientId = keyof typeof PATIENT_GRAPH
export type GraphName = (typeof PATIENT_GRAPH)[PatientId]
export type Decision = 'allowed' | 'blocked'
export type FindingKind = 'kidney_impairment' | 'headache'

export class RequestError extends Error {
  status: 400 | 404
  constructor(status: 400 | 404, message: string) {
    super(message)
    this.status = status
  }
}

export type BlockRow = {
  drug: string
  hold: string
  finding: string
  label: string
  url: string
  policy: string
  prescriber: string
  admission: string
}

export type ProposeResult = {
  decision: Decision
  rows: BlockRow[]
}

const BLOCK_PATH = `
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
`

let dbPromise: Promise<FalkorDB> | undefined
let openDb: FalkorDB | undefined

function connection(): Promise<FalkorDB> {
  // reconnectStrategy is a Redis socket option the FalkorDB type leaves out. false stops the retry loop so a stopped database fails the request.
  const socket = { connectTimeout: 2000, reconnectStrategy: false as const }
  dbPromise ??= FalkorDB.connect({
    host: process.env.FALKOR_HOST ?? 'localhost',
    port: Number(process.env.FALKOR_PORT ?? 6379),
    socket,
  }).then((db) => {
    openDb = db
    db.on('error', () => {
      if (openDb !== db) return
      openDb = undefined
      dbPromise = undefined
    })
    return db
  }).catch((err: unknown) => {
    dbPromise = undefined
    openDb = undefined
    throw err
  })
  return dbPromise
}

export async function close(): Promise<void> {
  const db = openDb
  openDb = undefined
  dbPromise = undefined
  try {
    await db?.close()
  } catch {
    // The socket is already closed when FalkorDB stops.
  }
}

function rows<T>(result: { data?: T[] }): T[] {
  return result.data ?? []
}

async function query<T>(
  name: GraphName,
  cypher: string,
  params?: Record<string, string | number>,
): Promise<T[]> {
  try {
    const db = await connection()
    const graph = db.selectGraph(name)
    const result = await graph.query<T>(cypher, params ? { params } : undefined)
    return rows(result)
  } catch (err) {
    if (err instanceof RequestError) throw err
    await close()
    throw err
  }
}

export function graphFor(patient: string): GraphName | null {
  if (patient === 'patient_a' || patient === 'patient_b') return PATIENT_GRAPH[patient]
  return null
}

function admissionId(name: GraphName): string {
  switch (name) {
    case 'held_a':
      return 'adm_a'
    case 'held_b':
      return 'adm_b'
    default: {
      const unexpected: never = name
      throw new Error(unexpected)
    }
  }
}

function parseKind(kind: string): FindingKind {
  switch (kind) {
    case 'kidney_impairment':
    case 'headache':
      return kind
    default:
      throw new RequestError(400, 'Unknown finding kind')
  }
}

export async function blockPath(name: GraphName, drug: string): Promise<BlockRow[]> {
  return query<BlockRow>(name, BLOCK_PATH, { drug })
}

export async function ping(): Promise<void> {
  await query<{ one: number }>('held_a', 'RETURN 1 AS one')
}

export async function countNodes(name: GraphName, label: 'Order' | 'Attempt' | 'Hold'): Promise<number> {
  const cypher = {
    Order: 'MATCH (n:Order) RETURN count(n) AS n',
    Attempt: 'MATCH (n:Attempt) RETURN count(n) AS n',
    Hold: 'MATCH (n:Hold) RETURN count(n) AS n',
  }[label]
  const found = await query<{ n: number }>(name, cypher)
  return found[0]?.n ?? 0
}

export async function holdInvalidAt(name: GraphName, id: string): Promise<number | null> {
  const found = await query<{ invalid_at: number | null }>(
    name,
    'MATCH (h:Hold {id: $id}) RETURN h.invalid_at AS invalid_at',
    { id },
  )
  const row = found[0]
  if (!row) throw new Error(`missing hold ${id}`)
  return row.invalid_at
}

export async function holdIds(name: GraphName): Promise<string[]> {
  const found = await query<{ id: string }>(name, 'MATCH (h:Hold) RETURN h.id AS id')
  return found.map((row) => row.id)
}

export async function recordFinding(name: GraphName, kind: string): Promise<{ holdId: string | null }> {
  const parsed = parseKind(kind)
  const at = Date.now()
  const findingId = `finding_${crypto.randomUUID()}`
  switch (parsed) {
    case 'headache': {
      const written = await query<{ id: string }>(
        name,
        `
        MATCH (ward:Agent {id: 'ward'})
        MATCH (adm:Admission {id: $admissionId})
        CREATE (f:Finding {id: $findingId, kind: $kind, at: $at})
        CREATE (ward)-[:RECORDED]->(f)
        CREATE (f)-[:ON]->(adm)
        RETURN f.id AS id
        `,
        { admissionId: admissionId(name), findingId, kind: parsed, at },
      )
      if (!written[0]?.id) throw new Error('finding was not written')
      return { holdId: null }
    }
    case 'kidney_impairment': {
      const holdId = `hold_${crypto.randomUUID()}`
      const written = await query<{ holdId: string }>(
        name,
        `
        MATCH (ward:Agent {id: 'ward'})
        MATCH (pharmacy:Agent {id: 'pharmacy'})
        MATCH (adm:Admission {id: $admissionId})
        MATCH (drug:Drug {id: 'ibuprofen'})
        MATCH (label:Label {id: 'ibuprofen_renal'})
        MATCH (policy:Policy {id: 'hold_survives_shift'})
        CREATE (f:Finding {id: $findingId, kind: $kind, at: $at})
        CREATE (ward)-[:RECORDED]->(f)
        CREATE (f)-[:ON]->(adm)
        CREATE (h:Hold {id: $holdId, valid_at: $at})
        CREATE (h)-[:BLOCKS]->(drug)
        CREATE (h)-[:BECAUSE]->(f)
        CREATE (h)-[:CITES]->(label)
        CREATE (h)-[:UNDER]->(policy)
        CREATE (ward)-[:WROTE]->(h)
        CREATE (ward)-[:HANDOFF {at: $at, reason: $reason}]->(pharmacy)
        RETURN h.id AS holdId
        `,
        {
          admissionId: admissionId(name),
          findingId,
          holdId,
          kind: parsed,
          at,
          reason: WARD_REASON,
        },
      )
      const id = written[0]?.holdId
      if (!id) throw new Error('hold was not written')
      return { holdId: id }
    }
    default: {
      const unexpected: never = parsed
      throw new Error(unexpected)
    }
  }
}

function writeFor(decision: Decision): 'order' | 'none' {
  switch (decision) {
    case 'allowed':
      return 'order'
    case 'blocked':
      return 'none'
    default: {
      const unexpected: never = decision
      throw new Error(unexpected)
    }
  }
}

export async function proposeOrder(name: GraphName, session: string, drug: string): Promise<ProposeResult> {
  if (drug !== DRUG_ID) throw new RequestError(400, 'Only ibuprofen can be proposed')
  if (!session) throw new RequestError(400, 'session is required')
  const path = await blockPath(name, drug)
  const decision: Decision = path.length > 0 ? 'blocked' : 'allowed'
  const at = Date.now()
  const attemptId = `attempt_${crypto.randomUUID()}`
  const reason =
    decision === 'blocked'
      ? 'Restart blocked. The hold is still in force.'
      : 'Restart allowed. No hold is in force.'
  const shared = {
    drug,
    attemptId,
    at,
    session,
    result: decision,
    reason,
  }
  const action = writeFor(decision)
  switch (action) {
    case 'none':
      await query(
        name,
        `
        MATCH (drug:Drug {id: $drug})
        MATCH (pharmacy:Agent {id: 'pharmacy'})
        MATCH (ward:Agent {id: 'ward'})
        CREATE (a:Attempt {id: $attemptId, at: $at, session: $session})
        CREATE (a)-[:TRIED {result: $result, at: $at}]->(drug)
        CREATE (pharmacy)-[:HANDOFF {at: $at, reason: $reason, attempt_id: $attemptId}]->(ward)
        RETURN a.id AS id
        `,
        shared,
      )
      return { decision, rows: path }
    case 'order':
      await query(
        name,
        `
        MATCH (drug:Drug {id: $drug})
        MATCH (pharmacy:Agent {id: 'pharmacy'})
        MATCH (ward:Agent {id: 'ward'})
        MATCH (pharmacist:Person {id: 'rafi'})
        MATCH (adm:Admission {id: $admissionId})
        CREATE (a:Attempt {id: $attemptId, at: $at, session: $session})
        CREATE (a)-[:TRIED {result: $result, at: $at}]->(drug)
        CREATE (pharmacy)-[:HANDOFF {at: $at, reason: $reason, attempt_id: $attemptId}]->(ward)
        CREATE (o:Order {id: $orderId, status: 'active', at: $at})
        CREATE (pharmacist)-[:ORDERED]->(o)
        CREATE (o)-[:OF]->(drug)
        CREATE (o)-[:DURING]->(adm)
        RETURN a.id AS id
        `,
        { ...shared, admissionId: admissionId(name), orderId: `order_${crypto.randomUUID()}` },
      )
      return { decision, rows: path }
    default: {
      const unexpected: never = action
      throw new Error(unexpected)
    }
  }
}

async function dropIfExists(name: GraphName): Promise<void> {
  const db = await connection()
  try {
    await db.selectGraph(name).delete()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/invalid|does not exist|no such|empty key/i.test(message)) return
    throw err
  }
}

const SHARED_SEED = `
CREATE (patient:Patient {id: $patientId, name: $patientName})
CREATE (adm:Admission {id: $admissionId, title: 'Night admission'})
CREATE (patient)-[:HAS]->(adm)
CREATE (mina:Person {id: 'mina', name: 'Mina Cole', role: 'prescriber'})
CREATE (rafi:Person {id: 'rafi', name: 'Rafi Duran', role: 'pharmacist'})
CREATE (mina)-[:OWNS]->(adm)
CREATE (ward:Agent {id: 'ward'})
CREATE (pharmacy:Agent {id: 'pharmacy'})
CREATE (drug:Drug {id: 'ibuprofen', name: 'Ibuprofen'})
CREATE (label:Label {id: 'ibuprofen_renal', url: $url, sentence: $sentence})
CREATE (policy:Policy {id: 'hold_survives_shift', text: $policy})
`

export async function resetAndSeed(): Promise<void> {
  await dropIfExists('held_a')
  await dropIfExists('held_b')
  const label = { url: LABEL_URL, sentence: LABEL_SENTENCE, policy: POLICY_TEXT, at: 1_760_000_000_000 }
  await query(
    'held_a',
    `
    ${SHARED_SEED}
    CREATE (order:Order {id: 'order_seed_a', status: 'active', at: $at})
    CREATE (mina)-[:ORDERED]->(order)
    CREATE (order)-[:OF]->(drug)
    CREATE (order)-[:DURING]->(adm)
    `,
    { ...label, patientId: 'patient_a', patientName: 'Patient A', admissionId: 'adm_a' },
  )
  await query(
    'held_b',
    `
    ${SHARED_SEED}
    CREATE (finding:Finding {id: 'finding_headache_b', kind: 'headache', at: $at})
    CREATE (finding)-[:ON]->(adm)
    `,
    { ...label, patientId: 'patient_b', patientName: 'Patient B', admissionId: 'adm_b' },
  )
}
