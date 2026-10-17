import { localhostHostValidation, localhostOriginValidation, NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import { McpServer } from '@modelcontextprotocol/server'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { health, pharmacyAgent, wardAgent, why } from './agents.ts'

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] }
}

function failure(err: unknown) {
  const message = err instanceof Error ? err.message : 'tool failed'
  return { content: [{ type: 'text' as const, text: message }], isError: true as const }
}

export function heldMcpServer(): McpServer {
  const server = new McpServer({ name: 'held', version: '0.1.0' })
  server.registerTool(
    'record_finding',
    {
      description: 'Writes a finding to FalkorDB. kidney_impairment also writes a hold.',
      inputSchema: z.object({ patient: z.string(), kind: z.string() }),
    },
    async ({ patient, kind }) => {
      try {
        return text(await wardAgent(patient, kind))
      } catch (err) {
        return failure(err)
      }
    },
  )
  server.registerTool(
    'propose_order',
    {
      description: 'Writes an attempt to FalkorDB. Creates an order only when blockPath returns no row.',
      inputSchema: z.object({ patient: z.string(), session: z.string(), drug: z.string() }),
    },
    async ({ patient, session, drug }) => {
      try {
        return text(await pharmacyAgent(patient, session, drug))
      } catch (err) {
        return failure(err)
      }
    },
  )
  server.registerTool(
    'why',
    {
      description: 'Reads FalkorDB. Returns the blockPath rows for a patient and drug.',
      inputSchema: z.object({ patient: z.string(), drug: z.string() }),
    },
    async ({ patient, drug }) => {
      try {
        return text(await why(patient, drug))
      } catch (err) {
        return failure(err)
      }
    },
  )
  server.registerTool(
    'health',
    {
      description: 'Reads FalkorDB. Runs RETURN 1.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        return text(await health())
      } catch (err) {
        return failure(err)
      }
    },
  )
  return server
}

const validateHost = localhostHostValidation()
const validateOrigin = localhostOriginValidation()

export async function handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!validateHost(req, res) || !validateOrigin(req, res)) return
  const server = heldMcpServer()
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  await server.connect(transport)
  await transport.handleRequest(req, res)
}
