# Security Policy

## Supported versions

During the `0.x` line, only the latest minor version receives security fixes.

| Version | Supported |
| ------- | --------- |
| 0.x     | ✅ (latest minor only) |

Once a 1.0 is released, this policy will be updated to cover LTS minors.

## Reporting a vulnerability

**Please do not open public GitHub issues for security vulnerabilities.**

Use one of the following channels:

1. **Preferred:** [GitHub Private Vulnerability Reporting](https://github.com/innovartx/nestjs-chat/security/advisories/new)
2. **Email:** webmaster.roomee@gmail.com

Include:

- A description of the vulnerability and the affected component
- Steps to reproduce, ideally with a minimal proof-of-concept
- The version of `nestjs-chat` and Node.js you tested against
- Any suggested remediation, if you have one

## What to expect

- **Acknowledgement** within 72 hours.
- **Initial assessment** within 7 days.
- A fix, workaround, or explanation of why the report does not qualify as a vulnerability within 30 days for high-severity issues.
- A CVE will be requested for confirmed vulnerabilities with a clear impact.
- Credit for the report in the published advisory, unless you prefer to remain anonymous.

## Scope

In scope:

- Code under `packages/sdk/` (the published `nestjs-chat` package)
- The Prisma schema and migrations shipped with the package
- Documented public APIs

Out of scope:

- The example app (`apps/example/`) — it is a reference, not a supported product
- Issues that require physical access, privileged local access, or misconfiguration of the host app
- Denial-of-service that requires abnormal traffic volumes against a specific deployment
