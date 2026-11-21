import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const temporary = await mkdtemp(join(tmpdir(), "openwire-package-"));
const metadata = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
let origin;
const api = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.headers.authorization !== "Bearer package-test") {
    response.writeHead(401).end('{"error":"unauthorized"}');
  } else if (request.url === "/spec.json") {
    response.end(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Package test", version: "1" },
        servers: [{ url: origin }],
        paths: {
          "/pets/{id}": {
            get: {
              operationId: "getPet",
              parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
            },
          },
        },
      }),
    );
  } else if (request.url === "/pets/missing") {
    response.writeHead(404).end('{"error":"not found"}');
  } else {
    response.end('{"name":"Rex"}');
  }
});
try {
  const [packed] = JSON.parse(
    execFileSync(npm, ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary], {
      encoding: "utf8",
    }),
  );
  assert.equal(packed.name, "openwire");
  assert.ok(packed.files.some((file) => file.path === "dist/index.js"));
  assert.ok(
    packed.files.every(
      (file) =>
        file.path.startsWith("dist/") ||
        file.path.startsWith("assets/") ||
        ["package.json", "README.md", "LICENSE", "CHANGELOG.md", "ROADMAP.md"].includes(file.path),
    ),
  );
  for (const asset of [
    "assets/brand/logo.svg",
    "assets/brand/logo-dark.svg",
    "assets/brand/icon.svg",
    "assets/diagrams/architecture.svg",
  ]) {
    assert.ok(
      packed.files.some((file) => file.path === asset),
      `Missing packaged asset: ${asset}`,
    );
  }
  execFileSync(
    npm,
    [
      "install",
      "--prefix",
      temporary,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      join(temporary, packed.filename),
    ],
    { stdio: "pipe" },
  );
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  origin = `http://127.0.0.1:${api.address().port}`;
  for (const command of ["openwire", "api-mcp-bridge"]) {
    const binary = resolve(temporary, "node_modules/.bin", command);
    assert.match(execFileSync(binary, ["--help"], { encoding: "utf8" }), /openwire/);
    for (const mode of ["legacy", "auto"]) {
      const transport = new StdioClientTransport({
        command: binary,
        args: ["--spec", `${origin}/spec.json`],
        stderr: "pipe",
        env: {
          ...process.env,
          ALLOW_INSECURE_HTTP: "true",
          LOG_LEVEL: "error",
          API_HEADERS: '{"Authorization":"Bearer package-test"}',
        },
      });
      const client = new Client({ name: "openwire-package-check", version: "1" });
      try {
        await client.connect(transport, { mode });
        assert.equal(client.getServerVersion()?.name, "openwire");
        assert.equal(client.getServerVersion()?.version, metadata.version);
        const { tools } = await client.listTools();
        assert.deepEqual(tools.map((tool) => tool.name).sort(), ["getPet", "health"]);
        const ok = await client.callTool({ name: "getPet", arguments: { id: "present" } });
        assert.equal(ok.isError, false);
        assert.match(JSON.stringify(ok.content), /Rex/);
        const missing = await client.callTool({ name: "getPet", arguments: { id: "missing" } });
        assert.equal(missing.isError, true);
        assert.match(JSON.stringify(missing.content), /404/);
      } finally {
        await client.close();
      }
    }
  }
  console.log(
    `Verified ${metadata.name}@${metadata.version}: tarball contents, installed commands, legacy/auto MCP, protected spec, API success and failure.`,
  );
} finally {
  api.closeAllConnections();
  if (api.listening) await new Promise((resolve) => api.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
