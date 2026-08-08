# Uptime Monitor

A lightweight full-stack uptime monitor. Register URLs, get pinged on a per-URL schedule in the
background, and see live up/down status, HTTP status code, response time, a rolling response
time chart, and the most recent up/down transition ("incident") per URL.

Built for MVP scale: a few dozen URLs, checked roughly once a minute. No queues, no
microservices, no auth — just a small FastAPI service, a Postgres table, and a React dashboard.

**Beyond the base requirements, this also includes:**
- A **per-URL check interval** (30s / 1min / 5min) instead of one global interval for every URL.
- A **manual "Check now"** button per URL, for forcing an immediate check outside the schedule.
- **Concurrent pinging** — when multiple URLs are due at once, they're checked in parallel
  (`asyncio.gather`) rather than one at a time, so a round of checks doesn't take longer than the
  interval it's supposed to run on.
- A lightweight **incident indicator** — "Down since HH:MM" or "Recovered at HH:MM" — computed
  from the check history rather than a separate table that has to be kept in sync.
- **SSL certificate expiry monitoring** — for `https://` URLs, every check also reports how many
  days remain on the TLS certificate, flagged in the UI once it's within 14 days of expiring.
- **Down-alert webhooks** — optionally attach a webhook URL to a monitored URL; it gets a JSON
  POST the moment that URL flips from up→down (and again on recovery). Webhook delivery is
  best-effort and never blocks or fails a check.
- A **table view** alongside the card view, for scanning many URLs' status/code/response
  time/SSL/last error at once instead of one card at a time.
- **Input validation** — `POST /urls` rejects malformed URLs (missing scheme, no host, empty
  string) and empty names with a clear 422 error instead of silently saving and pinging garbage
  forever. The frontend surfaces the real validation message rather than a generic failure.
- **Backend tests** (`backend/tests/`) covering the up/down classification logic (2xx/3xx up,
  4xx/5xx down, timeout, connection error) and the URL/webhook validation, run against mocked
  HTTP responses — fast, deterministic, no network dependency.

## Stack

- **Backend:** FastAPI (async), SQLAlchemy (async), APScheduler for the background ping job, httpx
  for the actual HTTP checks.
- **Frontend:** React (Vite) + Tailwind + Recharts, polling the API every 2s for a near-real-time
  feel without needing WebSockets.
- **Database:** Postgres.
- **Orchestration:** Docker Compose (backend, frontend, Postgres, and Adminer for optional DB
  inspection).

## 1-line setup

```bash
docker compose up --build
```

That's the whole thing — Postgres, backend, frontend, and Adminer. Then open:

- Frontend dashboard: **http://localhost:5173**
- Backend API docs (Swagger): **http://localhost:8000/docs**
- Adminer (optional DB browser, server=`db`, user=`uptime`, password=`uptime`, db=`uptime`): **http://localhost:8080**

First boot takes ~30-60s while Postgres initializes and images build. The backend waits for
Postgres to report healthy before starting, so no manual ordering or retry is needed.

> **Port note:** Postgres is published on host port **5433** (not 5432) to avoid colliding with a
> local Postgres install. Inside the Compose network the backend still connects on 5432.

## Testing steps: verifying up/down state tracking

This is the fastest path to confirming the core logic behaves correctly. Takes about two minutes.

**1. Start it and open the dashboard**

```bash
docker compose up --build
```
Open http://localhost:5173. The form at the top has three fields: **Name**, **URL**, and
**Interval**.

**2. Add a working URL**

- Name: `Example`
- URL: `https://example.com`
- Interval: `Every 30s`
- Click **Add monitor**.

A check runs immediately on creation, so within a second or two the card should show a green
**Up** badge, status `200`, and a response time in ms. For an `https://` URL the **SSL** stat also
populates with days remaining on the certificate.

**3. Add an intentionally broken URL**

- Name: `Broken`
- URL: `https://this-domain-does-not-exist-abc123xyz.invalid`
- Interval: `Every 30s`
- Click **Add monitor**.

This should show a red **Down** badge, no status code, and the actual failure reason printed on the
card (a DNS resolution error). Down monitors sort to the top of the list automatically.

Two other broken cases worth trying, since they exercise different code paths:

| URL | Expected result |
|---|---|
| `https://this-domain-does-not-exist-abc123xyz.invalid` | Down — DNS failure |
| `http://localhost:9999` | Down — connection refused |
| `https://httpbin.org/status/500` | Down — HTTP 500 (server reachable, bad status) |

**4. Watch it track state over time**

Leave both running for a minute. The scheduler ticks every 15s and checks each URL according to its
own configured interval, so the 30s monitors will accumulate readings. As they do:

- the sparkline on each card fills in with response-time history,
- **Uptime** (last 24h) updates per card,
- the header KPIs (Monitors / Operational / Down / Slowest) update,
- the banner flips between "All systems operational" and "N of M monitors down".

Click **Check now** on any card to force an immediate check outside the schedule.

**5. Verify an up → down → up transition**

To see incident tracking and webhooks fire against a server you control:

```bash
python3 -m http.server 9000
```
Add `http://host.docker.internal:9000` as a monitor (that hostname is how a container reaches your
host machine — `localhost` inside the backend container would refer to the container itself). It
shows **Up**. Stop the server with Ctrl+C → within its interval it flips to **Down** and shows
"Down since HH:MM". Start it again → back to **Up**, showing "Recovered at HH:MM".

**6. Verify against the API directly**

```bash
curl http://localhost:8000/urls           # all monitors + latest check + 24h uptime %
curl http://localhost:8000/urls/1/checks  # raw check history for monitor 1
```

**How up/down is classified:** a check counts as **up** when the response status is 2xx or 3xx.
Anything else counts as **down** — a 4xx/5xx status, DNS failure, connection refused, or a request
that doesn't complete within the 5-second timeout — and the specific reason is stored on the check
row and surfaced in the UI, so a "down" reading is always explainable rather than a bare red dot.

> One note from testing: `httpstat.us` is a popular test target but proved unreliable under load,
> intermittently dropping connections and producing legitimate-but-confusing "down" readings. The
> URLs above are more dependable for evaluation.

### Optional: verifying webhook alerts

To watch a down/recovery alert fire during the step 5 transition above, expand
**"+ Add alert webhook"** on the form and paste a [webhook.site](https://webhook.site) URL when
adding the monitor. Stopping the server delivers a POST with `{"event": "down", ...}`; restarting
it delivers `{"event": "recovered", ...}`.

Alerts fire only on a **state change**, not on every failed check — a URL that stays down for an
hour sends one alert, not 120.

### Optional: verifying SSL expiry monitoring

Any `https://` URL gets its certificate checked automatically. Switch to the **Table** view for the
SSL column, or read `ssl_days_remaining` from `curl http://localhost:8000/urls`.
`https://example.com` shows a healthy expiry months out; anything within 14 days is flagged amber
in the UI and promoted to a header KPI.

### Optional: verifying input validation

```bash
curl -X POST http://localhost:8000/urls -H 'Content-Type: application/json' \
  -d '{"name":"Bad","url":"not a url"}'
```
Returns `422` with a readable message rather than silently saving and pinging garbage forever. The
frontend surfaces that same message inline.

## Running the backend tests

The up/down classification logic (2xx/3xx up, 4xx/5xx down, timeout, connection error) and the
URL/webhook validation are covered by tests that mock HTTP responses — no network access or
running server required:

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest -v
```

18 tests, ~0.3s, fully offline.

## API overview

| Method | Path | Description |
|---|---|---|
| `POST` | `/urls` | Register a URL (`name`, `url`, optional `check_interval_seconds`) |
| `GET` | `/urls` | List all URLs with their latest check + 24h uptime % |
| `GET` | `/urls/{id}` | Get one URL with its latest check |
| `DELETE` | `/urls/{id}` | Remove a URL (cascades and deletes its check history) |
| `GET` | `/urls/{id}/checks?limit=50` | Chronological check history for charting |
| `POST` | `/urls/{id}/check-now` | Force an immediate check outside the schedule |

Full interactive docs at `/docs` once the backend is running.

## Repository structure

```
/backend         FastAPI app: models, scheduler, ping logic, REST API
/frontend        React (Vite) dashboard
docker-compose.yml
AI_LOG.md        AI collaboration log (tools, prompts, course corrections)
```

## Design notes

- **Polling over WebSockets:** the frontend polls every 2s instead of using a WebSocket/SSE
  push channel. At "a few dozen URLs checked once a minute" scale, a push channel adds real
  complexity (connection management, reconnect logic, another moving part in Compose) for very
  little user-visible benefit — 2s polling already feels close to real-time. This was a deliberate
  choice to keep the architecture boring and easy to reason about, in line with the brief's
  emphasis on execution velocity over engineering for scale we don't have.
- **In-process scheduler over a separate worker:** APScheduler runs inside the FastAPI process
  rather than as a separate worker container. At dozens of URLs / ~1min cadence this is well
  within what a single process handles comfortably, and it avoids a second container, a job
  queue, and the coordination that comes with them. This is the first thing I'd split out if URL
  count or check frequency grew by an order of magnitude.
- **Per-URL intervals on a shared 15s tick:** the scheduler wakes up every 15 seconds and, on each
  tick, checks which URLs are actually "due" based on their own `check_interval_seconds` and when
  they were last checked — rather than either (a) one global interval for every URL regardless of
  what's configured, or (b) a separate scheduled job per URL, which doesn't scale cleanly. A 15s
  tick is fine-grained enough to honor a 30s interval reasonably closely without spinning up a
  timer per URL.
- **Concurrent, not sequential, pinging:** URLs due on the same tick are pinged in parallel via
  `asyncio.gather` rather than one at a time in a loop. Sequential pinging means total time scales
  with the number of URLs (and how slow each one is, up to the 5s timeout) — with enough URLs, one
  round of checks could take longer than the interval it's supposed to run on. Concurrent pinging
  means a round takes roughly as long as the single slowest check, not the sum of all of them.
- **Down detection is deliberately generous:** DNS failures, connection refused, timeouts, and
  non-2xx/3xx status codes are all treated as "down" and the specific reason is stored per-check
  (visible via `/urls/{id}/checks`), so a "down" status is always explainable.
- **Incidents computed on the fly, not stored:** "last incident" (the most recent up↔down flip) is
  derived by scanning recent `checks` rows for the URL rather than maintained in a separate
  incidents table. At MVP scale this is cheap and avoids a second table that has to be kept
  perfectly in sync with `checks` on every write.
- **Webhook alerts fire on transition, not on every down check:** an alert is only sent the moment
  a URL's status actually *changes* (up→down or down→up), by comparing each new check against the
  previous one — not on every single down check, which would mean a webhook firing every 30s for
  the entire time a site is down. Delivery is fire-and-forget with a short timeout and errors are
  swallowed on purpose: a broken/unreachable webhook endpoint should never cause the check itself
  to fail or roll back. Alerting is a side effect of monitoring, not the core responsibility.
- **SSL checks run off the event loop:** Python's `ssl`/`socket` modules are synchronous — there's
  no async equivalent for reading a TLS certificate. Rather than blocking the whole event loop
  (and every other in-flight check) while reading a cert, the SSL check runs via
  `asyncio.to_thread`, keeping it concurrent with everything else on that tick.

## Deployment sketch (AWS)

This is intentionally a sketch, not production IaC — no autoscaling policies, WAF, or hardened
network ACLs. The goal is to show the shape of how this MVP would move to the cloud.

**Topology:**
- **Frontend:** static Vite build served from **S3 + CloudFront** (no need to run a Node server
  in production — `npm run build` produces static assets).
- **Backend:** containerized FastAPI app on **ECS Fargate**, behind an **Application Load
  Balancer**. Fargate is a good fit here because the workload is small, bursty-light, and we don't
  want to manage EC2 instances for a service checking a few dozen URLs a minute.
- **Database:** **RDS for Postgres** (single small instance, e.g. `db.t4g.micro`), in the same VPC
  as the ECS service, not publicly accessible.
- **Scheduler:** stays in-process on the Fargate task for MVP scale. If this needed to scale out
  to many workers, the natural next step is moving the ping job to **EventBridge Scheduler +
  SQS + a separate Fargate worker service**, decoupling "who owns the schedule" from "who does the
  pinging" — but that's explicitly out of scope for an MVP at this size.
- **Secrets:** DB credentials in **AWS Secrets Manager**, injected into the ECS task definition.

Minimal Terraform sketch (illustrative, not complete):

```hcl
resource "aws_ecs_cluster" "uptime_monitor" {
  name = "uptime-monitor"
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "uptime-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  container_definitions = jsonencode([{
    name  = "backend"
    image = "<ecr-repo-url>/uptime-backend:latest"
    portMappings = [{ containerPort = 8000 }]
    secrets = [{
      name      = "DATABASE_URL"
      valueFrom = aws_secretsmanager_secret.db_url.arn
    }]
  }])
}

resource "aws_ecs_service" "backend" {
  name            = "uptime-backend"
  cluster         = aws_ecs_cluster.uptime_monitor.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = var.private_subnet_ids
    security_groups = [aws_security_group.backend.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name    = "backend"
    container_port    = 8000
  }
}

resource "aws_db_instance" "postgres" {
  identifier             = "uptime-monitor-db"
  engine                 = "postgres"
  instance_class         = "db.t4g.micro"
  allocated_storage      = 20
  db_name                = "uptime"
  username               = "uptime"
  manage_master_user_password = true
  publicly_accessible    = false
  vpc_security_group_ids = [aws_security_group.db.id]
}
```

Frontend would deploy separately via `aws s3 sync ./frontend/dist s3://<bucket>` behind a
CloudFront distribution pointed at the ALB for `/api/*` (or the frontend just calls the ALB's
DNS/API Gateway endpoint directly via `VITE_API_URL`).

See [AI_LOG.md](./AI_LOG.md) for how this repo was built with AI assistance, including the raw
prompts used and a real bug the AI-generated code hit during local testing.