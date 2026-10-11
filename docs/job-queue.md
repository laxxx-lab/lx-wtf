# Durable local job queue

The expanded Orb view now shows a blocked/held queue above the conversation.
“Auftrag prüfen” invokes the existing owner-checked reconciliation, never retry
or submit. A known idle remote can leave uncertain work paused and release the
queue without claiming that its original action succeeded. New queued requests
also name an observed waiting reason: unknown prior outcome, running agent,
ongoing playback, unfinished capture or local processing.

The approved Jarvis queue task adds `JobQueue` in `job-queue.cjs`, its behavioral tests in `tests/job-queue.test.cjs`, and this integration contract. The queue stores explicit user jobs, owns their original Hermes session/profile, serializes dispatch, and requires reconciliation whenever a remote outcome is uncertain. It performs no Hermes requests or external actions itself.

## Integration

```js
const { JobQueue } = require('./job-queue.cjs');
const queue = new JobQueue({
  file: absoluteLocalJobsFile,
  onChange: snapshot => publishSafeQueueSnapshot(snapshot),
});
const job = queue.enqueue({ text, title, sessionId, profile, appId, speak, turnId });
const claimed = queue.claim({ sessionId, profile });
// Only a non-null claimed record may be sent. Fence every response with claimed.id.
```

Production should pass the ignored local `.local/jobs.json` absolute path. `file: null` or an omitted file creates an isolated memory queue for tests and performs no filesystem operations. `now` defaults to `Date.now`; `onChange` defaults to a no-op.

The main process must honor the existing privacy lock, mode and interruption policy before claiming or sending work. Call `pauseAll(reason)` when dispatch must stop; only an explicit user resume calls `resumeQueue()`. A hold stops further dispatch and does not prove that an already running remote job stopped. The queue never restarts the app, activates a window, reads credentials or sends messages.

Store the exact claimed job ID with the outgoing request. Use that ID for acceptance, finish, timeout and disconnect events; a session match alone never identifies the job. A deliberate retry returns a **new ID**, so callers must replace their old event correlation. Remote send uncertainty calls `unknown(id, reason)`, including timeout or connection loss after a possible send. Reconciliation must use an observed remote status for the stored owner, rather than the currently selected owner.

## Remote reconciliation helper

`job-reconciliation.cjs` exports `verifyJobOutcome({gateway,job})`, returning a promise for `{correlated,remoteRunning,runtimeId?,reason?}`. It observes Hermes without changing `Conversation`, `JobQueue`, privacy state or the supplied job. It never submits, retries or interrupts a prompt. Callers retain their job, owner and connection-generation fences across the asynchronous check.

Every queued outgoing request must start with the exact marker `[Lilith-Auftrag: UUID]`, substituting the claimed job's `id`, followed by its instructions. A retry therefore uses its replacement ID. Correlation requires that marker at the beginning of the **latest user** message. Markers in assistant, system or tool messages, quoted markers, and older marked user requests do not establish ownership.

The helper calls `gateway.request('session.resume', {session_id:job.sessionId,profile:job.profile,omit_messages:true,inline_images:false},15000)` with the stored owner. `running` must be a literal boolean; absent, string or numeric values remain unknown. A valid optional `session_id` in that response becomes `runtimeId`, supporting Hermes runtime rekeying. It first reads `/api/sessions/<encoded stored ID>/messages?limit=8&order=latest&inline_images=false&profile=<encoded stored profile>`. If these valid records contain no user message, it expands once to `limit=128`: a tool-heavy turn may have displaced the original request from eight records. Each RPC/history read is bounded to 15 seconds, including a gateway implementation that never settles its promise. The latest exact user marker and original ownership are still required; a tool response or assistant claim never establishes correlation. If 128 records also contain no user marker, the outcome remains unknown. Late responses do not change the returned observation.

The [official REST route](https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/web_routers/sessions.py) accepts explicit limits, latest-page ordering, profile selection and image-free projection. Its response contains `session_id`, `profile`, `messages` and pagination. The route resolves a stored session to its compression descendant, coerces non-null content to text when `inline_images=false`, and preserves null content. Omitting `profile` would read the serving process's store, so the helper always supplies the original owner.

The recognized history shape is `{messages:[{role,content,timestamp?}]}`, with optional `session_id` and `profile` ownership fields. Only the known `user`, `assistant`, `system` and `tool` roles are accepted. Present foreign ownership fields are rejected. The [official resume implementation](https://github.com/NousResearch/hermes-agent/blob/main/tui_gateway/methods_session.py) follows compression edges and exposes the resolved durable ID as `resumed` and/or `session_key`. A history ID may equal the stable owner or that explicitly mapped descendant; inconsistent resume mappings fail closed. A new runtime ID alone never authorizes a different history ID.

Processing is limited to eight message records and 65,536 characters per **user** message. User content must be a string; non-user payloads, including null or structured tool output, are never inspected. There is no recursive search or content coercion. Existing local gateway history captured through `.local/read-hermes-lightcraft.cjs` confirms numeric timestamp seconds and a chronological recent slice despite `order=latest`. With multiple user messages, the helper uses distinct finite numeric timestamps to select the latest independently of array order; missing or ambiguous timestamps fail closed. A single user message needs no timestamp.

Timeouts, errors, foreign ownership, unsupported response shapes, missing markers or a newer unrelated user request return `correlated:false` and a fixed safe `reason` without copying server errors or message text. `remoteRunning` remains `undefined` unless a valid owned resume response supplied a boolean. A known boolean may accompany failed history correlation so an explicit user review can park stopped uncertain work; it must never authorize automatic replay or completion.

`correlated:true,remoteRunning:true` means the marked remote request is still active, including when an old terminal event arrives. `correlated:true,remoteRunning:false` proves that the remote request ended. It does **not** verify the requested action's result: the helper returns no `verified`, success summary or assistant-derived evidence. Action verification remains a separate explicit observation.

Validation: `node --test tests/job-reconciliation.test.cjs tests/job-queue.test.cjs tests/gateway.test.cjs`. The helper tests were run red before implementation and cover delayed terminal events, runtime rekeying, proven compression descendants, exact user markers, newer requests, ignored non-user payloads, missing status, foreign ownership, ambiguous chronology, bounded formats, timeouts and private error text.

## API and transitions

All job-returning methods return detached full records for main-process use, or `null` when the ID/status does not match. Invalid caller input throws. Full records include private instructions and ownership and must never be passed directly to a renderer or generic log.

| Method | Behavior |
| --- | --- |
| `enqueue({text,title,sessionId,profile='default',appId=null,speak=true,turnId=null})` | Persists a queued job before returning it. Preserves exact instructions and original owner. Default title is `Auftrag bearbeiten`, with no instructions copied into it. |
| `claim({sessionId,profile='default'})` | Persists the oldest queued job for that exact owner as running. Returns `null` while held or while any job is running or outcome-unknown. Never switches an owner. |
| `accepted(id,{runtimeId})` | Records remote acceptance for that exact running job. |
| `finish(id,{status='agent-finished',summary='',verified=false})` | Settles that exact running job. Successful agent output is `agent-finished`; only an explicit `verified: true` yields `completed`. Known failure is `error`. Disconnect/timeout and interruption remain outcome-unknown. |
| `unknown(id,reason)` | Marks running/unknown work `outcome-unknown`, blocking dispatch globally, including jobs for unrelated owners. |
| `reconcile(id,{remoteRunning,verified=false,summary='',runtimeId})` | Requires an explicit boolean remote observation. Running remote work becomes running again, optionally attaching a runtime ID. Stopped remote work becomes completed only with verification; otherwise it becomes paused. |
| `cancel(id)` | Cancels queued, paused or failed local work. Running/unknown cancellation keeps the outcome-unknown gate until the remote stop/outcome is checked. |
| `retry(id)` | Deliberately requeues only paused/error work, preserving instructions and ownership but replacing the job ID and clearing remote acceptance. Cannot retry unknown, cancelled or completed work. |
| `pauseAll(reason)` / `resumeQueue()` | Persist/clear a queue-wide hold. Resume never clears an outcome-unknown gate. |
| `list()` | Returns safe job metadata in enqueue order. |
| `active()` | Returns the full current running/outcome-unknown record, or `null`. |
| `pending()` | Reports whether any queued work exists, even if dispatch is held/blocked. |
| `snapshot()` | Returns safe jobs and queue hold/gate metadata. |

Full schema version 1:

```text
id, text, sessionId, profile, appId, speak, turnId,
status, verified, runtimeId, attempts,
createdAt, updatedAt, startedAt, acceptedAt, finishedAt,
title, summary, reason
```

`turnId` is optional private voice timing correlation (up to 128 letters, numbers, `.`, `_`, `:`, `-`). Timestamps are nonnegative integer milliseconds; unset timestamps/remote IDs are `null`. `attempts` increases on claim. Statuses are `queued`, `running`, `outcome-unknown`, `paused`, `agent-finished`, `completed`, `error`, `cancelled`.

Safe `list()`, `snapshot()` and `onChange` projections omit `text`, `sessionId`, `runtimeId` and `turnId`, and redact titles, summaries and reasons using the context journal's credential/URL redactor. `snapshot()` is `{version:1,held,holdReason,blocked,activeJobId,jobs}`. `blocked` indicates unknown remote outcome; a running job also prevents claims even when `blocked` is false. Change callbacks run only after committed transitions, receive detached safe snapshots, and cannot undo persistence if the view throws.

## Persistence and recovery

Storage retains at most 50 records and instructions of at most 20,000 characters per job. At capacity, enqueue removes only the oldest settled history record; it rejects a full queue of unsettled jobs. It never silently drops queued, paused, running or unknown work. The local JSON file contains exact private instructions and session IDs; keep it out of source control and apply the local directory's normal user access restrictions.

Writes use an exclusively created sibling temporary file, content flush, and atomic rename. In-memory state and observers change only after replacement succeeds. A failed write throws, preserves the previous state, and cleans up the temporary file. This is a single-process queue; do not instantiate multiple writers for the same file.

On restart, stored running jobs are persisted as outcome-unknown before any dispatch is possible. Remote runtime ID and original owner remain available for inspection. No running or unknown job is replayed automatically. Persisted holds survive restarts.

The loader checks a bounded 8 MiB file, schema, statuses, ownership, input types/lengths, IDs, timestamps and transition invariants. Invalid/unreadable data is not loaded as work; the queue starts empty and held for explicit review. Rejected storage is not used to generate instructions. The constructor does not execute stored content.

Validation: `node --test tests/job-queue.test.cjs tests/context-journal.test.cjs tests/task-ledger.test.cjs`. Queue tests were run red before implementation and cover exact ownership, serial claims, unknown gates, restart recovery, deliberate retry/cancel, stale IDs, private projections, malformed data, capacity and failed atomic replacement.
