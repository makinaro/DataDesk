import { vi } from 'vitest';

export interface FakeRoute {
  status: number;
  headers?: Record<string, string>;
  body?: string | Uint8Array | ReadableStream<Uint8Array> | null;
}

/**
 * A scripted Hugging Face Hub: URL → response. Records each request's URL, Authorization header
 * and redirect mode, so tests can check where the token went. No network.
 */
export function fakeHub(routes: Record<string, FakeRoute | (() => FakeRoute)>) {
  const calls: { url: string; auth: string | null; redirect: RequestInit['redirect'] }[] = [];
  const fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({
      url,
      auth: new Headers(init?.headers).get('authorization'),
      redirect: init?.redirect,
    });
    const route = routes[url];
    const r =
      route === undefined
        ? { status: 404, headers: { 'x-error-code': 'EntryNotFound' }, body: 'Entry not found' }
        : typeof route === 'function'
          ? route()
          : route;
    return Promise.resolve(new Response(r.body ?? null, { status: r.status, headers: r.headers }));
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

/** A body that produces `chunk` forever (or until cancelled): a server that lies about size. */
export function endlessBody(chunk: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    pull(controller) {
      controller.enqueue(chunk);
    },
  });
}

/** A body that sends one chunk and then stalls until the reader gives up. */
export function stallingBody(first: Uint8Array): ReadableStream<Uint8Array> {
  let sent = false;
  return new ReadableStream({
    pull(controller) {
      if (!sent) {
        sent = true;
        controller.enqueue(first);
      }
      return new Promise(() => undefined);
    },
  });
}
