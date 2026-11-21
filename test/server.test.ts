import assert from "node:assert/strict";
import { it } from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { loadConfig } from "../src/config.js";
import { Logger } from "../src/logger.js";
import { buildContext } from "../src/pipeline.js";
import { createMcpServer } from "../src/server/index.js";
import { packageMetadata } from "../src/metadata.js";

it("initializes MCP, discovers tools, and validates and executes authenticated calls", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const spec = {
    openapi: "3.0.3",
    info: { title: "Integration", version: "1" },
    servers: [{ url: "https://api.example.com" }],
    paths: {
      "/pets/{id}": {
        post: {
          operationId: "health",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  nullable: true,
                  properties: { name: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
  };
  const config = loadConfig({
    OPENAPI_SOURCE: "https://spec.example.com/spec.json",
    API_HEADERS: '{"Authorization":"Bearer test-token"}',
  });
  const context = await buildContext(config, new Logger({ level: "error" }), async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url) === config.source) return Response.json(spec);
    const status = String(url).endsWith("/missing")
      ? 404
      : String(url).endsWith("/broken")
        ? 500
        : 200;
    return Response.json({ status }, { status });
  });
  assert.equal(new Headers(calls[0]?.init?.headers).get("authorization"), "Bearer test-token");
  const server = createMcpServer(context);
  const client = new Client({ name: "openwire-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    assert.equal(client.getServerVersion()?.name, "openwire");
    assert.equal(client.getServerVersion()?.version, packageMetadata.version);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), ["health", "health2"]);
    const health = await client.callTool({ name: "health", arguments: { echo: "ready" } });
    assert.deepEqual(health.content, [{ type: "text", text: "ok: ready" }]);
    for (const id of ["present", "missing", "broken"]) {
      const result = await client.callTool({ name: "health2", arguments: { id, body: null } });
      assert.equal(result.isError, id !== "present");
      assert.match(
        JSON.stringify(result.content),
        new RegExp(`HTTP ${id === "present" ? 200 : id === "missing" ? 404 : 500}`),
      );
    }
    assert.equal(new Headers(calls[1]?.init?.headers).get("authorization"), "Bearer test-token");
    assert.equal(calls[1]?.init?.body, "null");
    const before = calls.length;
    const invalid = await client.callTool({ name: "health2", arguments: { id: 123, body: null } });
    assert.equal(invalid.isError, true);
    assert.equal(calls.length, before);
  } finally {
    await client.close();
    await server.close();
  }
});
