# Changelog

## 1.2.0 — Openwire

### Migration

- Rename the npm package, primary CLI, default MCP identity, and repository to `openwire`.
- Keep the `api-mcp-bridge` command as an alias and retain existing environment variables and CLI arguments.
- Derive the reported MCP version from package metadata.

### Fixes

- Forward configured headers when downloading protected specifications.
- Return MCP tool errors for upstream HTTP 4xx/5xx responses.
- Enforce serialized response character budgets, including JSON punctuation and escaping.
- Preserve nullable object schemas and avoid mutating input schemas during normalization.
- Reserve the built-in `health` name when generating operation tools.
- Resolve local request-body references and select operation/path server overrides.
- Prefer JSON request media types; reject unsupported encodings when a body is supplied.
- Refresh affected dependencies within existing major versions to resolve reported advisories.

### Maintenance

- Remove the empty npm ignore file and duplicate CLI header configuration handling.
- Add MCP integration tests and installed-package verification to CI.
- Document actual authentication, response-limit, and OpenAPI compatibility boundaries.

## 1.1.0

- Resolve CLI entry paths through npm binary symlinks.
