import { blockPath, graphFor, ping, proposeOrder, recordFinding, RequestError } from './graph.ts'
import type { BlockRow, GraphName, ProposeResult } from './graph.ts'

function graphOf(patient: string): GraphName {
  const name = graphFor(patient)
  if (!name) throw new RequestError(404, 'Unknown patient')
  return name
}

export async function wardAgent(patient: string, kind: string): Promise<{ holdId: string | null }> {
  return recordFinding(graphOf(patient), kind)
}

export async function pharmacyAgent(patient: string, session: string, drug: string): Promise<ProposeResult> {
  return proposeOrder(graphOf(patient), session, drug)
}

export async function why(patient: string, drug: string): Promise<BlockRow[]> {
  return blockPath(graphOf(patient), drug)
}

export async function health(): Promise<'ok'> {
  await ping()
  return 'ok'
}
