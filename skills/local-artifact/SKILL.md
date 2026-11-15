---
name: local-artifact
description: Publish an artifact (a web page, report, dashboard, visual explainer, MDX or Markdown document) on __OWNER__'s local artifacts server and give them the link. Use whenever __OWNER__ asks for an artifact / artefacto / page / visual report, or when a page would explain your result better than chat text. This REPLACES the built-in Artifact tool and claude.ai artifacts, which must not be used.
---

# Local artifacts

__OWNER__ reads your answers in the office chat, often on a phone. When something is better seen than read
(a report, a comparison, a dashboard, a diagram, a plan, a long document), publish it as an **artifact**: a page on
the local server on this Mac. __OWNER__ opens it with one tap, and deletes it when done with it.

**Never use the built-in `Artifact` tool or anything that publishes to claude.ai or another outside service.**
Artifacts live only on this machine.

## How to publish

1. Write the page in your own work folder (not in the store):
   - **A document** (report, plan, notes, comparison): one `.mdx` or `.md` file. The server renders it with a clean
     readable style, light and dark. Headings, tables, task lists, code blocks and links work. In `.mdx` you can also
     use JSX and small components you define in the file (rendered once, without client-side JavaScript).
   - **A web page** (dashboard, interactive view, custom design): one self-contained `.html` file, with its CSS and
     JavaScript inline. It must work on a phone: 16px side gutter, no horizontal scroll, readable at 390px wide,
     and in both light and dark (`prefers-color-scheme`).
   - **A small site**: a folder with `index.html` (or `index.mdx` / `index.md`) plus its images, scripts or further
     pages, linked with relative paths.
2. Publish it:

   ```
   team-artifact new <file-or-folder> --from <your Herdr name> --title "Short title"
   ```

   It prints the link, for example `http://127.0.0.1:4340/sara/short-title/`.
3. **Put the link in your answer as a markdown link**, on its own line:

   ```
   [Short title](http://127.0.0.1:4340/sara/short-title/)
   ```

   Always write the `http://127.0.0.1:4340/...` form exactly as printed. The office chat turns it into a button and
   makes it work from the phone too. Add one or two lines saying what the page shows; do not repeat its content in chat.

## Rules

- **Update, do not multiply.** Publishing again with the same `--from` and title (or `--slug`) replaces the page and
  keeps the link. Fix a page by republishing it, not by creating "v2".
- **A clear title** (it is what __OWNER__ sees in the list), in the language __OWNER__ is using with you. Max 140 characters.
- **No secrets** in a page: no tokens, keys, passwords or credentials, and no personal data that is not needed.
- **Self-contained.** Do not load scripts, fonts or data from outside services unless the page truly needs them;
  nothing in the page may send data anywhere.
- **Pages, not storage.** 60 MB max. Datasets, videos and evidence stay where they already live.
- **Only __OWNER__ deletes.** They remove pages from the office when done. `team-artifact rm <you>/<slug>` is
  only for taking down your own mistake. Never delete someone else's page.
- A page does not replace the short answer: say the outcome in chat first, then the link.

## Other commands

```
team-artifact ls [--from <name>]      what is published, with links
team-artifact path <owner>/<slug>     the published folder (to check what is there)
```

Each person's pages show in the office: a paper badge with the count on their desk and on their card, and a list
behind the page icon next to their name in the chat.
