import { HttpTransportType, HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';

/**
 * Connection to the collaboration hub. WebSockets only (no long polling fallback) and without negotiation: one
 * round trip less and no sticky sessions. The token goes as `?access_token=` (browsers cannot set headers on a
 * WebSocket): the server must read it from there and keep it out of its logs. A dropped connection retries forever.
 */
export function createHubConnection(
  url: string,
  accessToken: () => string | Promise<string>,
  logLevel: LogLevel,
): HubConnection {
  return new HubConnectionBuilder()
    .withUrl(url, { transport: HttpTransportType.WebSockets, skipNegotiation: true, accessTokenFactory: accessToken })
    .withAutomaticReconnect({
      nextRetryDelayInMilliseconds: ({ previousRetryCount }) => Math.min(30_000, 1_000 * 2 ** previousRetryCount),
    })
    .configureLogging(logLevel)
    .build();
}
