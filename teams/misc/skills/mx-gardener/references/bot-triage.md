# Classifying a finding

| Class | When | What happens |
|---|---|---|
| fix | the smell is real, local and the fix is obvious | the item goes to the PR's author (Gonzalo) through the card |
| dismiss | the detector misfired, or the case is the legitimate exception (a legal header, an external-dependency quirk proven today) | recorded with the reason, so the next round does not raise it again |
| ask | security, auth, billing, data, migration, concurrency, or anything you are not sure of | a note to Inés; never decided by the gardener |

Confidence: `candidate` (first sighting), `recurring` (seen before in this repo), `strong` (seen twice and the
Rule-card condition is true). Judge each finding on its merits, as pstack's bugbot-triage says: a bot's say-so is
not evidence, a rerun is.
