# Openwire optimization roadmap

Priorities follow the current implementation review. These features are deferred beyond 1.2.0.

| Priority | Improvement                                                                                                    | Benefit                                                                                  | Acceptance evidence                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1        | Filter operations by tag, path, method, or operation ID before applying the tool limit                         | Let large APIs expose a useful subset without overwhelming client context                | Deterministic filtered tool lists; excluded operations never register; measure tool-schema size reduction |
| 2        | Stream and cap spec downloads and API responses before buffering                                               | Bound memory use even when upstream payloads are huge                                    | Byte-accurate limits for UTF-8, streamed responses, and missing Content-Length; benchmark peak memory     |
| 3        | Support parameter style/explode, server variables, recursive schemas, and dialect-aware OpenAPI 3.1 validation | Increase compatibility with real API specifications                                      | Conformance fixtures for each supported feature and explicit errors for unsupported constructs            |
| 4        | Separate spec and API credentials; support explicit query/cookie API-key injection                             | Avoid sharing credentials between services and support additional authentication layouts | Credential isolation across hosts, redirect tests, and no secret tool-schema exposure                     |
| 5        | Benchmark startup and optimize repeated reference resolution/schema compilation                                | Reduce startup time for larger specifications                                            | Compare cold/warm startup, compile counts, memory, and identical generated schemas before adding caches   |

Additional correctness work: avoid argument-name collisions between parameter locations and request bodies; validate configuration numbers strictly; expand redirect policy checks and sensitive-URL redaction. Do not add automatic retries for mutating API requests without an explicit idempotency policy.

Keep stdio as the default transport. Consider new transports or OAuth token acquisition as separate features with their own compatibility and lifecycle designs.
