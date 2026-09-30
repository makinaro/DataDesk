/**
 * Automated tests must never reach a real network service (CLAUDE.md, Testing rules).
 * Any fetch or non-local socket connection fails loudly, telling the author to mock the client.
 */
import net from 'node:net';

export class NetworkAccessError extends Error {
  constructor(target: string) {
    super(
      `Network access is disabled in tests (attempted: ${target}). Inject or mock the client instead.`,
    );
    this.name = 'NetworkAccessError';
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function describeTarget(args: unknown[]): { local: boolean; target: string } {
  const [first, second] = args;
  // net.connect() normalizes its arguments into an array before calling socket.connect().
  if (Array.isArray(first)) return describeTarget(first);
  if (typeof first === 'object' && first !== null) {
    const opts = first as { path?: unknown; host?: unknown; port?: unknown };
    // Local IPC pipes (named pipes / unix sockets) are allowed.
    if (typeof opts.path === 'string') return { local: true, target: opts.path };
    const host = typeof opts.host === 'string' ? opts.host : 'localhost';
    return { local: LOCAL_HOSTS.has(host), target: `${host}:${String(opts.port)}` };
  }
  // A numeric string is a port (socket.connect('443', 'example.com')); any other string is a pipe path.
  if (typeof first === 'string' && !/^\d+$/.test(first)) return { local: true, target: first };
  const host = typeof second === 'string' ? second : 'localhost';
  return { local: LOCAL_HOSTS.has(host), target: `${host}:${String(first)}` };
}

globalThis.fetch = (input: string | URL | Request): Promise<Response> => {
  const url = input instanceof Request ? input.url : String(input);
  return Promise.reject(new NetworkAccessError(url));
};

type RawConnect = (this: net.Socket, ...args: unknown[]) => net.Socket;
const originalConnect = Object.getOwnPropertyDescriptor(net.Socket.prototype, 'connect')
  ?.value as RawConnect;

net.Socket.prototype.connect = function guardedConnect(
  this: net.Socket,
  ...args: unknown[]
): net.Socket {
  const { local, target } = describeTarget(args);
  if (!local) throw new NetworkAccessError(target);
  return originalConnect.apply(this, args);
};
