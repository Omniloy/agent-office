# Conformance: does the code do what the model says?

A model can describe an idealized system the code does not implement. Conformance ties them together. One of:

1. **Trace replay.** Make the real code emit JSONL events that match the model's actions (`{"action": "hold",
   "card": "MSC-3", "who": "lorena", "ts": ...}`); collect a real log (for our own tools: `team-card` history,
   `routines/log.jsonl`, `board/board.json` snapshots). A small replay script feeds each event to the model's
   action predicate (a TLC trace-validation spec that loads the trace as a constant, or a hand-written checker that
   applies the same guards) and fails on the first event the model forbids.
2. **A mirror model test.** A fast-check `fc.commands` model that mirrors the spec's actions, driven against the
   real code, checking the same invariants after each command.

Run it as `team-evidence run KEY --kind conformance --claim N --tier V4 -- <replay command>` and say in claim.md how
many real events were replayed. Also break the replay once (feed it a forbidden event) so it is shown to fail.
