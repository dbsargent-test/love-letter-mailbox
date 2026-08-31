# Security Policy

## Reporting a Vulnerability

If you discover a security issue, please **do not** open a public issue.

Instead, email the maintainer or use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability).

## Scope

- **Web app** (Azure Static Web Apps, Azure Functions backend)
- **Authentication** (JWT tokens, password hashing)
- **Content moderation** (Azure AI Content Safety)
- **ESP32 firmware** (WiFi credentials, API endpoints)

Device firmware handles WiFi credentials locally — never transmit or log them.
