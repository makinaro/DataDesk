---
name: add-ipc-channel
description: Add a new typed IPC channel between the renderer and the Electron main process (zod contract → validated main handler → explicit preload method → renderer usage → tests). Use whenever the renderer needs a new capability from main.
argument-hint: '[channel:name] [short purpose]'
---

# Add an IPC channel

Every renderer → main call goes through one zod contract. Follow these steps in order. Skipping
one is a type error, a failing test, or a security hole.

Arguments: `$ARGUMENTS` (e.g. `datasets:list "list registered datasets"`).

## 1. Name it

- Format `domain:verb` (e.g. `datasets:list`, `agent:send`). Add it to
  `src/shared/ipc/channels.ts` → `IpcChannels` with a camelCase key.

## 2. Contract (`src/shared/ipc/contract.ts`)

- Add `[IpcChannels.x]: { request, response }` to `ipcContract`.
- Use `z.strictObject` (extra keys rejected). Use `z.undefined()` for no payload.
- Bound every string and array (`.max(...)`). The renderer is untrusted input.
- Export `type X = z.infer<typeof XSchema>` for any shape the renderer displays.
- **Never** put a secret in a response schema. Secrets status is booleans only.

## 3. API type (`src/shared/ipc/api.ts`)

- Add the method to `DatadeskApi` under the right namespace, returning `Promise<IpcResult<T>>`.

## 4. Main handler (`src/main/ipc/handlers/<domain>.ts`)

- `export function register<Domain>Handlers(handle: IpcHandle, deps…)`.
- `handle(IpcChannels.x, async (request) => …)`: the router has already validated the request.
- Throw `IpcUserError(code, message)` for user-facing failures. Anything else becomes `INTERNAL`.
- Call the register function from `src/main/index.ts`.

## 5. Preload (`src/preload/index.ts`)

- Add an explicit method: `x: (arg) => invoke(IpcChannels.x, { arg })`.
- Only `import type` from `contract.ts`, never a value import (it would bundle zod into the
  sandboxed preload).
- Never expose `ipcRenderer`, `invoke`, `send` or `on` generically.

## 6. Renderer

- Call via `useApi().<ns>.<method>()` and handle both `result.ok` branches.
- Add the method to `tests/renderer/fakeApi.ts`.

## 7. Tests (all required)

- `tests/shared/ipc/contract.test.ts`: valid payload accepted; malformed/extra-key/oversized rejected.
- `tests/main/ipc/handlers/<domain>.test.ts`: handler behaviour through `createIpcRouter` with a
  fake `ipcMain` (see `tests/main/ipc/handlers/secrets.test.ts`).
- `tests/preload/index.test.ts`: update the exact namespace/method lists and the channel mapping.
- `tests/e2e/ipc.spec.ts`: update the whitelisted bridge shape.
- Renderer component test if UI uses it.

## 8. Finish

- `npm run check` must pass, and `npm run test:e2e` too if the bridge shape changed.
- Commit: `feat(ipc): add <channel> …`.

## Security checklist

- [ ] Request schema is strict and bounded
- [ ] Response can't carry secrets
- [ ] Handler doesn't trust renderer-supplied paths without validating them (resolve, then check the allowed root)
- [ ] Errors don't echo input values
