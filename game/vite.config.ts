import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        // Passed inline (not auto-read from wrangler.jsonc) because letting
        // @cloudflare/vite-plugin@1.37.1 discover the config file itself
        // breaks CSS resolution during `vinext build` (postcss-import fails
        // to find the `tailwindcss` package). Only `main` lives here.
        // compatibility_flags and bindings (D1, etc.) are NOT duplicated —
        // they're read from wrangler.jsonc, which is merged in automatically
        // alongside this inline config. Duplicating a value in both places
        // causes "specified multiple times" / "assigned to multiple
        // bindings" errors at deploy time.
        //
        // `main` points at this project's own `worker-entry.ts` rather than
        // straight at `vinext/server/app-router-entry`: the Durable Object
        // binding for the RoomDO class (wrangler.jsonc) needs a same-named
        // export on whatever `main` resolves to, and vinext's own entry
        // file can't be edited to add one. `worker-entry.ts` re-exports
        // vinext's fetch handler unchanged and adds `RoomDO` alongside it.
        config: {
          main: './worker-entry.ts',
        },
      }),
    ],
  };
});
