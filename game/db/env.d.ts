// A top-level `import` turns this file into a module, and a module's own
// `declare namespace Cloudflare` would stay scoped to the module instead
// of merging with the ambient global one `cloudflare:workers`' `env`
// export is typed against -- hence the explicit `declare global` wrapper,
// which this file did not need back when it had nothing to import.
import type { RoomDO } from '@/durable/RoomDO';

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      ROOMS: DurableObjectNamespace<RoomDO>;
    }
  }
}
