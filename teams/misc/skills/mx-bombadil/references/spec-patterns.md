# Bombadil spec patterns

Operators: `always`, `eventually(...).within(n, "seconds")`, `now`, `next`, `.and` / `.or` / `.implies`; state
readers with `extract`; action generators `actions`, `weighted`, `.map` / `.flatMap` / `.when`. Check the exact API
against the pinned version's manual (https://github.com/antithesishq/bombadil, `docs/manual/src/03-specification-language.md`).

```ts
import { extract, always, now, eventually } from "@antithesishq/bombadil";
export * from "@antithesishq/bombadil/browser/defaults";

// claim: an error banner never stays up for more than 5 seconds
const errorMessage = extract(s => s.document.body.querySelector("[role=alert]")?.textContent ?? null);
export const errorDisappears = always(
  now(() => errorMessage.current !== null).implies(
    eventually(() => errorMessage.current === null).within(5, "seconds")));

// claim: the Done column count always equals the number of cards in it
const doneCount = extract(s => Number(s.document.querySelector("[data-col=Done] .count")?.textContent ?? "NaN"));
const doneCards = extract(s => s.document.querySelectorAll("[data-col=Done] [data-card]").length);
export const doneCountMatches = always(now(() => doneCount.current === doneCards.current));

// claim: a busy spinner is never shown forever ("it got stuck")
const busy = extract(s => !!s.document.querySelector("[aria-busy=true]"));
export const notStuck = always(now(() => busy.current).implies(eventually(() => !busy.current).within(10, "seconds")));
```

Name each exported property after the claim it checks, so a violation reads as the claim that broke.
