# Security policy

## Supported version

Security fixes target the latest MathKhata release. Public binaries should always be built from a reviewed release commit and signed by the publisher.

## Reporting a vulnerability

Do not include notebook content, model prompts, credentials, signing secrets, or other personal data in a public report. The publisher must add a monitored private security-reporting address before publishing the app.

## Technical boundary

MathKhata treats imported notebooks, spoken transcripts, mathematical expressions, and AION output as untrusted data. Notebook imports are schema-validated before persistence. The desktop renderer is sandboxed, has no Node integration, cannot navigate to arbitrary content, and receives only a narrow, validated IPC surface. AION is optional and is never used as document storage or as an unquestioned mathematical authority.

Run `npm audit --omit=dev`, the complete automated test suite, native package inspection, and clean-machine installation tests for every public release. See [docs/DESKTOP_RELEASE.md](docs/DESKTOP_RELEASE.md).
