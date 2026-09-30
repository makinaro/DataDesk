import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { NetworkAccessError } from './no-network';

describe('network guard', () => {
  it('rejects fetch to any URL', async () => {
    await expect(fetch('https://api.anthropic.com/v1/messages')).rejects.toBeInstanceOf(
      NetworkAccessError,
    );
  });

  it('rejects raw sockets to remote hosts', () => {
    expect(() => net.connect({ host: 'example.com', port: 443 })).toThrow(NetworkAccessError);
  });

  it('allows localhost sockets (used by local test servers)', () => {
    const server = net.createServer();
    return new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address === null || typeof address === 'string') {
          reject(new Error('unexpected address'));
          return;
        }
        const socket = net.connect({ host: '127.0.0.1', port: address.port }, () => {
          socket.destroy();
          server.close(() => {
            resolve();
          });
        });
      });
    });
  });
});
