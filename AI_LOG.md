## AI Collaboration Log

## The AI tech stack

1) Primary tool: Anthropic's Cowork mode — a Claude Code-based agent with direct file and shell access, so it can write files, run the code, and read back real errors rather than only emitting text. Same category of tool as Cursor's agent mode or GitHub Copilot Workspace.
2) Underlying LLM: Claude Sonnet 5 for the initial build, Claude Opus 5 for the later debugging and UI rounds.
3) Also tried: Lovable (AI app builder) for a frontend redesign — rejected, for reasons detailed under "Frontend UI layer" below. Worth including here because knowing when to throw away AI output is part of using it well.

## The prompts that shipped it

These are the prompts that drove the build, in the order I sent them.

# Backend layer
1. Scoping the brief
"Break down this brief before we start. Flag what most submissions under-deliver on so I can consider around it."

2. My system design
"This is the design I'm going with: FastAPI + React + Postgres. Standout feature - a per-URL response-time chart. Deployment  on AWS ECS Fargate + RDS. Build it exactly like that — I'll tell you if you need to deviate."

3.Scheduler architecture
"Scheduler setup: AsyncIOScheduler() in lifespan, but it's running everything on one fixed 60s tick. That's wrong. I want a 15s tick with per-URL logic . And it's APScheduler, not a message queue — that's the right call at this scale, keep it."

4. Endpoint design
"GET /urls/{id} and GET /urls/{id}/checks look redundant to me. Justify keeping both or collapse them — every endpoint should have exactly one responsibility."

5. Per-URL intervals actually working
" Fix the scheduling model so each URL respects its own interval, then verify it."

6. Feature gap analysis
"Brief says 'dozens of URLs' but I'm not doing pagination at that scale — it solves a problem we don't have."

7. Build decision
"Build all three: the table/list view, SSL expiry monitoring, and the down-alert webhook."

# Frontend UI layer

8. Polling
"Drop dashboard polling to 2s. Status changes should feel near-real-time ."

9. Rejecting the redesign
"Revert this. The 'sample data' fallback giving fake numbers when the backend is down —inventing green marks is worse than one that shows nothing."

10. Layout grounded in real data
"'Avg uptime' maps to nothing in our API, SSL data is buried at the bottom. Rebuild it — every metric backed by data the API actually returns, and the add-URL input goes at the top."

11. Scannability at 15 URLs
"Design for 15 URLs, not 5. Sort monitors down , failing endpoint is always at the top, and preserve creation order within each group so healthy cards don't reshuffle on every poll."

12. Readability pass
"Remove the manual refresh button — we already poll every 2s.  Raise border/background contrast on cards and the table. Replace 'Avg response' with 'Slowest monitor' — that names the actual problem. 'Check now' becomes a real bordered button. Make everything scannable."


## Course Corrections

### 1. Scheduler looked correct but wasn't

The first implementation had a per-URL `check_interval_seconds` field, but the scheduler actually ran every URL on a fixed 60-second cycle. Checks were also sequential, so ~15 slow URLs could make the monitoring cycle fall behind.

**Fix:** changed the scheduler to a 15-second shared tick with per-URL `_is_due()` checks, and ran due URL checks concurrently with `asyncio.gather`.

---

### 2. HTTP client depended on the host environment

Local testing caused every `POST /urls` request to return 500 because `httpx.AsyncClient` picked up a `socks5h` proxy from the host environment.

I prompted Claude to trace the failure instead of patching the endpoint:

> Trace this from the endpoint into the HTTP client. Check whether it's inheriting proxy configuration from the environment and fix the root cause.

**Fix:** added `trust_env=False`, making direct HTTP behavior explicit.

---

### 3. A valid site was reported as DOWN

`https://httpstat.us/200` was reported as DOWN even though the endpoint should return 200. I asked Claude to inspect the stored error before changing the status logic:

> Don't change the UP/DOWN logic yet. Pull the actual error and find out why the request is failing.

The server was rejecting the request because it had no `User-Agent`. The checker was correctly reporting the connection failure, but was too fragile against real-world servers.

**Fix:** added a default `User-Agent` to outgoing checks.

---

### 4. Dependency worked in the sandbox but failed locally

Running the tests on Python 3.13 caused `asyncpg==0.29.0` to fail compilation. This then produced misleading `pytest`/`respx` errors because the rest of the dependencies were never installed.

I prompted:

> Don't treat the missing test modules as the root cause. Find the first dependency that failed and check its compatibility with my Python version.

**Fix:** upgraded `asyncpg` to `0.30.0`, reinstalled cleanly, and verified all **18 tests passed**.

---

### 5. AI-generated frontend was rejected entirely

A Lovable redesign looked better visually but introduced:

> `API unreachable — showing sample data`

It displayed fabricated uptime, response-time and status information when the backend was unavailable. For a monitoring product, that creates false confidence.

I rejected the approach:

> Let's undo this. A monitoring dashboard should never show fabricated status data when the backend is unavailable.

**Fix:** reverted the redesign and made the frontend fail explicitly with an error state and no placeholder monitoring data.

---

## Deliberate Engineering Decisions

A few decisions were intentionally challenged rather than accepted from AI:

* **Polling instead of WebSockets:** 2-second polling was sufficient for this scale and avoided unnecessary connection/state-management complexity.
* **No pagination:** the requirement was dozens of URLs, not thousands; sorting DOWN → pending → UP solved the real usability problem without adding unnecessary API complexity.
* **Transition-based webhooks:** alerts fire only on UP↔DOWN changes, preventing repeated alerts during a prolonged outage.
* **SSL checks off the event loop:** synchronous certificate operations run through `asyncio.to_thread` so they don't block concurrent URL checks.
* **Input validation + automated tests:** malformed URLs/webhooks are rejected at the API boundary, and the monitoring paths are covered by deterministic mocked tests.
* **Fail loud, never fabricate:** for a monitoring system, showing no data is safer than showing plausible but unverified health data.

The main lesson from these iterations was that AI-generated code can be **syntactically correct and still architecturally wrong**. I therefore treated every generated change as something to review, run, and verify rather than something to automatically accept.
