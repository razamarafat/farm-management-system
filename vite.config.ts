import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
const appVersion = pkg.version || '1.1.3';

// Build identity: a fresh, unique value for every build so an open client can
// detect that a new deploy has landed. It is inlined into the bundle via
// `define` below AND written to dist/version.json for the client to compare.
const builtAt = new Date().toISOString();
const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api/auth-admin': {
        target: 'http://localhost:10000',
        changeOrigin: true,
      },
      '/api/export': {
        target: 'http://localhost:10001',
        changeOrigin: true,
      }
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile({
      removeViteModuleLoader: true,
    }),
    {
      name: 'emit-version-json',
      transformIndexHtml(html) {
        return html.replace(
          '</head>',
          `    <meta name="build-id" content="${buildId}" />\n    <meta name="build-time" content="${builtAt}" />\n    <meta name="app-version" content="${appVersion}" />\n  </head>`
        );
      },
      writeBundle(options) {
        const outDir = options.dir ?? path.resolve(__dirname, 'dist');
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(
          path.join(outDir, 'version.json'),
          JSON.stringify({ buildId, builtAt, version: appVersion }, null, 2),
        );
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  envPrefix: 'VITE_',
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(builtAt),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  build: {
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
