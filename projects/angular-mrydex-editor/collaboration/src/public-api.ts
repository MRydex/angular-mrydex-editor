/*
 * Optional real-time collaboration ("Google Docs" mode) over SignalR + Yjs.
 * Needs the optional peer dependencies: yjs, y-protocols, @microsoft/signalr, @tiptap/y-tiptap,
 * @tiptap/extension-collaboration and @tiptap/extension-collaboration-caret.
 */

export { collaborationExtensions } from './collaboration-extensions';
export type { CollaborationUser } from './collaboration-extensions';
export { CollaborationSession } from './collaboration-session';
export type { CollaborationOptions, CollaborationStatus } from './collaboration-session';
export { CollaborationHubMethods } from './hub-contract';
export type { JoinResult } from './hub-contract';
