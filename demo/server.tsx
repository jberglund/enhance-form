import { Hono } from "hono";
import { jsxRenderer } from "hono/jsx-renderer";
import sampleForm from "./sample-form";

const app = new Hono();

// ---------------------------------------------------------------------------
// Layout renderer (used by c.render() in form handlers)
// ---------------------------------------------------------------------------

app.use(
  "*",
  jsxRenderer(({ children }) => (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>enhance-form Demo</title>
        <script type="module" src="/enhance-form.js" />
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  )),
);

// ---------------------------------------------------------------------------
// Serve the enhance-form client script (transpiled from TypeScript)
// ---------------------------------------------------------------------------

app.get("/enhance-form.js", async (c) => {
  const filepath = import.meta.dir + "/../src/index.ts";
  const file = Bun.file(filepath);

  if (!(await file.exists())) {
    return c.notFound();
  }

  const transpiled = await Bun.build({
    entrypoints: [filepath],
    target: "browser",
    minify: false,
    sourcemap: "inline",
  });

  return c.body(await transpiled.outputs[0].text(), 200, {
    "Content-Type": "application/javascript; charset=utf-8",
  });
});

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

app.get("/", (c) =>
  c.render(
    <div>
      <h1>enhance-form Demo</h1>
      <p>
        A progressively enhanced form powered by{" "}
        <code>&lt;enhance-form&gt;</code>, Hono JSX, and Zod.
      </p>
      <ul>
        <li>
          <a href="/dietary-form">RSVP Form</a> — per-field validation,
          checkboxes, date input
        </li>
      </ul>
    </div>,
  ),
);

// ---------------------------------------------------------------------------
// Mount form apps
// ---------------------------------------------------------------------------

app.route("/", sampleForm);

// ---------------------------------------------------------------------------
// Start with Bun's native server
// ---------------------------------------------------------------------------

export default {
  port: 3000,
  fetch: app.fetch,
};

console.log("\n  enhance-form demo → http://localhost:3000\n");