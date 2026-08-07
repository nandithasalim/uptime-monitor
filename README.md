# Uptime Monitor

A lightweight full-stack uptime monitor. Register URLs, get pinged every ~60 seconds in the
background, and see live up/down status, HTTP status code, response time, and a rolling response
time chart per URL.

Built for MVP scale: a few dozen URLs, checked roughly once a minute. No queues, no
microservices, no auth — just a small FastAPI service, a Postgres table, and a React dashboard.

## Stack

- **Backend:** FastAPI (async), SQLAlchemy (async), APScheduler for the background ping job, httpx
  for the actual HTTP checks.
- **Frontend:** React (Vite) + Tailwind + Recharts, polling the API every 5s.
- **Database:** Postgres.
- **Orchestration:** Docker Compose (backend, frontend, Postgres, and Adminer for optional DB
  inspection).

## 1-line setup

```bash
docker compose up --build
```

Then open:
- Frontend dashboard: **http://localhost:5173**
- Backend API docs (Swagger): **http://localhost:8000/docs**
- Adminer (optional DB browser, server=`db`, user=`uptime`, password=`uptime`, db=`uptime`): **http://localhost:8080**

First boot takes ~30-60s while Postgres initializes and images build. The backend waits for
Postgres to report healthy before starting.

## Testing up/down detection

This is the fastest way to confirm the core logic works end to end.

1. Run `docker compose up --build` and open http://localhost:5173.
2. In the "Add URL" form, add a **known-good URL**:
   - Name: `Example`
   - URL: `https://example.com`
   - Click **Add URL**. Within a few seconds it should show a green **Up** pill, an HTTP 200,
     and a response time in ms.
3. Add a **known-bad URL** to confirm down detection:
   - Name: `Broken`
   - URL: `https://this-domain-does-not-exist-abc123xyz.invalid` (or any URL you know will
     fail/timeout, e.g. `http://localhost:9999`)
   - Click **Add URL**. It should show a red **Down** pill with no status code.
4. Leave both running for a minute or two — a new check is run every ~60s (plus an immediate
   check the moment a URL is added), and the sparkline chart on each card will start filling in
   with response-time history. The "uptime % (last 24h)" figure on each card also updates as more
   checks accumulate.
5. To verify the raw check history for a URL, hit the API directly:
   ```bash
   curl http://localhost:8000/urls
   curl http://localhost:8000/urls/1/checks
   ```

A check counts as **up** when the response status is 2xx or 3xx. Anything else — a 4xx/5xx
status, a connection error, or a request that doesn't complete within 5 seconds — counts as
**down**, and the specific error (e.g. "Timed out after 5.0s", DNS failure, connection refused)
is stored alongside the check.

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

- **Polling over WebSockets:** the frontend polls every 5s instead of using a WebSocket/SSE
  push channel. At "a few dozen URLs checked once a minute" scale, a push channel adds real
  complexity (connection management, reconnect logic, another moving part in Compose) for very
  little user-visible benefit — 5s polling already feels close to real-time. This was a deliberate
  choice to keep the architecture boring and easy to reason about, in line with the brief's
  emphasis on execution velocity over engineering for scale we don't have.
- **In-process scheduler over a separate worker:** APScheduler runs inside the FastAPI process
  rather than as a separate worker container. At dozens of URLs / 60s cadence this is well within
  what a single process handles comfortably, and it avoids a second container, a job queue, and
  the coordination that comes with them. This is the first thing I'd split out if URL count or
  check frequency grew by an order of magnitude.
- **Down detection is deliberately generous:** DNS failures, connection refused, timeouts, and
  non-2xx/3xx status codes are all treated as "down" and the specific reason is stored per-check
  (visible via `/urls/{id}/checks`), so a "down" status is always explainable.

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
