# Quest3 agent chat test

AI personas sign in to Quest3 with their own profiles and try to get to know each other through the Q&A feature, using as few questions as possible. The test measures how well Q3 supports that, and the agents also look for privacy and security problems along the way.

## How it works

- **Personas**: `Mike/`, `Bella/`, `Ian/`, `Eric/` each hold a `<Name>.agent.md`. The frontmatter has the model, a fixed `oid` and `email` (used to sign a local JWT, so every run uses the same Q3 profile). The body is the private persona: identity, personality, hidden links to the others, and disclosure tiers (Public, Trust, Never). Every record, including the private inner voice, is in English.
- **Options**: every new question has 4-10 distinct options of at most four words. An agent answers with exactly one existing option, or one new short option when none fits. Long-text answers are invalid under the harness rules.
- **Harness**: `agentChat.run.mts` contains the run logic; `agentChat.test.mts` is the small Vitest entry point. Three of the four agents join each run. The trio rotates, so every pair meets equally often. Agents act concurrently, **one Q3 API call per step**, like people tapping through the app. Each step the LLM gets a compact snapshot (news since its last look, profiles, the questions and answers it can see, its memory, its last few steps). It returns `{note, action, findings}`.
- **Security boundary**: the LLM runs through `claude -p` with no tools, no MCP and an empty temp dir as cwd. It cannot read files. The harness signs each call with the agent's own token, only calls `QUESTION_URL`, and enforces the run limits before anything reaches the API.
- **Limits per agent per run**: 10 question creates/edits, 100 answer writes, text only. Lengths: title 60, questionText 200, answer 500 characters. Over-limit calls are invalid and logged.
- **Memory**: after meaningful activity and once at the end, the harness rebuilds one private `<Name>/memory/<Other>.md` file per person from Q3 evidence. This is deterministic code, not another LLM call.
- **Memory evidence**: memory contains Facts only. An answer is stored under a person only when Q3 explicitly identifies that person as its author. Anonymous answers are discarded rather than assigned by voice, names or story, and every fact carries its question and answer IDs.
- **Judge**: after the run, one Sonnet call compares each memory file with the real persona. It scores accuracy 0-10, lists hidden links and leaks, and treats every answer as private to its question asker rather than as a global persona fact.

## Setup (once)

1. Node 24 and pnpm. Then run `pnpm install` in the repo root (this also installs Azurite).
2. Azure Functions Core Tools v4: `brew install azure-functions-core-tools@4`.
3. Claude Code CLI, logged in:
   ```sh
   curl -fsSL https://claude.ai/install.sh | bash
   claude        # log in once in the browser, then /exit
   ```
   Runs use **your own** Claude subscription or API key. If `claude` is not in `~/.local/bin` or on PATH, set `CLAUDE_BIN`.

   **No Claude?** Any OpenAI-compatible chat API works instead. Set these three variables and skip the CLI:

   ```sh
   LLM_BASE_URL=https://api.openai.com/v1   # or http://localhost:11434/v1 (Ollama), https://openrouter.ai/api/v1, ...
   LLM_API_KEY=sk-...                       # leave unset for local servers such as Ollama
   AGENT_MODEL=gpt-5-mini                   # model name as that provider spells it; also used by the judge unless JUDGE_MODEL is set
   ```

   With `LLM_BASE_URL` set, the harness calls `<base>/chat/completions` directly with `fetch`. The JSON schema is part of the prompt, so it does not depend on provider-specific structured-output support. Small local models sometimes reply with broken JSON. That step then counts as an LLM error, and an agent stops after 3 in a row. Expect lower judge scores from weaker models.

## Run

Use three terminals:

```sh
# 1. Repo root: Azurite. Data goes to ./__azurite_db_table__.json, which is gitignored.
node node_modules/azurite/dist/src/azurite.js --location . --tableHost 127.0.0.1 --tablePort 10002 --silent

# 2. module/quest3Tier/func: the Q3 API on port 7073, with local JWT auth (builds first)
AUTH_PROVIDER=Dev pnpm start

# 3. Repo root: the agent run
AGENT_RUN=1 pnpm vitest run module/quest3Tier/func/vitest/agents/agentChat.test.mts --disableConsoleIntercept
```

Without `AGENT_RUN=1` the test is skipped, so normal test runs never call an LLM.

Each agent run resets only records connected to its current participants. The reset configures its Table Storage client from `AzureWebJobsStorage`, loaded by the Q3 Vitest setup from `local.settings.json`, and refuses to run unless it uses local Azurite (`UseDevelopmentStorage=true`).

To watch the conversation live, use the terminal, or open `runs/<time>_<participants>.chat.md`.

### Visual observer

See the [viewer architecture overview](viewer/architecture-overview.md) for the UI, data flow, and build details.

From the repo root, start the local viewer in another terminal:

```sh
pnpm exec tsc --project module/quest3Tier/func/vitest/agents/tsconfig.json
node module/quest3Tier/func/dist/vitest/agents/viewer/server.mjs
```

Open `http://127.0.0.1:4178`. It follows the selected `.chat.md` once per second, can replay earlier runs and shows the completed judge report under **Results**. **New test** starts Azurite when needed and refuses to spend an agent run if the Q3 API is not available. The viewer does not expose persona files or change what the agents see. Set `AGENT_VIEW_PORT` to use another port. A quick check is available after the build with `node module/quest3Tier/func/dist/vitest/agents/viewer/server.mjs --check`.

To run it from the VS Code Vitest extension instead, add `"vitest.nodeEnv": { "AGENT_RUN": "1" }` to your **user** settings. Then run only this test, and keep Continuous Run off: otherwise every file save starts a paid run. Only one run can be active at a time; a second one fails fast because of `runs/.lock`.

### Options (environment variables)

| Variable | Default | Effect |
|---|---|---|
| `AGENTS` | rotation | Pick the trio, e.g. `AGENTS=Mike,Bella,Ian` |
| `AGENT_STEPS` | 20 | Max steps (API calls) per agent per run |
| `AGENT_MODEL` | from `agent.md` (`haiku`) | Model for all agents |
| `AGENT_EFFORT` | `low` | Effort for agent steps (thinking is off; Claude CLI only) |
| `JUDGE_MODEL` | `sonnet`, or `AGENT_MODEL` with `LLM_BASE_URL` | Model for the judge |
| `REVEAL_AUTHORS` | off | Control arm: shows each answer's author to the agents |
| `CLAUDE_BIN` | `~/.local/bin/claude`, else `claude` | Path to the CLI |
| `LLM_BASE_URL` | unset | Use an OpenAI-compatible API instead of the Claude CLI (needs `AGENT_MODEL`) |
| `LLM_API_KEY` | unset | Bearer token for `LLM_BASE_URL` |

## Output

- `runs/<time>_<participants>.chat.md`: the live conversation, one line per action.
- `runs/<time>_<participants>.md`: the report. It has metrics (steps, new questions, edits, shares, re-shares, answered/seen, rejections, errors), the judge's scores and leaks, the agents' findings, the final questions with answers, and the full call log.
- `<Name>/memory/<Other>.md`: one file containing that agent's current picture of one other person. It carries over between runs.

**Reset**: stop Azurite, then delete `__azurite_db_table__.json` in the repo root, each Agent's `memory/` directory and `runs/`. Delete them together; otherwise agents remember things that Q3 no longer has.

**Cost per run**: up to 90 Haiku step calls (~4k input / ~200 output tokens each) and 1 Sonnet judge call. Fact-only memory uses no LLM call. A run typically takes about 6-8 minutes.

## Results so far (Sept-Oct 2026, Haiku agents)

**Anonymous answers are the main obstacle to getting to know each other.** Q3 hides who wrote each answer from everyone except the author. In every run, agents attached other people's answers to the wrong person. For example, Ian remembered Eric as "a Brisbane shark researcher", which is Bella. And Bella gave Eric Mike's Daejeon family.

We ran a controlled A/B: same trio (Eric, Mike, Bella), same starting DB and memories, same harness. The only difference was whether answer authors were shown.

| Observer to subject | A: anonymous (Q3 today) | B: authors shown |
|---|---|---|
| Eric to Mike | 5 | 5 |
| Eric to Bella | 1 | 6 |
| Mike to Eric | 7 | 7 |
| Mike to Bella | 7 | 7 |
| Bella to Eric | 3 | 4 |
| Bella to Mike | 3 | 6 |
| **Average accuracy /10** | **4.3** | **5.8** |
| Hidden links listed by judge | 4 (2 only half-connected) | 8 (1 partial) |
| Leaks found by judge | 5 | 7 |

This is one run per arm, so it shows the direction rather than a precise effect size. The biggest gains are exactly where A misattributed answers. Both reports are in `runs/` (the B report ends in `.reveal.md`).

**Other observations**

- Agents mostly re-use and answer existing questions rather than create new ones. They almost never edit a question, so the "improve questions" metric stays near 0.
- Trust-tier details often leak into answers on questions shared with the whole group (Ian's worries about his daughter, Bella's farm and lab funding).
- Long answers are invalid above the 500-character limit.

**Q3 issues for review**

Found by the agents during runs:
- `GET /question/{id}/answer/{answerId}` returns the author's `profileId`, while the answer list hides it. Any user who can see a question can de-anonymise its answers.
- Answering a question id that does not exist returns **500** ("Question not found") instead of 404.

Noticed in the code but not yet exercised by the agents:
- `GET /profiles` returns every user's name **and email** to any signed-in user.
- `POST /question/{id}/share` does not check that the sender owns the question or can see it.
- `GET /question/{id}/answers` and `GET /question/{id}/answer/{answerId}` do not check that the caller can see the question.

## Known limits

- Tested on macOS only. On Windows, the env-var syntax and the CLI path differ.
- Agents are role-played by an LLM. They show where the app's design helps or hurts, but they do not replace real users.
- Scores come from an LLM judge and vary between runs. Compare trends over several runs, not single numbers.
