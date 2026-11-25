# The verdict comment

`team-evidence comment KEY` prints it from the manifest; post it with `team-board comment KEY "$(team-evidence comment KEY)"`.
Written as __OWNER__'s own note: no names, no signatures.

```
VERIFIED: MSC-12 at abc1234. Bar: V1+V4.
| tier | what ran | result | evidence |
| V1 | 3 scenarios through the real UI | 3/3 pass, 21 assertions | video, trace |
| V4 | CardHold.tla, 2 people x 2 cards | OneHolder holds (3,104 states); fails when the guard is removed; 412 real events conform | chart, TLC log |
PRs: #41 PASS, #42 PASS+NOTES (copy on empty state reads "No cards" not "Empty")
Not covered: native file drop (no OS driver); covered the upload button instead.
Page: http://127.0.0.1:4340/lorena/msc-12-evidence/
```
