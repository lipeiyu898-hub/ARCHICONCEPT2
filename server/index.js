import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { config } from "./config.js";
import { apiRouter } from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const app = express();

app.use(express.json({ limit: "8mb" }));
app.use("/api", apiRouter);

if (config.nodeEnv === "production") {
  app.use(express.static(path.join(root, "dist")));
  app.use((_req, res) => res.sendFile(path.join(root, "dist", "index.html")));
} else {
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}

app.listen(config.port, "0.0.0.0", () => {
  console.log(`ARCHICONCEPT server running at http://localhost:${config.port}`);
});
