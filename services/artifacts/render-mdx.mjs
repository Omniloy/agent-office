// Renders one .mdx document to HTML for server.mjs, in its own short-lived process. An .mdx file is a program (JSX,
// `export const` components, `{…}` expressions), written by an agent: server.mjs starts this file with Node's
// permission model (it may read only this app and the document's own folder; no writing, no child processes, no
// workers), an empty environment and a time limit, so a document can neither read other files nor hang the server.
//   node --permission --allow-fs-read=<app> --allow-fs-read=<doc folder> render-mdx.mjs <file.mdx>
// stdout: {"html": "..."} or {"error": "..."}
import fs from 'node:fs/promises';
import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import remarkGfm from 'remark-gfm';

const file = process.argv[2];
try {
  const src = await fs.readFile(file, 'utf8');
  const mod = await evaluate(src, { ...runtime, remarkPlugins: [remarkGfm], format: 'mdx', baseUrl: `file://${file}` });
  process.stdout.write(JSON.stringify({ html: renderToStaticMarkup(runtime.jsx(mod.default, {})) }));
} catch (e) {
  process.stdout.write(JSON.stringify({ error: String((e && e.message) || e).slice(0, 2000) }));
}
