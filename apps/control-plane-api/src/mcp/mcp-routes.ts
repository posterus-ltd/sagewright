import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { AppDeps } from '../app';
import { buildMcpServer } from './mcp-server';

/**
 * Mounts the MCP endpoint (`POST /mcp`) on the existing control-plane app. Transport is
 * Streamable HTTP in STATELESS mode: a fresh server + transport per request, fully
 * isolated, carrying the caller's identity resolved by requireMcpCaller. No session-id
 * bookkeeping, so GET/DELETE (server→client streaming / teardown) don't apply and are
 * rejected per the spec's method-not-allowed shape. Reachable only on the internal
 * `sagewright` network — no public exposure, and every request needs the bearer token.
 */
export const registerMcpRoutes = (app: FastifyInstance, deps: AppDeps): void => {
  app.post('/mcp', { preHandler: app.requireMcpCaller }, async (req: FastifyRequest, reply: FastifyReply) => {
    // Take over the raw socket: the MCP transport writes the JSON-RPC / SSE response
    // itself, so Fastify must not also try to serialise a reply.
    reply.hijack();
    const server = buildMcpServer(deps, { userId: req.userId!, callerSessionId: req.mcpSessionId! });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    reply.raw.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      // Pass the already-parsed body so the transport doesn't re-read the consumed stream.
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } catch (err) {
      app.log.error({ err: String(err) }, 'mcp request failed');
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'content-type': 'application/json' });
        reply.raw.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'internal error' }, id: null }));
      }
    }
  });

  const methodNotAllowed = async (_req: FastifyRequest, reply: FastifyReply) =>
    reply.code(405).send({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });

  app.get('/mcp', { preHandler: app.requireMcpCaller }, methodNotAllowed);
  app.delete('/mcp', { preHandler: app.requireMcpCaller }, methodNotAllowed);
};
