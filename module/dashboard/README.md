# Quest3 agent chat test

AI personas sign in to Quest3 with their own profiles and try to get to know each other through the Q&A feature, using as few questions as possible. The test measures how well Q3 supports that, and the agents also look for privacy and security problems along the way.

Architecture decisions: [Dashboard Activity data](Decisions/001-dashboard-activity-data.md) and [Dashboard access to the Quest backend](Decisions/002-dashboard-quest-backend-access.md).

Dashboard question, answer, network and referee data reads now use Q3's Table
repository in-process. They require existing canonical profiles and provisioned
tables; reads do not create tables or migrate legacy profiles. Agent Chat calls
Dashboard HTTP, which invokes Q3 handlers in-process. Neither path requires the
Q3 Functions HTTP host. Human Quest UI requests still require that host.

## How it works

- **Personas**: `Mike/`, `Bella/`, `Ian/`, `Eric/` each hold a `<Name>.agent.md`. The frontmatter has a fallback model, a fixed external profile `oid` and an `email`. Dashboard binds temporary execution credentials to each agent's profile; no Quest JWT is generated. The body is the private persona: identity, personality, hidden links to the others, and disclosure tiers (Public, Trust, Never). Every record, including the private inner voice, is in English.
- **Options**: every new question has 4-10 distinct options of at most four words. An agent answers with exactly one existing option, or one new short option when none fits. Long-text answers are invalid under the harness rules.
- **Harness**: Dashboard launches `agentChat.run.mts` as a child process; the opt-in run in `agentChat.test.mts` starts it through Dashboard HTTP. Three of the four agents join each run. The trio rotates, so every pair meets equally often. Agents act concurrently, **one Dashboard operation per step**, like people tapping through the app. Each step the LLM gets a compact snapshot (news since its last look, profiles, the questions and answers it can see, its memory, its last few steps). It returns `{note, action, findings}`.
- **OpenVINO**: local inference calls are queued because the shared pipeline supports only one generation at a time. A failed call is reported to its caller without blocking later calls; Dashboard operations remain concurrent.
- **Live dashboard chat**: selecting an active participant sends messages to that same agent in the running harness, between action turns. Replies use its current context and existing provider queue; conversation can guide later actions but never bypasses rules or budgets, and is not verified factual memory. The viewer does not load a second model during the run. Offline/finished agents reject messages instead of simulating replies. The separate results assistant is available after the run, with inference isolated in a disposable subprocess.
- **OpenVINO model loading**: text-only exports use `LLMPipeline`; multimodal exports containing `openvino_vision_embeddings_model.xml` (including Qwen3.5) use `VLMPipeline`, even for text-only requests. Select the model with `LLM_MODEL`, or `OPENVINO_MODEL_DIR` when `LLM_MODEL` is unset. Run `pnpm exec vitest run module/dashboard/openvinoUnit.test.mts module/dashboard/llmProvider/openvino.provider.test.mts` to verify the selected model loads, reuses its pipeline, and generates structured JSON on successive calls. These hardware integration tests require a local model and never substitute a different model when the selected directory is missing.
- **Security boundary**: with Claude CLI, inference runs through `claude -p` with no tools, no MCP and an empty temp dir as cwd. The harness sends proposed actions to Dashboard's `/api/agent` with per-agent execution credentials. Dashboard binds identity to those credentials, restricts allowed operations and enforces write budgets before invoking Q3 handlers. Credentials expire when the run ends. Administrative post-run chat may use the whole report and Activity; active agents and live chat retain agent-scoped context.
- **Limits per agent per run**: 10 question creates/edits, 100 answer writes, text only. Lengths: title 60, questionText 200, answer 500 characters. Over-limit calls are invalid and logged.
- **Memory**: after meaningful activity and once at the end, the harness rebuilds one private `<Name>/memory/<Other>.md` file per person from Q3 evidence. This is deterministic code, not another LLM call.
- **Memory evidence**: memory contains Facts only. An answer is stored under a person only when Q3 explicitly identifies that person as its author. Anonymous answers are discarded rather than assigned by voice, names or story, and every fact carries its question and answer IDs.
- **Judge**: after the run, one call using the configured Judge model compares each memory file with the real persona. It scores accuracy 0-10, lists hidden links and leaks, and treats every answer as private to its question asker rather than as a global persona fact.

## Setup (once)

1. Node 24 and pnpm. Then run `pnpm install` in the repo root (this also installs Azurite).
2. Configure Table storage in Dashboard's `local.settings.json` (`Values.AzureWebJobsStorage` or `Values.AzureWebJobsStorage__tableServiceUri`). Environment values take precedence. Use `UseDevelopmentStorage=true` for default local Azurite; provision tables before use. Azure Functions Core Tools v4 is needed only for the separate human Quest UI / external Q3 API flow.
3. Claude Code CLI, logged in:
   ```sh
   curl -fsSL https://claude.ai/install.sh | bash
   claude        # log in once in the browser, then /exit
   ```
   Set `LLM_PROVIDER=claude` in Dashboard settings. Runs use **your own** Claude subscription or API key. If `claude` is not in `~/.local/bin` or on PATH, set `CLAUDE_BIN`.

   **No Claude?** Select an OpenAI-compatible provider in Dashboard settings instead:

   ```sh
   LLM_PROVIDER=openai                     # use ollama for Ollama
   LLM_BASE_URL=https://api.openai.com/v1   # or http://localhost:11434/v1 (Ollama), https://openrouter.ai/api/v1, ...
   LLM_API_KEY=sk-...                       # leave unset for local servers such as Ollama
   AGENT_MODEL=gpt-5-mini                   # model name as that provider spells it; also used by the judge unless JUDGE_MODEL is set
   ```

   With the OpenAI or Ollama provider selected, the harness calls `<base>/chat/completions`. Setting an endpoint alone does not select a provider. The JSON schema is part of the prompt, so it does not depend on provider-specific structured-output support. Small local models sometimes reply with broken JSON. That step then counts as an LLM error, and an agent stops after 3 in a row. Expect lower judge scores from weaker models.

## Run

### Provider integration smoke test

From the repository root, run `pnpm exec vitest run module/dashboard/llmProvider/llmProvider.test.mts` to test the configured provider and the predefined backends in that file. Dashboard's settings loader supplies configuration. These tests use real providers without mocks and check readiness and responses; unavailable backends fail rather than skip.

| Preset | Model | Connection |
|---|---|---|
| OpenVINO | `D:\Models\OpenVINO\Qwen3.5-9B-int4-ov` | GPU, with the provider's CPU fallback |
| Ollama | `qwen2.5:3b` | `http://localhost:11434/v1`, no API key |
| OpenAI | `gpt-5-mini` | `https://api.openai.com/v1`; requires `OPENAI_API_KEY` or `LLM_API_KEY` |
| Claude | `haiku` | Logged-in Claude CLI; respects `CLAUDE_BIN` |

Presets run even when they duplicate the locally selected provider. Unavailable backends fail their suite rather than skip. Models/endpoints are hardcoded; credentials remain in local settings or environment variables.

The local-settings suite uses `AGENT_MODEL`, then `LLM_MODEL`, or the provider default when neither is set. Configure the selected backend's usual connection/authentication settings and model (for example, `AGENT_MODEL` for OpenAI/Ollama, or `LLM_MODEL` / `OPENVINO_MODEL_DIR` for OpenVINO). These tests make real LLM calls and can incur API costs. They do not require the Q3 API or Azurite.

The same file exports `testJsonObject(provider, model)` and `testBasicRequest(provider, model)` for reuse in other Vitest tests. Both perform the request and assert its result. Importing [llmProvider.test.mts](llmProvider/llmProvider.test.mts) also registers all its integration suites.

### Agent chat run

Use three terminals:

```sh
# 1. Only for default local storage: Azurite. Skip for an already available configured database.
node node_modules/azurite/dist/src/azurite.js --location . --tableHost 127.0.0.1 --tablePort 10002 --silent

# 2. Repo root: build Quest, then start Dashboard with its storage and LLM settings
pnpm --dir module/quest3Tier/func run build
pnpm --dir module/dashboard start

# 3. Repo root: the agent run
AGENT_RUN=1 pnpm vitest run module/dashboard/agentChat.test.mts --disableConsoleIntercept
```

Without `AGENT_RUN=1` the test is skipped, so normal test runs never call an LLM.

Runs retain existing data. Dashboard launches Agent Chat with temporary per-agent execution credentials and invokes Quest in-process; the Quest HTTP host and local JWT signer are not needed. The opt-in test above starts and waits for a Dashboard run, using the running Dashboard's settings. The child verifies Dashboard's `/api/run` before inference or writes. Default Azurite starts automatically on demand only with `UseDevelopmentStorage=true`; custom endpoints and remote storage must already be available and do not start local Azurite.

To watch the conversation live, use the terminal, or open `runs/<time>_<participants>.chat.md`.

### Visual observer and helper scripts

See the [viewer architecture overview](viewer/architecture-overview.md) for the UI, data flow, and build details.

**LLM configuration**: Dashboard and its Agent/results/Referee workers use environment variables first, then `Values` in Dashboard's [local.settings.json](local.settings.json). Invalid settings files fail explicitly. Role settings (`AGENT_MODEL`, `JUDGE_MODEL`, `CHAT_MODEL`, `REFEREE_MODEL`) take precedence over the selected provider's model (`CLAUDE_MODEL`, `OPENAI_MODEL`, `OLLAMA_MODEL`; OpenVINO uses `LLM_MODEL`, then `OPENVINO_MODEL_DIR`). OpenAI/Ollama also accept `LLM_MODEL`. Claude CLI keeps persona/default models only when no model is configured. Existing Judge/Referee model fallbacks remain when no provider model is configured. Restart Dashboard after changing its process environment; each new worker receives the service's resolved settings. Keep credentials in local settings or deployment environment variables, never in tracked files.

From the repo root, start the local viewer in another terminal:

```sh
pnpm --dir module/quest3Tier/func run build
pnpm --dir module/dashboard start
```

Or run via the helper scripts / VS Code tasks:
- `pwsh module/dashboard/run-openvino.ps1` (or the VS Code task **Start OpenVino**)
- `pwsh module/dashboard/run-ollama.ps1` (or the VS Code task **Start Ollama**)

Open `http://127.0.0.1:4178`. The viewer refreshes run data once per second and shows completed judge reports under **Results**. Activity comes from LanceDB, with legacy text-log fallback; question, answer and network views read current Quest data through Dashboard. Set `AGENT_VIEW_PORT` to use another port. After building, run `pnpm --dir module/dashboard check` for the server self-check.

For human participation, also start the Q3 Functions HTTP service and Quest UI configured to use it. Quest UI registers the person with Dashboard via `/api/join`, but question, share and answer requests still go to the authenticated Q3 API and the same configured database. Dashboard agent runs do not test that external HTTP authentication boundary. Run Q3 route-contract tests separately with `pnpm exec vitest run module/quest3Tier/func/vitest/routeContract.test.mts`; these mock authentication/repository dependencies, so real authenticated HTTP verification remains a separate integration check.

For focused tests without real LLM calls, run from the repository root:

```sh
pnpm exec vitest run module/dashboard/agentChat.test.mts module/dashboard/viewer/agent-operations.test.mts module/dashboard/activity/activity.test.mts module/quest3Tier/func/vitest/routeContract.test.mts module/quest3Tier/func/vitest/tableReadSideEffects.test.mts
```

To run it from the VS Code Vitest extension instead, add `"vitest.nodeEnv": { "AGENT_RUN": "1" }` to your **user** settings. Then run only this test, and keep Continuous Run off: otherwise every file save starts a paid run. Only one run can be active at a time; a second one fails fast because of `runs/.lock`.

### Options (environment variables)

| Variable | Default | Effect |
|---|---|---|
| `AGENTS` | rotation | Pick the trio, e.g. `AGENTS=Mike,Bella,Ian` |
| `AGENT_STEPS` | 20 | Max steps (API calls) per agent per run |
| `AGENT_MODEL` | provider model, then Claude persona/default | Model override for all agents |
| `AGENT_EFFORT` | `low` | Effort for agent steps (thinking is off; Claude CLI only) |
| `JUDGE_MODEL` | provider model, then Claude `sonnet` or non-Claude `AGENT_MODEL` | Model override for the judge |
| `REFEREE_MODEL` | provider model, then `JUDGE_MODEL` | Optional model override for Referee Chat |
| `REVEAL_AUTHORS` | off | Control arm: shows each answer's author to the agents |
| `CLAUDE_BIN` | `~/.local/bin/claude`, else `claude` | Path to the CLI |
| `LLM_PROVIDER` | required | Select the configured LLM provider |
| `LLM_BASE_URL` | unset | Endpoint for the selected compatible provider; does not select a provider |
| `LLM_API_KEY` | unset | Bearer token for `LLM_BASE_URL` |

## Output

- `runs/<time>_<participants>.chat.md`: the live conversation, one line per action.
- `runs/<time>_<participants>.md`: the report. It has metrics (steps, new questions, edits, shares, re-shares, answered/seen, rejections, errors), the judge's scores and leaks, the agents' findings, the final questions with answers, and the full call log.
- `<Name>/memory/<Other>.md`: one file containing that agent's current picture of one other person. It carries over between runs.

**Data retention**: normal runs retain existing Quest data, memory and Activity. Stage 7 does not reset or migrate the database. Use a separate disposable database and output directories for integration verification.

**Historical Haiku/Sonnet cost example**: up to 90 Haiku step calls (~4k input / ~200 output tokens each) and 1 Sonnet judge call. Fact-only memory uses no LLM call. A run typically takes about 6-8 minutes.

## Results so far (Sept-Oct 2026, Haiku agents)

The observations below describe those historical runs, not the current API contract.

**Anonymous answers were the main obstacle to getting to know each other.** Q3 hides who wrote each answer from everyone except the author. In every run, agents attached other people's answers to the wrong person. For example, Ian remembered Eric as "a Brisbane shark researcher", which is Bella. And Bella gave Eric Mike's Daejeon family.

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
