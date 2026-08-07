# AI Collaboration Log

## AI tech stack

- **Assistant:** Claude (Sonnet 5), used via Anthropic's Cowork mode (a Claude Code-based agent
  with direct file/shell access — functionally the same category of tool as Cursor or GitHub
  Copilot's agent mode).
- **Interaction style:** conversational, multi-turn. I described the assignment and goals, Claude
  proposed a system design, I picked the stack/features/cloud target from a set of options, and
  Claude wrote, ran, and debugged the code in a sandboxed environment before handing it back.

## The prompts that shipped it

These are the actual prompts I gave, close to verbatim, in the order I gave them:

1. **Understanding the task:**
   > "first explin me abt this task" (pasted the full assignment brief)

   Claude broke down the three deliverables (backend, frontend, docker-compose) plus the two
   parts people usually under-deliver on (AI_LOG.md and the deployment sketch), and asked whether
   I wanted it to start building or talk through architecture first.

2. **Confirming what AI_LOG.md actually requires:**
   > "so they are literally asking. to use ai tools and add the prompts?"

   Claude clarified that raw prompts (not paraphrased) were expected, plus tool/model used and a
   real example of the AI making a mistake — and proposed keeping this log honest to what actually
   happened rather than writing a fabricated "used Cursor" narrative.

3. **Kicking off the build:**
   > "yh . i want to submit this tomorrrow eod . i want this to be best . make it the best . so
   > first lets do system design . make it better , add intersting feature or wat idk ,"

   Claude proposed the architecture (FastAPI + async scheduler + Postgres + React/Recharts
   dashboard) and asked me to choose between stack options, a set of "wow factor" features, and a
   cloud target via a structured multiple-choice prompt rather than guessing. I picked:
   **FastAPI + React + Postgres**, **response-time chart per URL**, **AWS (ECS Fargate + RDS)**.

4. **Implicit instruction (via the design approval):** build the full repo — backend models,
   scheduler, REST API, React dashboard, docker-compose, README, and this log — and actually test
   it rather than just generating code and assuming it works.

5. **Sanity check on ownership:**
   > "bro wait did u just the build the whole thing now? wat is my role here ? isnt it how they
   > wanted ?"

   This prompted a discussion (kept out of this log's "shipped it" section since it's process, not
   generation) about what "leaning on AI assistants" is supposed to mean for this assignment, and
   led to me actually reading/verifying the generated code before submission rather than shipping
   it blind.

## The course correction

While testing the backend locally (registering `https://example.com` and a deliberately broken
domain), every `POST /urls` call returned `500 Internal Server Error`. The traceback pointed to
`httpx.AsyncClient.__init__`:

```
ValueError: Unknown scheme for proxy URL URL('socks5h://localhost:1080')
```

Claude's first-pass code created the `httpx.AsyncClient` with default settings, which meant it
picked up ambient proxy environment variables (`ALL_PROXY`/`HTTP_PROXY`) from the host
environment. In the sandbox used for testing, that env var pointed at a SOCKS proxy scheme httpx
couldn't parse, and the client crashed on construction — before it ever got a chance to make the
request, let alone classify it as up or down.

This wasn't a hallucinated library or a fundamentally broken architecture, but it was a real,
reproducible bug: the checker was silently depending on whatever proxy configuration happened to
be present in the process environment, which is exactly the kind of thing that works on one
machine and breaks on another (or, ironically, breaks in the more locked-down sandbox but might
have looked fine in a normal dev environment without a proxy set).

**Fix:** added `trust_env=False` to the `httpx.AsyncClient` constructor in `backend/app/checker.py`,
so each check explicitly ignores host proxy env vars and always makes a direct request. After the
fix, `POST /urls` returned `201 Created` and check results (including the correctly-classified
`is_up: false` / DNS-failure error for the broken domain) came back as expected.

This is also why the README calls out that up/down detection was verified against the *down* path
in this environment (the sandbox itself has no outbound DNS resolution), while the *up* path
relies on the same `200 <= status_code < 400` branch and is expected — and should be explicitly
re-verified by whoever runs `docker compose up` with real internet access, per the testing steps
in the README.

## What I did *not* just accept as-is

- Reviewed the down-detection logic (timeout vs. connection error vs. non-2xx) to make sure a
  "down" status always has an explainable reason attached, rather than a generic failure.
- Pushed back on WebSockets as a default choice for "real-time" updates — 5s polling is simpler,
  has one less moving part in Compose, and is more than sufficient at "checked every minute"
  scale. This is called out explicitly in the README's design notes rather than silently decided.
- Actually ran the backend and frontend build in a sandbox before calling it done, instead of
  trusting that generated code would work — which is how the proxy bug above was caught in the
  first place.
