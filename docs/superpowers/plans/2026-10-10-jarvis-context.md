# Ausführung: Lilith-Kontext und zuverlässige Aufgaben

Spec: ../specs/2026-10-10-jarvis-context-design.md

1. `context-journal.cjs`, `context-observer.cjs`, `scripts/foreground_context.ps1`:
   bounded atomic event metadata, explicit project, foreground exclusions, opt-in
   incremental log watcher. Red/green tests use real temporary files.
2. `task-ledger.cjs`, `routines.cjs`: genuine lifecycle/evidence distinction and
   named instructions with required success criteria. Red/green tests include
   misleading acceptance, late tool results and malformed stored data.
3. `local-safety.cjs`, `ui/app.js`: synchronous privacy gate, explicit unlock,
   immediate local stop, offline wake. Red/green renderer/policy tests.
4. `main.cjs`, `control-api.cjs`, `control.ps1`, `preload.cjs`: wire task events,
   optional context prompt, project/settings management, observers, safe local
   controls and narrow read-only context/task/routine routes. Test API auth,
   stop bypassing pending controls, locked capture and late async results.
5. `workbench.cjs`, `ui/workbench.*`, `ui/workstation.js`, `ui/index.html`:
   visible context/tasks/routines controls in existing style; user-owned log
   selection and required criterion. Browser remains isolated from IPC.
6. Review focused implementation; run Node/Python suites and native Electron
   smoke; correct findings, restart normally and inspect authenticated status.

All changes stay in the current shared checkout to preserve existing uncommitted
app work. No unrelated Git staging, destructive PC actions or guessed success.
