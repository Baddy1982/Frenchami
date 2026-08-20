import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  appType: "custom",
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true },
});

try {
  await server.ssrLoadModule("/src/lib/learning-cache.test.ts");
} finally {
  await server.close();
}