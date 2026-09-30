/**
 * IPC channel names. Kept free of zod so the sandboxed preload can import them without
 * bundling a validation library (validation happens in main).
 */
export const IpcChannels = {
  appInfo: 'app:info',
  secretsStatus: 'secrets:status',
  secretsSet: 'secrets:set',
  secretsClear: 'secrets:clear',
  datasetsList: 'datasets:list',
  datasetsRegister: 'datasets:register',
  datasetsPick: 'datasets:pick',
  datasetsSchema: 'datasets:schema',
  datasetsPreview: 'datasets:preview',
  agentSend: 'agent:send',
  agentStop: 'agent:stop',
  agentReset: 'agent:reset',
  agentApprove: 'agent:approve',
  settingsGetAgent: 'settings:getAgent',
  settingsSetAgent: 'settings:setAgent',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

/** Main → renderer push channels (webContents.send). Payloads are validated in main. */
export const IpcEvents = {
  agentEvent: 'agent:event',
} as const;
