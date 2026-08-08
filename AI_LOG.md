## AI Collaboration Log

## The AI tech stack

1) Primary tool: Anthropic's Cowork mode — a Claude Code-based agent with direct file and shell access, so it can write files, run the code, and read back real errors rather than only emitting text. Same category of tool as Cursor's agent mode or GitHub Copilot Workspace.
2) Underlying LLM: Claude Sonnet 5 for the initial build, Claude Opus 5 for the later debugging and UI rounds.
3) Also tried: Lovable (AI app builder) for a frontend redesign — rejected, for reasons detailed under "Frontend UI layer" below. Worth including here because knowing when to throw away AI output is part of using it well.

## The prompts that shipped it

These are my raw prompts, verbatim — typos, shorthand and all — in the order I sent them.

# Backend layer
1. Scoping the brief
"Break down this brief before we start. Flag what most submissions under-deliver on so I can consider around it."

2. My system design
"This is the design I'm going with: FastAPI + React + Postgres. Standout feature - a per-URL response-time chart. Deployment  on AWS ECS Fargate + RDS. Build it exactly like that — I'll tell you if you need to deviate."

3.Scheduler architecture
"Scheduler setup: AsyncIOScheduler() in lifespan, but it's running everything on one fixed 60s tick. That's wrong. I want a 15s tick with per-URL logic . And it's APScheduler, not a message queue — that's the right call at this scale, keep it."

4. Endpoint design
"main.py has too many handlers and GET /urls/{id}/checks + GET /urls/{id} are redundant — collapse them into one. Each endpoint should have exactly one responsibility."

5. Per-URL intervals actually working
" Fix the scheduling model so each URL respects its own interval, then verify it."

6. Feature gap analysis
"Brief says 'dozens of URLs' but I'm not doing pagination at that scale — it solves a problem we don't have."

7. Build decision
"Build all three: the table/list view, SSL expiry monitoring, and the down-alert webhook."

# Frontend UI layer
8. Sparkline chart
"Sparkline chart on each card — data from the check history endpoint, drawn inline, no chart library that drags in dependencies we don't need. Implement it clean."

9. Polling
"Drop dashboard polling to 2s. Status changes should feel near-real-time ."

10. Rejecting the redesign
"Revert this. The 'sample data' fallback giving fake numbers when the backend is down —inventing green marks is worse than one that shows nothing."

11. Layout grounded in real data
"'Avg uptime' maps to nothing in our API, SSL data is buried at the bottom. Rebuild it — every metric backed by data the API actually returns, and the add-URL input goes at the top."

12. Scannability at 15 URLs
"Design for 15 URLs, not 5. Sort monitors down , failing endpoint is always at the top, and preserve creation order within each group so healthy cards don't reshuffle on every poll."

13. Readability pass
"Remove the manual refresh button — we already poll every 2s.  Raise border/background contrast on cards and the table. Replace 'Avg response' with 'Slowest monitor' — that names the actual problem. 'Check now' becomes a real bordered button. Make everything scannable."




## The course corrections

1. A broken architecture that looked like a working feature

During the file-by-file walkthrough I asked what turned out to be the highest-value question of the project:

## "wat is the use in check intervan dropdown , second pinging everything same time , wat if there are many ?"

Two separate architectural problems fell out of that one prompt:

1. The per-URL interval was decorative. The generated design exposed a check_interval_seconds field per URL and a dropdown to set it — but the scheduler ran a single global job on a fixed 60s tick that checked every URL regardless of its configured interval. A URL set to "every 30s" was silently checked every 60s. Nothing errored. The API returned the value you'd set, the UI displayed it, and the behavior quietly ignored it — the worst class of bug, because everything looks correct.

All URLs were pinged sequentially. check_all_urls() looped over URLs and awaited each ping one at a time. With a 5s timeout per check, ~15 slow URLs means a single round takes longer than the interval it's supposed to run on — the monitor falls behind and the schedule silently degrades under exactly the load the brief describes ("dozens of URLs").

# Fix — this required changing the scheduling model, not patching the form:

The scheduler now ticks every 15s and check_all_urls() decides per URL whether that URL's own interval has actually elapsed (_is_due() in backend/app/checker.py), comparing against its last check timestamp. A short shared tick honors a 30s interval closely without spawning a timer per URL — which is the alternative that doesn't scale.
Pings for URLs due on the same tick now run concurrently via asyncio.gather, so a round takes as long as the slowest check rather than the sum of all of them.

The lesson I'd point to here: the AI didn't produce broken syntax, it produced a coherent-looking design whose parts didn't actually connect. That's only catchable by reading the code and asking what each piece is really doing — which is why I refused to extend the repo before the walkthrough.

2. Generated code that depended on ambient environment state

While testing the backend locally (registering https://example.com and a deliberately broken domain), every POST /urls call returned 500 Internal Server Error. The traceback pointed to httpx.AsyncClient.__init__:

ValueError: Unknown scheme for proxy URL URL('socks5h://localhost:1080')

Claude's first-pass code created the httpx.AsyncClient with default settings, which meant it picked up ambient proxy environment variables (ALL_PROXY/HTTP_PROXY) from the host environment. In the sandbox used for testing, that env var pointed at a SOCKS proxy scheme httpx couldn't parse, and the client crashed on construction — before it ever got a chance to make the request, let alone classify it as up or down.

This wasn't a hallucinated library or a fundamentally broken architecture, but it was a real, reproducible bug: the checker was silently depending on whatever proxy configuration happened to be present in the process environment, which is exactly the kind of thing that works on one machine and breaks on another (or, ironically, breaks in the more locked-down sandbox but might have looked fine in a normal dev environment without a proxy set).

# Fix: added trust_env=False to the httpx.AsyncClient constructor in backend/app/checker.py, so each check explicitly ignores host proxy env vars and always makes a direct request. After the fix, POST /urls returned 201 Created and check results (including the correctly-classified is_up: false / DNS-failure error for the broken domain) came back as expected.

This is also why the README calls out that up/down detection was verified against the down path in this environment (the sandbox itself has no outbound DNS resolution), while the up path relies on the same 200 <= status_code < 400 branch and is expected — and should be explicitly re-verified by whoever runs docker compose up with real internet access, per the testing steps in the README.

3. Code that was correct but fragile against the real world

After the initial build, I ran docker compose up myself and tested it by hand — registering https://example.com (correctly showed Up) and https://httpstat.us/200 (which, despite the /200 in the URL, showed Down). I brought this back to Claude:

"https://httpstat.us/200 shown as down"

Rather than guessing at a fix, Claude asked me to pull the stored error field first via curl http://localhost:8000/urls, which showed: "error": "Server disconnected without sending a response." — that turned out to be httpstat.us itself rejecting the request because it had no User-Agent header (a common anti-bot heuristic on real-world sites, not unique to httpstat.us). The down-detection logic wasn't actually wrong here — it correctly caught the connection failure and reported an explainable reason — but the checker was more fragile against real sites than it needed to be.

Fix: added a User-Agent header (DEFAULT_HEADERS in backend/app/checker.py) to every outgoing check request, so the monitor doesn't get misclassified as "down" against sites that reject headerless/bot-looking traffic.

## Features added after the initial build
Two already-built-but-unused pieces (a check_interval_seconds field with no UI, and a check-now endpoint with no button) and one real correctness issue (sequential, not concurrent, pinging).


I picked  the check-interval dropdown, the manual check-now button, the concurrency fix, and a lightweight incident indicator (last up↔down transition per URL). Notably, making the interval dropdown meaningful (not just cosmetic) required a bigger change than the dropdown itself: the scheduler previously ran everything on one fixed 60s tick regardless of what was configured, so it had to move to a shorter 15s tick with per-URL "is this one actually due yet" logic — a case of a small feature request revealing that the underlying scheduling model needed to change, not just the form.



## Two implementation decisions worth calling out as deliberate, not just generated:

1) Webhook alerts fire only on state transitions, not on every down check. The first version I'd have gotten from a naive prompt might have fired a webhook on every single down reading — which, for a URL checked every 30s, means one alert every 30 seconds for the entire outage. Instead, save_check_and_maybe_alert() in backend/app/checker.py compares each new check against the URL's previous check and only fires when is_up actually flips. I verified this directly with a small standalone script (not just by reading the code) that called the function four times in a row — up, up, down, up — and confirmed a webhook call was only attempted on the two transitions (checks 3 and 4), not on the repeated "up" or "down" reads.
2) SSL certificate reads run via asyncio.to_thread. Python's ssl/socket modules have no async API, so reading a certificate is a blocking call. Calling it directly inside an async def would stall the entire event loop — meaning every other URL's check on that same tick would wait behind it — defeating the earlier concurrency fix. Running it through asyncio.to_thread keeps it off the event loop so all checks on a tick genuinely run in parallel.

 ## Tests and input validation, closing the loop

After the feature additions, I asked for two things I'd flagged myself as genuine gaps rather than nice-to-haves: real tests around the up/down classification logic, and rejecting malformed URLs instead of silently saving and pinging garbage forever.

1) Tests: backend/tests/test_checker.py and test_schemas.py, using respx to mock httpx responses rather than hitting real sites — so they're deterministic, offline, and fast (18 tests, 0.34s). They cover the same paths verified manually earlier in this project (2xx/3xx up, 4xx/5xx down, timeout, connection error) plus the new URL/webhook/name validation, but now as something that runs in CI or before every future change, not something that has to be re-verified by hand each time. I ran the full suite (pytest -v) and confirmed all 18 pass before considering this done — writing tests that were never actually executed would have been worse than not writing them at all.

2) Validation: added Pydantic field validators (backend/app/schemas.py) rejecting POST /urls with a 422 if the URL doesn't have an http(s) scheme and a host, or if the name/webhook URL is empty/malformed. This is deliberately "basic sanity check," not full RFC validation — it won't catch a URL with a typo'd-but-syntactically-valid domain (the check itself discovers that), it just stops obviously-garbage input like "not a url" from being saved and retried forever. I also updated the frontend's error handling (api.js, App.jsx) to surface FastAPI's actual validation message instead of a generic "failed to add URL" string, and verified all four cases by hand against a running server: valid URL succeeds, garbage URL/empty name/malformed webhook URL all return a 422 with a specific, readable message.

# Course correction #4: a dependency pin that worked in the sandbox but not on my machine

Running pip install -r requirements-dev.txt locally (macOS, Python 3.13) to try the new tests failed with a wall of C compiler errors trying to build asyncpg from source:

error: call to undeclared function '_PyInterpreterState_GetConfig'; ...
error: too few arguments to function call, expected 6, have 5
error: command '/usr/bin/clang' failed with exit code 1
Failed to build asyncpg

Because that install failed, nothing after it in the same command got installed either — pytest-asyncio and respx were silently missing too, which surfaced as an unrelated-looking ModuleNotFoundError: No module named 'respx' and Unknown config option: asyncio_mode when running pytest. The real cause was one dependency higher up in the chain, not the test tooling.

Root cause: asyncpg==0.29.0 (pinned in backend/requirements.txt) predates Python 3.13 and has no prebuilt wheel for it, so pip fell back to compiling its C/Cython source — which fails against Python 3.13's internal C API changes (_PyLong_AsByteArray's signature changed, among others). This had gone unnoticed until now because every test I'd run myself was inside a Linux sandbox on Python 3.10, and the Docker image (python:3.12-slim) also predates the incompatibility — so the pin looked fine everywhere I'd actually run it, and only broke on a newer local Python that I hadn't tested against.

Fix: bumped asyncpg to 0.30.0 (released Oct 2024, adds Python 3.13 support with prebuilt wheels) in backend/requirements.txt. Confirmed the fix by installing it fresh and re-running the full test suite (still 18/18 passing) rather than just assuming a version bump would work.

# Course correction #5: throwing away an AI-generated frontend entirely

Wanting a better-looking dashboard, I generated one with Lovable and brought the output back to integrate. It looked good. It also shipped this pattern:

⚠ Live API unreachable (Failed to fetch) — showing sample data

When the backend was unreachable, it rendered fabricated uptime data — green "operational" badges, invented response times, a populated chart — visually near-identical to real readings, with only a small banner distinguishing them.

For most apps that's a harmless placeholder. For a monitoring tool it inverts the product's entire purpose: the one moment the dashboard must be trustworthy is when infrastructure is failing, and this design shows a healthy-looking dashboard precisely when nothing can be verified. A user glancing at it during an outage would be actively misled.

I rejected the whole redesign rather than patching out the fallback:

"lets do undo then"

Refactor: reverted with git revert HEAD rather than git reset --hard — the bad commit was already pushed, so rewriting history would have been the wrong tool. The current App.jsx fails loud instead: on a fetch error it sets an error banner, renders no monitors, and never substitutes placeholder values. The comment explaining why is left in the source at the catch block, because it's the kind of decision a future maintainer would otherwise "helpfully" undo.

What I did not just accept as-is
Rejected sample-data fallbacks in the frontend (above) — for a monitoring tool, showing invented numbers is worse than showing nothing.
Pushed back on WebSockets for "real-time" updates. 2s polling is simpler, has one less moving part in Compose, and is more than sufficient at this scale. Documented as a deliberate trade-off in the README rather than silently decided.
Rejected pagination for the URL list after asking about it directly — it solves a scale problem this project doesn't have, and the brief explicitly warns against over-engineering.
Rejected copying a reference design literally — when a screenshot-matched layout introduced an "Avg uptime" metric with no real data behind it, I had it rebuilt around metrics the API actually returns.
Ran everything myself — every round was tested by hand on Docker, which is how the httpstat.us, asyncpg, and port-conflict issues surfaced at all.
Design rationale: the calls behind the code

A prompt log shows what was asked. This section is the part I'd actually want to be judged on — the reasoning behind each decision in the repo, including the ones where the obvious answer was wrong.

Stack: async FastAPI + React + Postgres. This workload is almost entirely I/O-bound — the app spends its time waiting on other people's servers, not computing. An async framework lets one process hold dozens of in-flight HTTP checks concurrently instead of one thread blocked per check. Postgres over SQLite because check history is append-heavy and concurrent (the scheduler writes while the dashboard reads every 2s), and because it's what this would actually run on in production — no migration surprise later.

Scheduler: APScheduler in-process, 15s tick, per-URL due checks. Three options were on the table and the distinction matters:

Cron is external to the app, minimum 1-minute granularity, and has no access to application state — it would mean a separate entrypoint script and no way to honor per-URL intervals cleanly.
A message queue (Celery/RQ + Redis) is the "scalable" answer and the wrong one here. It adds a broker, a worker service, and serialization boundaries to solve a coordination problem that doesn't exist at dozens of URLs on one process.
APScheduler in-process keeps the schedule in the same runtime as the DB session and the check logic, with no extra containers.

The 15s tick with per-URL _is_due() logic is the piece I'd defend hardest: the naive design is one job per URL, which doesn't scale past a few dozen timers; the other naive design is one global tick that ignores configured intervals entirely, which is what the first version actually did. A short shared tick plus a due-check gives real per-URL intervals with exactly one scheduled job.

The split between GET /urls/{id} and GET /urls/{id}/checks is deliberate, not redundant. They look like duplicates and I questioned them directly. They aren't: /urls/{id} returns current state — latest check, 24h uptime %, last incident — a small fixed-size payload the dashboard polls constantly. /checks returns a time series for charting, sized by ?limit=. Collapsing them would mean either shipping full history on every 2s poll (wasteful, and it grows unbounded) or losing the history endpoint the sparkline depends on. Different shapes, different cardinality, different cache behavior — they're correctly separate.

Polling over WebSockets. 2s polling of a handful of JSON endpoints is one moving part. WebSockets would add connection lifecycle, reconnect/backoff logic, and a stateful server for sub-second latency that a monitoring dashboard checking URLs every 30s does not need. Documented as a trade-off rather than a default.

No pagination. The brief says "dozens of URLs." Pagination solves rendering and query cost at hundreds-to-thousands, and would add state (page, sort, filters) plus API surface for a list that fits in one scroll. What "dozens of URLs" actually breaks is scannability, not performance — so the fix was sorting down → pending → up, keeping a failing endpoint at the top of the page, with creation order preserved within each group so healthy cards don't reshuffle on every poll. That's the real problem at that scale.

Fail loud, never fabricate. The frontend renders an error state and no data when the API is unreachable. For a monitoring tool this is a correctness requirement, not a UX preference — a dashboard that shows plausible green numbers when it can't reach the backend is worse than one showing nothing, because it produces false confidence at exactly the moment confidence matters.

Incidents derived, not stored. "Last incident" is computed by scanning recent checks for the most recent is_up flip rather than maintained in its own table. At this scale the query is cheap, and a second table would have to be kept transactionally in sync with checks on every write — a consistency bug waiting to happen for no gain. I'd revisit this if history grew past what a bounded scan handles.

Webhooks on transition only. Alerting on every down check means one alert every 30s for the entire outage — the fastest way to get a monitoring tool muted. save_check_and_maybe_alert() compares each check against the previous one and fires only on a flip. Delivery is fire-and-forget with a short timeout and swallowed errors: a broken webhook endpoint must never fail or roll back the check itself. Alerting is a side effect of monitoring, not its job.

SSL reads off the event loop. Python's ssl/socket API is synchronous. Called directly inside async def, one slow TLS handshake stalls every other check on that tick — silently undoing the concurrency work. asyncio.to_thread keeps it parallel.

AWS: ECS Fargate + RDS, scheduler in-process. Fargate because this is a small, bursty-light service and managing EC2 instances for it is overhead with no payoff; RDS Postgres in-VPC, not publicly accessible; secrets in Secrets Manager, not the task definition. The scheduler stays in-process at this scale — but that's the first thing I'd split out. Past roughly an order of magnitude more URLs, or if the API needed to scale horizontally, multiple replicas would each run their own scheduler and duplicate every check. At that point the ping job moves to EventBridge Scheduler + SQS + a dedicated worker service, separating who owns the schedule from who does the pinging. That's a real architectural boundary, and deliberately not one I crossed for an MVP.