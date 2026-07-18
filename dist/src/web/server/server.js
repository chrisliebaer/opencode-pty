import { routes } from "../shared/routes.js";
import { CallbackManager } from "./callback-manager.js";
import { handleHealth } from "./handlers/health.js";
import { cleanupSession, clearSessions, createSession, getPlainBuffer, getRawBuffer, getSession, getSessions, killSession, sendInput, } from "./handlers/sessions.js";
import { buildStaticRoutes } from "./handlers/static.js";
import { handleUpgrade } from "./handlers/upgrade.js";
import { handleWebSocketMessage } from "./handlers/websocket.js";
export class PTYServer {
    server;
    staticRoutes;
    stack = new DisposableStack();
    constructor(staticRoutes) {
        this.staticRoutes = staticRoutes;
        this.server = this.startWebServer();
        this.stack.use(this.server);
        this.stack.use(new CallbackManager(this.server));
    }
    [Symbol.dispose]() {
        this.stack.dispose();
    }
    static async createServer() {
        const staticRoutes = await buildStaticRoutes();
        return new PTYServer(staticRoutes);
    }
    startWebServer() {
        return Bun.serve({
            port: process.env.PTY_WEB_PORT ? parseInt(process.env.PTY_WEB_PORT, 10) : 0,
            hostname: process.env.PTY_WEB_HOSTNAME ?? '::1',
            routes: {
                ...this.staticRoutes,
                [routes.websocket.path]: (req) => handleUpgrade(this.server, req),
                [routes.health.path]: () => handleHealth(this.server),
                [routes.sessions.path]: {
                    GET: getSessions,
                    POST: createSession,
                    DELETE: clearSessions,
                },
                [routes.session.path]: {
                    GET: getSession,
                    DELETE: killSession,
                },
                [routes.session.cleanup.path]: {
                    DELETE: cleanupSession,
                },
                [routes.session.input.path]: {
                    POST: sendInput,
                },
                [routes.session.buffer.raw.path]: {
                    GET: getRawBuffer,
                },
                [routes.session.buffer.plain.path]: {
                    GET: getPlainBuffer,
                },
            },
            websocket: {
                data: undefined,
                perMessageDeflate: true,
                open: (ws) => ws.subscribe('sessions:update'),
                message: handleWebSocketMessage,
                close: (ws) => {
                    ws.subscriptions.forEach((topic) => {
                        ws.unsubscribe(topic);
                    });
                },
            },
            fetch: () => new Response(null, { status: 302, headers: { Location: '/index.html' } }),
        });
    }
    getWsUrl() {
        return `${this.server.url.origin.replace(/^http/, 'ws')}${routes.websocket.path}`;
    }
}
//# sourceMappingURL=server.js.map