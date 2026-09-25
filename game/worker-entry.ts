/** The actual Worker entry point deployed to Cloudflare -- `vite.config.ts`
 * points `main` here instead of straight at `vinext/server/app-router-entry`.
 *
 * Two things needed a home this project controls, not vinext's own entry
 * file:
 *
 * 1. The `RoomDO` export. `@cloudflare/vite-plugin` resolves a Durable
 *    Object binding's `class_name` (`RoomDO`, from `wrangler.jsonc`) by
 *    looking for a same-named export on whatever module `main` resolves
 *    to. `vinext/server/app-router-entry` only exports `default`, and it
 *    is a file inside the `vinext` package, not something this project
 *    can edit to add one.
 *
 * 2. The WebSocket upgrade itself. Confirmed empirically against
 *    `wrangler dev` (Phase F Stage 2): a request carrying
 *    `Upgrade: websocket` never reaches an `app/api/**\/route.ts` GET
 *    handler at all -- vinext's own request dispatch (the RSC/App Router
 *    layer inside the re-exported `default` below) rejects it before user
 *    code runs, with `Invalid URL: [object Request]`. Whatever internal
 *    routing step that layer does to the request does not expect one
 *    whose semantics are "upgrade this connection, there is no body to
 *    render a page from". Rather than fight that, the exact one path this
 *    matters for (`/api/rooms/<code>/socket`) is intercepted here, in
 *    front of Next.js entirely, and handed straight to `RoomDO` --
 *    everything else still flows through the re-exported `default`
 *    unchanged. `app/api/rooms/[code]/socket/route.ts` was deleted for
 *    exactly this reason: with the Upgrade header, it would never run. */
import appRouterHandler from 'vinext/server/app-router-entry';
import { openRoomSocket, RoomNotFoundError } from './lib/room-service';

export { RoomDO } from './durable/RoomDO';

const ROOM_SOCKET_PATH = /^\/api\/rooms\/([^/]+)\/socket$/;

type WorkerFetchArgs = Parameters<typeof appRouterHandler.fetch>;

const worker = {
  async fetch(request: WorkerFetchArgs[0], env: WorkerFetchArgs[1], ctx: WorkerFetchArgs[2]) {
    if (request.headers.get('Upgrade') === 'websocket') {
      const url = new URL(request.url);
      const match = ROOM_SOCKET_PATH.exec(url.pathname);
      if (match) {
        try {
          return await openRoomSocket(match[1], request);
        } catch (error) {
          const status = error instanceof RoomNotFoundError ? 404 : 400;
          return new Response(error instanceof Error ? error.message : 'Could not open the room.', { status });
        }
      }
    }
    return appRouterHandler.fetch(request, env, ctx);
  },
};

export default worker;
