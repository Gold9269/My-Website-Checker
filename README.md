# My Website Checker

**Decentralized Website Uptime & Health Monitoring**  
*Production-minded monitoring platform combining a MERN frontend/backend, a WebSocket Hub for realtime coordination, and integrated validator logic that performs health checks. Validators are fully integrated and manageable from the UI.

---

## Table of contents
1. [Project overview](#project-overview)  
2. [Core value proposition](#core-value-proposition)  
3. [High-level architecture](#high-level-architecture)  
4. [Key features](#key-features)  
5. [How it works (high level)](#how-it-works-high-level)  
6. [Who should use this](#who-should-use-this)  
7. [Operational considerations & scaling](#operational-considerations--scaling)  
8. [Security & privacy](#security--privacy)  
9. [Observability & alerting](#observability--alerting)  
10. [Roadmap (example priorities)](#roadmap-example-priorities)  
11. [Contributing](#contributing)  

---

## Project overview
**My Website Checker** delivers reliable, real-time website and API health monitoring by separating probe execution from presentation while keeping management simple and unified. Monitor definitions and history are persisted in the backend (MongoDB), realtime events flow through a WebSocket **Hub**, and validator logic that performs probes is integrated into the system and surfaced in the UI. The platform is built for resilience, extensibility, and operational practicality.

---

## Core value proposition
- **Decentralized validation with a unified UX** — Run validator logic across multiple environments (cloud, edge, on-prem) while managing and observing everything from a single interface.  
- **Realtime visibility** — Low-latency updates via the WebSocket Hub make incidents immediately visible to operators.  
- **Extensible probes** — Support for HTTP(S), TCP/ping, TLS, synthetic transactions and custom probe plugins.  
- **Audit-ready persistence** — All checks, events and administrative actions are stored for historical analysis and SLA computation.  
- **Operational simplicity** — Validators are integrated into the platform and surfaced in the UI — no separate worker orchestration required.

---

## High-level architecture
- **Frontend (MERN)** — React UI for creating and managing monitors, realtime dashboards, and historical inspection.  
- **Backend API (MERN)** — Node/Express + MongoDB for persistence, authentication, and API surface.  
- **Hub (WebSocket)** — Realtime broker that coordinates updates and propagates check results between backend and clients.  
- **Validators (integrated)** — Built-in validator modules execute probes on configured schedules, publish results, and surface status in the UI.

This separation enables independent scaling and fault isolation while keeping the operational model straightforward.

---

## Key features
- Create and configure monitors (URL/endpoint, cadence, timeouts, expected responses).  
- **Integrated validator execution** with in-UI visibility and management.  
- Realtime status streaming and notifications via the WebSocket Hub.  
- Persistent historical data (latency, response codes, error details).  
- Configurable thresholds, retry logic and maintenance windows.  
- Pluggable probe framework for adding custom checks.  
- Observability hooks for metrics and logs.

---

## How it works (high level)
1. An operator defines a monitor in the UI (endpoint, interval, thresholds).  
2. The backend stores the monitor and exposes it to the system.  
3. Integrated validator modules execute checks per schedule and report results.  
4. The Hub routes results to the backend and pushes realtime updates to connected clients.  
5. Results are persisted for analysis, SLA reporting and incident investigation.

---

## Who should use this
**My Website Checker** is intentionally flexible — validation can be performed by virtually anyone, which broadens coverage and increases resilience.

**Ideal users**
- **DevOps & SRE teams** — multi-region self-hosted monitoring with full control and auditability.  
- **Small teams & solo developers** — low-cost, extensible monitoring without vendor lock-in.  
- **On-prem / internal IT** — run validators inside private networks to safely monitor internal services.  
- **Third-party contributors & partners** — contractors or community members can run validators to extend coverage.  
- **Auditors & compliance teams** — use auditable histories and multi-source validation for SLA verification.  
- **Hobbyists & students** — learn monitoring architectures by deploying validators locally.

**Why “anyone can validate” matters**
- **Broader geographic coverage** and fewer blind spots.  
- **Increased fault tolerance** through validator redundancy.  
- **Community-driven monitoring** where partners and users contribute probes.  
- **Flexible deployment** across inexpensive VMs, edge devices, or internal hosts.

**Trust & operational guidance**
- Use authentication and least-privilege tokens for validators.  
- Include provenance metadata (validator ID, region, timestamp) with each result.  
- Prefer consensus across multiple validators for high-confidence alerts.  
- Monitor validator health and reputation to detect noisy or misbehaving validators.  
- Run internal probes from within private networks to protect sensitive endpoints.

---

## Operational considerations & scaling
- **Scale storage and API independently** to support retention and analytics.  
- **Scale validator execution** by deploying additional instances or distributing them geographically.  
- **Hub redundancy:** consider clustering or load-balancing the Hub to avoid single points of failure.  
- **Observability:** export metrics (latency, error rates, validator health) and centralize logs for diagnostics.  
- **Deployment:** containerize components and use orchestration (Kubernetes, Docker Compose) for reproducible deployments.

---

## Security & privacy
- Enforce **TLS** for all transports (API and WebSocket).  
- Apply **least-privilege** for API and Hub credentials; avoid hardcoding secrets.  
- Use environment variables or a secrets manager for credentials.  
- Run private-network probes from inside the private network to avoid exposing internal endpoints.  
- Persist audit logs of administrative actions and critical events for incident response.

---

## Observability & alerting
- **Metrics:** collect and export validator and Hub metrics to Prometheus, DataDog, etc.  
- **Logs:** aggregate validator and Hub logs for quick root-cause analysis.  
- **Alerts:** integrate with email, Slack, PagerDuty, webhooks, or custom sinks.  
- **SLA reporting:** compute uptime and generate reports from persisted history for contractual use.

---

## Roadmap (example priorities)
- Advanced alerting & escalation channels (Slack, PagerDuty, webhooks).  
- SLA dashboards, exports and scheduled reports.  
- Multi-tenant support and role-based access control (RBAC).  
- Additional probe types (DNS checks, browser-based synthetic checks).  
- Validator reputation scoring and optional signed provenance for high-assurance environments.

---

## Contributing
Contributions are welcome. Suggested areas:
- New probe types or integrations.  
- Improvements to observability and metrics exports.  
- UI enhancements for validator fleet management and reporting.

Please provide contribution guidelines, tests, and an architectural overview to help onboard new contributors.



