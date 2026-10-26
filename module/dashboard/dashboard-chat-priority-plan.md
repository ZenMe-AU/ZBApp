# Dashboard Chat Priority Plan

## Goal

Reduce dashboard chat timeouts by placing replies ahead of pending normal agent
turns. Keep one OpenVINO generation active at a time and do not interrupt an
inference already running. Memory persistence is outside this change.

## Current Behavior

- `OpenvinoProvider.completeJson` uses a promise chain that processes requests in
  submission order across all three agents.
- Dashboard messages wait until the addressed agent reaches its next turn and
  calls `liveChat.drain`.
- The dashboard reply then waits behind normal calls already in the model queue.
- Live chat requests time out after 200 seconds. Increasing that timeout alone
  would not address the scheduling problem.

## Implementation

1. **Add an explicit priority queue.**
   - Update `llmProvider/openvino.provider.mts` to keep pending requests separate
     from the active generation.
   - Add a typed request priority to `llmProvider/contract.mts`, defaulting to
     normal. Mark dashboard replies as high priority in `agentChat.run.mts`.
   - Select dashboard requests before pending normal turns, preserving arrival
     order within each priority level.
   - Keep the pipeline strictly single-flight and release the queue after either
     success or failure.

2. **Deliver dashboard messages immediately.**
   - Update `agentChat.live.mts` and its integration in `agentChat.run.mts` so
     accepted messages trigger processing without waiting for `runAgent` to drain
     them at a turn boundary.
   - Build reply context from the addressed agent's current state and enqueue a
     high-priority model request.
   - Retain the existing one-pending-message-per-agent constraint.

3. **Prevent stale agent actions.**
   - Pause new normal turns for an agent while its dashboard message is pending.
   - Track a per-agent context revision when a dashboard message arrives.
   - Discard a normal decision if its context revision changed during inference;
     re-observe before making another decision or issuing an API write.
   - Coordinate state observation and mutation so immediate chat handling does
     not race the normal loop's seen tracking or conversation updates.

4. **Handle abandoned requests and show progress.**
   - Remove disconnected or timed-out dashboard requests before their generation
     starts, including requests already waiting in the model queue.
   - Allow an active generation to finish without attempting to deliver to a
     closed response. Do not assume OpenVINO supports inference cancellation.
   - Expose queued and replying states through the viewer's chat API and display
     them in the dashboard rather than treating sent as delivery confirmation.
   - Keep timeout errors explicit; do not use a larger timeout as the primary fix.

## Verification

Extend the existing provider, live-chat, and dashboard conversation tests using
mocked inference and temporary files. Do not require a live model or modify saved
agent memory.

- An active normal generation finishes before a newly submitted dashboard reply.
- The dashboard reply runs before normal requests that were already pending.
- Dashboard messages preserve arrival order, and normal requests preserve their
  relative order.
- No two pipeline generations overlap.
- A failed generation rejects its caller without blocking subsequent requests.
- Dashboard delivery begins while the addressed agent's normal turn is pending.
- A dashboard message invalidates an earlier decision before it can write to the
  Q3 API.
- Timed-out or disconnected messages are skipped before inference starts.
- Duplicate pending messages for the same agent are rejected consistently.
- Viewer states distinguish queued, replying, completed, and failed messages.
- Run the focused tests, the Q3 TypeScript build, and the agent viewer build.
- Manually test chat during a three-agent OpenVINO run and compare enqueue,
  generation-start, and reply timestamps.

## Expected Outcome And Limits

A dashboard reply waits for the active generation, any earlier dashboard replies,
and its own generation instead of waiting behind pending normal agent turns.
Context gathering may add latency. A stalled active inference can still cause a
timeout; priority does not provide a hard response-time guarantee. Sustained chat
traffic can delay normal agent work.

## Scope

No changes to automatic reset behavior, saved memory, session persistence, model
selection, or normal agent rules. Implement and verify this separately from memory
improvements.