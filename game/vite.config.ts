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
        // to find the `tailwindcss` package). Bindings (D1, etc.) are NOT
        // duplicated here — they're read from wrangler.jsonc, which is
        // merged in automatically alongside this inline config. Duplicating
        // a binding in both places causes "assigned to multiple bindings"
        // errors at deploy time.
        config: {
          main: 'vinext/server/app-router-entry',
          compatibility_flags: ['nodejs_compat'],
        },
      }),
    ],
  };
});
