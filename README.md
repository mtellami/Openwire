# openwire

> A Model Context Protocol (MCP) server that loads OpenAPI 3.0/3.1 specifications (YAML or JSON) at runtime and dynamically exposes every endpoint as a fully validated MCP tool for LLMs.

Instead of hand-writing tool wrappers for each REST endpoint, give the bridge a local OpenAPI file path or a remote URL. It automatically turns each operation into a typed, validated MCP tool.

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Requirements](#requirements)
- [Migrating from api-mcp-bridge](#migrating-from-api-mcp-bridge)
- [Installation](#installation)
- [CLI Usage](#cli-usage)
- [MCP Client Configuration](#mcp-client-configuration)
- [Configuration & Environment Variables](#configuration--environment-variables)
- [Authentication](#authentication)
- [Compatibility and limitations](#compatibility-and-limitations)
- [Tool Mapping](#tool-mapping)
- [Security & Limits](#security--limits)
- [License](#license)

## Features

- **Dynamic spec ingestion** — loads OpenAPI 3.0.x and 3.1.x specs (JSON or YAML) from a local file path or a remote `http(s)://` URL at startup.
- **Zero glue code** — every operation in the spec becomes an MCP tool automatically; there is nothing to code per endpoint.
- **Type-safe input schemas** — path, query, header, and cookie parameters become top-level tool properties; the request body is exposed as a `body` property. Required fields are enforced.
- **Draft-07 compatible schema normalization** — OpenAPI 3.0 constructs such as `nullable: true` and boolean `exclusiveMinimum`/`exclusiveMaximum` are converted to JSON Schema the MCP/LLM layer understands.
- **`$ref` resolution** — local component references (`#/components/schemas/...`) are dereferenced recursively, with cycle and depth guards.
- **Input validation** — LLM-supplied arguments are validated against the generated JSON Schema with AJV (formats included) _before_ any network call; validation failures are returned as readable tool errors.
- **Automatic HTTP execution** — path parameters are URL-encoded and substituted, query/header/cookie parameters are serialized, and request bodies are sent as JSON with the correct `Content-Type`.
- **Header-based authentication** — inject static credentials via `API_AUTH_HEADERS`/`API_HEADERS` (or `-H`) when fetching the spec and calling API endpoints. Configured headers are not added to tool schemas.
- **Base URL override** — point the bridge at a different environment (staging, a local mock, an authenticated proxy) without editing the spec.
- **Optional response limits** — configure depth, array length, string length, and serialized character budgets. Limits are unlimited by default; tool responses flag truncation.
- **Built-in `health` tool** — a no-op bootstrap tool to verify the server is responding.
- **Failure handling** — invalid specifications prevent startup. Invalid tool arguments, network failures, and HTTP 4xx/5xx responses produce MCP tool errors.
- **Insecure HTTP allowed** — optional flag to permit plain `http://` targets.

## How It Works

```
OpenAPI spec (file or URL)
        │
        ▼
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│ Spec Loader       │───▶│ Parser            │───▶│ Schema Builder    │
│ (YAML/JSON, $ref  │    │ (3.0/3.1, ops →   │    │ (OpenAPI schema → │
│  dereference)     │    │  tool metadata)   │    │  MCP JSON Schema) │
└───────────────────┘    └───────────────────┘    └───────────────────┘
                                                          │
                                                          ▼
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│ MCP Server        │    │ Validator (AJV)   │    │ HTTP Executor     │
│ (stdio, one tool  │───▶│ (reject bad args) │───▶│ (call the API)    │
│  per operation)   │    └───────────────────┘    └─────────┬─────────┘
└───────────────────┘                                       ▼
                                                    ┌───────────────────┐
                                                    │ Sanitizer        │
                                                    │ (bounded response│
                                                    │  for LLM context) │
                                                    └───────────────────┘
```

1. **Load** — the spec is read from a file or fetched over HTTP(S) and parsed as JSON or YAML.
2. **Parse** — each path/verb pair becomes a `ParsedOperation`; `$ref`s are resolved, parameters merged, and tool names derived from `operationId`.
3. **Build schemas** — operation schemas are normalized and converted into the JSON Schema input contract for each MCP tool.
4. **Serve** — an MCP stdio server registers a `health` tool plus one tool per operation.
5. **Validate** — on each tool call, arguments are checked against the input schema with AJV before anything hits the network.
6. **Execute** — a real HTTP request is built (URL, headers, query, cookies, JSON body) and dispatched with a timeout.
7. **Sanitize** — the response body is compacted/truncated under configurable budgets and returned to the model, along with the HTTP status.

## Requirements

- Node.js `>= 20.19` (ESM, built-in `fetch`)
- An OpenAPI 3.0.x or 3.1.x specification, as JSON or YAML

## Migrating from api-mcp-bridge

```bash
npm uninstall -g api-mcp-bridge
npm install -g openwire
```

Change MCP client commands from `api-mcp-bridge` to `openwire`; for npx use `npx --yes --package openwire openwire --spec ./openapi.yaml`. Environment variables and CLI arguments remain compatible. The old command is also included as an alias in Openwire 1.2.0. The default MCP server identity is now `openwire`; `SERVER_NAME` remains available for overrides.

Source repository: [mtellami/openwire](https://github.com/mtellami/openwire). See [release notes](CHANGELOG.md) and the [optimization roadmap](ROADMAP.md).

## Installation

The npm package ships a compiled CLI. This project is an OpenAPI-to-MCP server, unrelated to the Apache ActiveMQ OpenWire protocol.

### Global install

```bash
npm install -g openwire
```

### Run-on-demand with npx

```bash
npx openwire --spec ./openapi.yaml
```

### From source

```bash
npm install
npm run build
npm run start -- --spec ./openapi.yaml
```

## CLI Usage

```
openwire [options] [source]
```

| Argument               | Description                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `-s, --spec <src>`     | Path to the spec file or an `http(s)://` URL.                                               |
| `-H, --headers <json>` | JSON object of headers injected into every request (e.g. `{"Authorization":"Bearer ..."}`). |
| `<src>` (positional)   | Same as `--spec`.                                                                           |
| `--help`               | Show usage.                                                                                 |

The spec source can also be provided via the `OPENAPI_SOURCE` environment variable. The CLI flag (or positional argument) takes precedence.

```bash
# Local file spec
openwire --spec ./openapi.yaml

# Remote spec URL
openwire --spec https://api.example.com/openapi.json

# Env-driven
OPENAPI_SOURCE=./openapi.yaml openwire
```

## MCP Client Configuration

`openwire` is a **stdio** MCP server, so it plugs into MCP-compatible clients (Claude Desktop, Cursor, VS Code Copilot, homegrown agents, etc.) as a stdio subprocess.

### Claude Desktop

Open `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`; Windows: `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "openwire": {
      "command": "openwire",
      "args": ["--spec", "/absolute/path/to/openapi.yaml"],
      "env": {
        "API_BASE_URL": "https://api.example.com"
      }
    }
  }
}
```

### Generic / JSON MCP client

```json
{
  "mcpServers": {
    "openwire": {
      "command": "openwire",
      "args": ["--spec", "https://api.example.com/openapi.json"]
    }
  }
}
```

### If the binary is not globally installed

Use plain `node`:

```json
{
  "mcpServers": {
    "openwire": {
      "command": "node",
      "args": ["/path/to/openwire/dist/index.js", "--spec", "./openapi.yaml"]
    }
  }
}
```

> Note: the tool list is fixed at startup — restart the MCP client whenever the upstream spec changes.

## Configuration & Environment Variables

The server is configured once at startup through environment variables (and the CLI `source` argument).

| Variable                     | Default         | Description                                                                                        |
| ---------------------------- | --------------- | -------------------------------------------------------------------------------------------------- |
| `OPENAPI_SOURCE`             | _(required)_    | Spec path or `http(s)://` URL to load at startup.                                                  |
| `OPENAPI_MAX_TOOLS`          | `100`           | Maximum number of MCP tools generated from the spec.                                               |
| `API_BASE_URL`               | from spec       | Overrides the selected operation, path, or document server URL for every request.                  |
| `API_TIMEOUT_MS`             | `30000`         | Per-request timeout for calls to the target API.                                                   |
| `API_MAX_RESPONSE_CHARS`     | unlimited       | Total character budget for sanitized responses returned to the model.                              |
| `SANITIZE_MAX_DEPTH`         | unlimited       | Max nesting depth kept when compacting JSON responses.                                             |
| `SANITIZE_MAX_ARRAY_LENGTH`  | unlimited       | Max number of array elements kept per array.                                                       |
| `SANITIZE_MAX_STRING_LENGTH` | unlimited       | Max length of an individual string value.                                                          |
| `LOG_LEVEL`                  | `info`          | `debug`, `info`, `warn`, or `error`.                                                               |
| `SERVER_NAME`                | `openwire`      | MCP server name reported to the client.                                                            |
| `SERVER_VERSION`             | package version | MCP server version reported to the client.                                                         |
| `ALLOW_INSECURE_HTTP`        | `false`         | When `true`, permits `http://` spec sources and target APIs; otherwise those requests are refused. |
| `API_AUTH_HEADERS`           | _(none)_        | JSON object of headers injected into every request (e.g. `{"Authorization":"Bearer ..."}`).        |
| `API_HEADERS`                | _(none)_        | Same as `API_AUTH_HEADERS`; takes precedence when both are set.                                    |

Example:

```bash
export OPENAPI_SOURCE=https://petstore3.swagger.io/api/v3/openapi.json
export API_BASE_URL=https://localhost:8080
export API_TIMEOUT_MS=15000
export API_MAX_RESPONSE_CHARS=50000
export LOG_LEVEL=debug
openwire
```

> When `API_BASE_URL` is set, every tool call is routed to that base URL regardless of what the spec declares, which is handy for mocking, staging, or authenticated gateways.

## Authentication

Openwire injects configured credentials as HTTP headers on spec downloads and API requests. Configured headers override tool-supplied header parameters of the same name. Configure them with `API_AUTH_HEADERS` (env), `API_HEADERS` (env, takes precedence), or the `-H/--headers` CLI flag (takes precedence over both).

The value is a JSON object of header name/value pairs:

```bash
export OPENAPI_SOURCE=https://api.example.com/openapi.json
export API_AUTH_HEADERS='{"Authorization":"Bearer eyJhbGciOi...","X-API-Key":"abc123"}'
openwire
```

Or via the CLI flag:

```bash
openwire --spec ./openapi.yaml -H '{"Authorization":"Bearer eyJhbGciOi..."}'
```

Supply precomputed Bearer tokens, Basic authorization values, API-key headers, or proxy headers. Security schemes in the spec are metadata: Openwire does not perform OAuth/OpenID flows or automatically inject query/cookie API keys. Query/cookie parameters declared by the spec remain ordinary tool arguments.

Static tokens only — if your API needs a fresh token per call (client-credentials exchange, short-lived JWTs), point `API_BASE_URL` at a proxy that acquires tokens, or rotate the header value before restarting the bridge.

> When the _spec file itself_ is served from a protected URL, the same headers are attached when fetching `OPENAPI_SOURCE` over HTTP(S).

## Compatibility and limitations

- Local references are supported; external references and recursive schema cycles are rejected.
- OpenAPI 3.0 schemas are normalized for draft-07 validation. OpenAPI 3.1 documents are accepted, but full JSON Schema 2020-12 semantics are not implemented.
- JSON request bodies (`application/json` and `application/*+json`) are supported and preferred. Other body encodings return a clear execution error when a body is supplied.
- Parameter serialization uses simple scalar/JSON values; OpenAPI `style`/`explode` rules are not fully implemented.
- Parameter names share one tool namespace; duplicate names across locations or a parameter named `body` can collide with the body argument.
- Server selection uses operation, path, then document precedence. Server-variable expansion is not implemented.

## Tool Mapping

- **Tool name** — derived from the operation's `operationId` (normalized to camelCase); falls back to `<method>_<path>` when no `operationId` exists. The built-in `health` name is reserved. Collisions get a numeric suffix (`getUser`, `getUser2`, …).
- **Tool description** — `HTTP <METHOD> <path>`, plus the operation `summary` and `description`.
- **Input schema** — one property per path/query/header/cookie parameter (required ones listed under `required`), and a single `body` property for operations with a request body (required when the spec marks it so). `additionalProperties` is disabled.
- **Built-in tools** — a `health` tool with an optional `echo` string argument lets clients probe connectivity.

Example effect for a hypothetical `GET /pets/{petId}` with an `order` query param:

```
MCP tool: getPetById
Input:    { petId: string (required), order?: string }
```

## Security & Limits

- Spec loading supports both local files and remote URLs; remote fetches honor `API_TIMEOUT_MS`, and `http://` sources are refused unless `ALLOW_INSECURE_HTTP=true`.
- Requests to the target API are made with the built-in `fetch` and a timeout; slow or failing upstreams surface as structured tool errors. Plain `http://` targets are refused unless `ALLOW_INSECURE_HTTP=true`.
- Configured credentials are injected server-side and are not added to tool schemas. Logs omit request headers, but upstream responses may echo secrets; configure and trust your upstream accordingly.
- Response limits are opt-in. `API_MAX_RESPONSE_CHARS` bounds the serialized response body, including escaping and embedded markers; HTTP status lines and the separate `[response truncated]` notice are outside that budget. JSON stays valid when a value fits; otherwise the body is empty. Downloads are still buffered before sanitization.
- Argument validation happens before any external call, rejecting malformed input early.
- To talk to `http://` endpoints (e.g., local mocks), set `ALLOW_INSECURE_HTTP=true`.

## License

[MIT](LICENSE)
