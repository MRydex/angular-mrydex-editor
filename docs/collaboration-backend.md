# Real-time collaborative editing: backend contract

This document is for whoever implements the hub in .NET. It describes what the server must do so that
`angular-mrydex-editor` works like Google Docs: several users edit the same document at the same time, see each
other's cursors, and do not overwrite each other.

The editor works as it always has if you do not use collaboration (it loads and saves HTML through the usual REST
endpoints). This document covers only the collaborative mode.

## Table of contents

1. [Summary in 30 seconds](#1-summary-in-30-seconds)
2. [Why this way (and not "send the HTML over the socket")](#2-why-this-way)
3. [Architecture](#3-architecture)
4. [Hub contract](#4-hub-contract)
5. [Flows](#5-flows)
6. [Persistence](#6-persistence)
7. [Security (mandatory)](#7-security-mandatory)
8. [Configuration](#8-configuration)
9. [Scaling: one instance or several](#9-scaling-one-instance-or-several)
10. [Reference implementation (C#)](#10-reference-implementation-c)
11. [Acceptance tests](#11-acceptance-tests)
12. [Open questions](#12-open-questions)

---

## 1. Summary in 30 seconds

- A new **SignalR hub**, for example at `/api/hubs/editor`, **with JWT** (no `AllowAnonymous`).
- The server **does not understand the content**: it stores and forwards binary blobs ([Yjs](https://yjs.dev)
  updates, sent as base64 and received as `byte[]`). It never merges or interprets them.
- One new table: `CollaborativeDocumentUpdate` (append-only, `VARBINARY(MAX)`).
- Every few seconds the front end also sends the **current HTML** (`SaveHtml`). This way the rest of the system
  (printing, signing, search, listings) keeps reading HTML as usual.
- For documents that already exist as HTML, the server picks **one single client** to "seed" the collaborative
  document from that HTML (seed lock).
- When the updates table grows, the server asks one client to **compact** it (replace N rows with one).

The setup is the same as any SignalR hub with per-resource groups (`Groups`, `OnDisconnectedAsync`, an enable flag
in `appsettings`). What is specific here is update persistence, seeding and per-document authorization.

## 2. Why this way

The naive option (each client sends the full HTML and the last one wins) loses text as soon as two people type at the
same time: A types in paragraph 1, B in paragraph 3, and B's HTML overwrites A's.

Yjs is a **CRDT**: each change is encoded so that any client, applying the same changes in any order and even if they
arrive repeated, ends up with exactly the same document. What this means for the backend:

| Property | What it means for the server |
|---|---|
| Commutative | The order in which you store or forward updates does not matter. |
| Idempotent | Sending an update twice breaks nothing. When in doubt, send more. |
| Merge on the client | The server does not need Yjs or any library: it stores `byte[]` and forwards them. |
| Offline | A client that disconnects keeps editing. When it comes back it sends what is missing and converges on its own. |

The Yjs binary format is stable and documented. You do not need to parse it. If the backend ever needs to read the
document without a browser (for example, to generate the HTML on the server),
[YDotNet](https://github.com/LSViana/ydotnet) exists, but it is **not needed** for this version: the front end sends
the HTML.

## 3. Architecture

```
 Browser A ─┐                         ┌──────────────── API ─────────────────┐
 Browser B ─┼── wss ── Proxy ───────▶ │ EditorHub (SignalR)                  │
 Browser C ─┘   (optional)            │  ├─ group per document               │
                                      │  ├─ CollaborationRooms (memory):     │
                                      │  │   members + seed lock             │
                                      │  └─ ICollaborativeDocumentRepository │
                                      └──────────────┬──────────────────────┘
                                                     │
                                 ┌───────────────────┴───────────────────┐
                                 │ CollaborativeDocumentUpdate (updates) │
                                 │ Domain table (HTML, as today)         │
                                 └───────────────────────────────────────┘
```

- Transport: **WebSockets only**, with no negotiation (`skipNegotiation`). There is no long polling and no
  `/negotiate`, so sticky sessions are not needed.
- The front end reconnects on its own (exponential backoff up to 30 s, forever) and calls `Join` again on every
  reconnection. For the server, each reconnection is a new connection (new `ConnectionId`, empty `Context.Items`).

## 4. Hub contract

Source of truth in the front end: `projects/angular-mrydex-editor/collaboration/src/hub-contract.ts`. Names must
match 1:1. SignalR JSON protocol (the default): properties travel in camelCase and `byte[]` travels as a base64
string, with nothing for you to do.

### 4.1 Client → server

| Method | How the front end calls it | Arguments | Returns | Rules |
|---|---|---|---|---|
| `Join` | `invoke` | `documentId: string`, `clientId: long` | `JoinResult` | Once per connection. Validates access to the document. See [5.1](#51-joining-join). |
| `SendUpdate` | `invoke` | `update: byte[]` | — | Requires a previous `Join` and edit permission. Persist **before** forwarding. |
| `SendAwareness` | `send` (no response) | `update: byte[]` | — | Requires `Join`. Not persisted: only forwarded to the group. |
| `Compact` | `invoke` | `state: byte[]` | — | Requires edit permission. Deletes **the rows this connection received in its `Join`** and stores `state`. |
| `SaveHtml` | `send` | `html: string` | — | Requires edit permission. Updates the document's HTML. |

`clientId` is the client's internal Yjs id (a random 32-bit integer, different for each tab). It is used only to
announce arrivals and departures on the cursor. It does **not** identify the user. The user always comes from the
JWT.

### 4.2 Server → client

| Event | Payload | When |
|---|---|---|
| `ReceiveUpdate` | `update: byte[]` | Another client sent a `SendUpdate` (to `OthersInGroup`). |
| `ReceiveAwareness` | `update: byte[]` | Another client sent a `SendAwareness` (to `OthersInGroup`). |
| `PeerJoined` | `clientId: long` | Someone joined (to `OthersInGroup`). The front end replies by sending its cursor. |
| `PeerLeft` | `clientId: long` | Someone disconnected (to `OthersInGroup`). The front end removes their cursor immediately. |
| `SeedRequested` | `html: string` | The client that was seeding left before finishing: now this one seeds. |

### 4.3 `JoinResult`

```csharp
public sealed record JoinResult(
    IReadOnlyList<byte[]> Updates, // All stored updates of the document, in any order. Empty if it was never opened in collaboration.
    bool CanEdit,                  // The user can edit. If false, the front end stays read-only.
    string? SeedHtml,              // HTML to seed with. Only for the client that won the seed lock; null for the rest.
    bool Seeding,                  // Another client is seeding: this one waits for its first update before enabling editing.
    bool Compact);                 // There are too many rows: after syncing, this client must call Compact.
```

### 4.4 Errors

Any rejection is a `HubException` with a message for the user (no internal details). The front end receives it as a
rejection of the `invoke`:

| Case | Response |
|---|---|
| No access to the document / document does not exist / `documentId` has an invalid format | `HubException` in `Join`. The front end does not enable editing. |
| `SendUpdate`, `Compact` or `SaveHtml` without a previous `Join` or without edit permission | `HubException`. |
| Update or message over the maximum size | `HubException` (and SignalR drops the connection if it exceeds `MaximumReceiveMessageSize`). |
| Collaboration disabled by configuration | `HubException` in `Join`. The app can fall back to normal mode (HTML over REST). |
| Error while persisting an update | Let the `invoke` fail (do not forward to the group). The front end calls `Join` again and resends what is missing. |

## 5. Flows

### 5.1 Joining (`Join`)

1. Validate the `documentId` format (see [7.3](#73-per-document-authorization)) and that the connection does not
   already have a document.
2. Resolve the permission of the JWT user on that document: `None` → `HubException`; `Read` or `Edit`.
3. Store the document and the permission in `Context.Items`.
4. **First** add the connection to the document group, **then** read the updates. This way an update that arrives in
   between is received twice (harmless) and never zero times.
5. Read all the document's updates. Store their `Id`s in `Context.Items` (`Compact` uses them).
6. If there are no updates and the document has stored HTML, resolve seeding ([5.4](#54-seeding-documents-that-already-exist-as-html)).
7. Register the member in the room (`clientId`, `ConnectionId`, whether they can edit).
8. Announce `PeerJoined(clientId)` to the rest of the group.
9. Return `JoinResult` (with `Compact = CanEdit && rows > threshold`).

With the response, the front end: applies the updates, sends with `SendUpdate` whatever it has locally that the
server did not have (edits made offline), compacts if asked to, and only then enables editing.

### 5.2 Editing

1. The front end batches ~50 ms of keystrokes into a single update and calls `SendUpdate`.
2. The server validates, **persists**, and only then forwards to `OthersInGroup`. If persisting fails, it does not
   forward and returns an error.
3. Cursors (`SendAwareness`) are forwarded without persisting. They are small and frequent (every cursor movement).

### 5.3 Reconnection and offline edits

Nothing special is required: each reconnection is a new `Join`. The front end compares what it has with what the
server returned and sends the difference. If another client compacted in the meantime, it also works (the compacted
state contains everything).

### 5.4 Seeding (documents that already exist as HTML)

The collaborative document starts empty. If the document already had stored HTML, **one single** client converts it
(the front end parses it with the editor schema) and sends it as the first update. If two did it, the content would
be duplicated (Yjs merges the two "initial texts").

Lock rule (in `Join`, when there are no updates and there is HTML):

| Situation | Result |
|---|---|
| Nobody holds the lock (or whoever held it is no longer connected) and the user can edit | Takes the lock: `SeedHtml = html`. |
| Another connected client holds the lock, or the user is read-only | `Seeding = true`: waits for the first update. |

- The lock is released with the **first `SendUpdate`** stored for that document.
- If the lock owner disconnects without having sent anything, in `OnDisconnectedAsync` the lock is passed to another
  member with edit permission, and that member gets `SeedRequested(html)`. If none is left, the lock stays free and
  the next editor to join takes it.
- If the front end receives `SeedRequested` but already has content (rare case: the server lost its rows), it resends
  its state instead of seeding. The backend does not need to do anything.

### 5.5 Compaction

Each update is a row. A document edited for hours can have thousands. When a `Join` finds more rows than the
threshold (suggested: 200), it returns `Compact = true` and that client sends the full state with `Compact(state)`.

The server deletes **exactly the `Id`s it returned to that connection in its `Join`** (stored in `Context.Items`) and
inserts `state`, in one transaction. Do **not** use `DELETE ... WHERE Id <= @maxId`: with `IDENTITY`, an `INSERT`
that commits late can have a lower `Id` than another one that is already visible, and it would be deleted without
being included in the state (data loss). If two clients compact at the same time, nothing bad happens: each deletes
its own rows, and the new rows are idempotent with each other.

> Privacy: Yjs keeps deleted text in the old rows until they are compacted. In legal documents, keep this in mind
> (see [12](#12-open-questions)).

### 5.6 HTML (`SaveHtml`)

- The front end sends the HTML 3 s after the last local edit, and also when the tab closes.
- Last to arrive wins. It is an autosave for the rest of the system. **The real content is the Yjs content.**
- The "official" save (Save, Send, Sign buttons) can keep going through the usual REST endpoint with the editor's
  HTML.
- **Important rule**: if anything changes a document's HTML **outside the collaborative editor** (a process, a new
  template, another system), you must **delete its rows from `CollaborativeDocumentUpdate`**. Otherwise, the next
  time someone opens it, Yjs shows the old version and the external change is lost. Deleting the rows forces a new
  seed from the HTML.

### 5.7 Leaving

`OnDisconnectedAsync`: remove the member from the room, reassign the seed lock if needed
([5.4](#54-seeding-documents-that-already-exist-as-html)), and announce `PeerLeft(clientId)` to the group. SignalR
removes the connection from the groups on its own.

## 6. Persistence

```sql
CREATE TABLE dbo.CollaborativeDocumentUpdate (
    Id          BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CollaborativeDocumentUpdate PRIMARY KEY,
    DocumentId VARCHAR(100)   NOT NULL, -- the same id the front end sends, already validated (e.g. 'contrato_123')
    Data        VARBINARY(MAX) NOT NULL, -- Yjs update, opaque
    UserId   INT            NOT NULL, -- from the JWT, for auditing
    CreatedAt    DATETIME2(3)   NOT NULL CONSTRAINT DF_CollaborativeDocumentUpdate_CreadoEn DEFAULT SYSUTCDATETIME()
);

CREATE INDEX IX_CollaborativeDocumentUpdate_DocumentoId ON dbo.CollaborativeDocumentUpdate (DocumentId, Id);
```

Queries:

```sql
-- Join
SELECT Id, Data FROM dbo.CollaborativeDocumentUpdate WHERE DocumentId = @DocumentId;

-- SendUpdate
INSERT INTO dbo.CollaborativeDocumentUpdate (DocumentId, Data, UserId) VALUES (@DocumentId, @Data, @UserId);

-- Compact (in one transaction). @Ids as JSON ('[1,2,3]'): avoids the SQL Server 2100-parameter limit
-- that you hit if Dapper expands a large list into IN (@Ids).
DELETE FROM dbo.CollaborativeDocumentUpdate
WHERE DocumentId = @DocumentId AND Id IN (SELECT CAST(value AS BIGINT) FROM OPENJSON(@Ids));
INSERT INTO dbo.CollaborativeDocumentUpdate (DocumentId, Data, UserId) VALUES (@DocumentId, @State, @UserId);
```

The HTML stays in the domain table (the contract table, the note table, etc.), as today. `SaveHtml` runs the same
`UPDATE` as the REST save endpoint.

Reference sizes: a typing update weighs tens of bytes. Pasting a large document, hundreds of KB. The compacted state
of a 20-page document is on the order of 100–300 KB.

## 7. Security (mandatory)

### 7.1 Authentication

- The hub carries `[Authorize]` and is covered by the `FallbackPolicy` (the app role). **Never** `AllowAnonymous`,
  and never identify the user with data the client sends (query string, method argument). The user comes **only**
  from the JWT claims.
- The browser cannot send headers on a WebSocket: SignalR sends the token as `?access_token=...`. You must read it in
  `JwtBearerEvents.OnMessageReceived`, **only for the hub route** (see [10.4](#104-programcs)).
- `CloseOnAuthenticationExpiration = true` when mapping the hub: when the token expires, the server drops the
  connection and the front end reconnects asking for a new token (`accessTokenFactory` is called on every
  connection).

### 7.2 The token travels in the URL: keep it out of the logs

Anything that logs the full URL will store valid JWTs:

- Middleware that logs `Request.QueryString` (in a proxy or in the backend): redact `access_token` or do not log the
  query of `/api/hubs/*`.
- Web server logs (in IIS, `cs-uri-query` is enabled by default) and logs of any intermediate proxy or WAF.
- Application Insights / OpenTelemetry: filter `access_token` out of the request URL.

### 7.3 Per-document authorization

- In `Join`, validate the `documentId` format with a strict regex (e.g. `^(contract|note)_[0-9]{1,10}$`), split
  prefix and id, and check against the database that **this user** can see the document and whether they can edit it
  (same rules as the REST endpoint that returns that document today). Without this, anyone with a valid token can
  open any document by changing the number.
- `documentId` is **never** used to build SQL or table names: always as a parameter.
- One connection, one document: a second `Join` with another id is rejected. All other methods use the document
  stored in `Context.Items`, never one sent by the client.
- `SendUpdate`, `Compact` and `SaveHtml` require edit permission **on the server**. The front end goes read-only, but
  that is cosmetic.
- If the document moves to a non-editable state (sent, signed), the permission must return `Read` from that moment
  on (and, if you want to cut off those already inside, store their connections and abort them).

### 7.4 Limits (DoS)

| Limit | Suggested value | Where |
|---|---|---|
| Hub `MaximumReceiveMessageSize` | 2 MB (the 32 KB default is not enough for a large paste or a `Compact`) | `AddHubOptions<EditorHub>` |
| Size of one update | 1 MB | `SendUpdate` |
| Size of the compacted state | 2 MB | `Compact` |
| Size of one awareness message | 16 KB | `SendAwareness` |
| HTML size | The same as the REST save endpoint | `SaveHtml` |
| Messages per second per connection | ~50 (optional, with a counter in `Context.Items`) | all |

### 7.5 Content

- The HTML in `SaveHtml` is user input, just like the REST endpoint's: apply exactly the same treatment (allowlist
  sanitization on save or on display). The allowlist must include what the editor generates: `contenteditable`;
  `class` (`read-only-block`, `editable-field`); `style` with `font-size`, `font-family`, `line-height`, `text-align`
  and `margin-left`; `target`/`rel` on links; `colspan`/`rowspan`/`colwidth` on tables.
- Yjs updates and awareness messages are opaque: the server does not parse them, it only limits their size. The name
  and color shown on the cursor are declared by each client (the front end sanitizes the color and renders the name
  as text, without HTML).
- Do not log payloads (neither updates nor HTML): only document, user and size.

### 7.6 Transport

- `wss://` only (TLS). The front end has no fallback to `ws://`.
- Cross-site WebSocket hijacking does not apply: authentication is by token in the URL, not by cookies.
- The hub must be excluded from middleware that captures or rewrites the response body (it breaks SignalR
  streaming).

## 8. Configuration

```json
"Collaboration": {
  "Enabled": true,          // false: Join rejects and the app uses normal mode (HTML over REST)
  "CompactionThreshold": 200,
  "MaxBytesUpdate": 1048576,
  "MaxBytesState": 2097152,
  "MaxBytesAwareness": 16384
}
```

Read with `IOptionsMonitor<CollaborationOptions>` so you can turn it off without a restart.

Keep-alive: SignalR sends a ping every `KeepAliveInterval` (default 15 s) and considers a connection dead if it says
nothing within `ClientTimeoutInterval` (default 30 s). The defaults work. If the gateway or the load balancer drops
idle connections, its timeout must be greater than 15 s.

## 9. Scaling: one instance or several

| | One instance | Several instances (farm, containers) |
|---|---|---|
| Groups and forwarding | SignalR in memory | **Backplane** (Redis or Azure SignalR Service): otherwise A and B on different servers cannot see each other. |
| `CollaborationRooms` (members, seed lock) | Memory (`ConcurrentDictionary` + `lock`) | Redis (or a table with an atomic `UPDATE ... WHERE`). |
| Updates and HTML | SQL | SQL (no changes). |
| Sticky sessions | No | No (with no negotiation, the connection is a single request). |

Starting with one instance is valid. The only thing lost when the process restarts is the in-memory room: all
clients reconnect, call `Join`, and the room rebuilds itself.

## 10. Reference implementation (C#)

This is reference code. Do not copy and paste it blindly: adapt it to the project architecture (handlers, Dapper
repositories, error handling). This code compiles on .NET 10 without warnings and was tested as is against the real
front end (with an in-memory repository and test authentication) in scenarios 1 to 10 of section
[11](#11-acceptance-tests).

### 10.1 Contracts

```csharp
public interface IEditorClient
{
    Task ReceiveUpdate(byte[] update);
    Task ReceiveAwareness(byte[] update);
    Task PeerJoined(long clientId);
    Task PeerLeft(long clientId);
    Task SeedRequested(string html);
}

public sealed record JoinResult(IReadOnlyList<byte[]> Updates, bool CanEdit, string? SeedHtml, bool Seeding, bool Compact);

public sealed record StoredUpdate(long Id, byte[] Data);

public enum DocumentPermission { None, Read, Edit }

public interface ICollaborativeDocumentRepository
{
    Task<IReadOnlyList<StoredUpdate>> GetUpdatesAsync(string documentId, CancellationToken ct);
    Task AddUpdateAsync(string documentId, byte[] data, int userId, CancellationToken ct);
    /// Deletes exactly <paramref name="ids"/> and inserts <paramref name="state"/>, in one transaction.
    Task CompactAsync(string documentId, IReadOnlyCollection<long> ids, byte[] state, int userId, CancellationToken ct);
    Task<string?> GetHtmlAsync(string documentId, CancellationToken ct);
    Task SaveHtmlAsync(string documentId, string html, int userId, CancellationToken ct);
}

public interface IDocumentPermissions
{
    /// Same rules as the REST endpoint that returns the document.
    Task<DocumentPermission> GetAsync(string documentId, int userId, CancellationToken ct);
}

public sealed class CollaborationOptions
{
    public bool Enabled { get; set; }
    public int CompactionThreshold { get; set; } = 200;
    public int MaxBytesUpdate { get; set; } = 1024 * 1024;
    public int MaxBytesState { get; set; } = 2 * 1024 * 1024;
    public int MaxBytesAwareness { get; set; } = 16 * 1024;
}
```

### 10.2 In-memory room (one instance)

```csharp
/// Connected members per document and seed lock. Singleton. With several instances, move to Redis.
public sealed class CollaborationRooms
{
    private sealed record Member(long ClientId, bool CanEdit);
    private sealed class Room
    {
        public Dictionary<string, Member> Members { get; } = [];
        public string? SeedOwner { get; set; }
    }

    private readonly Dictionary<string, Room> _rooms = [];
    private readonly Lock _lock = new();

    public void Enter(string documentId, string connectionId, long clientId, bool canEdit)
    {
        lock (_lock) GetRoom(documentId).Members[connectionId] = new Member(clientId, canEdit);
    }

    /// true if this connection is now in charge of seeding the document.
    public bool TryTakeSeed(string documentId, string connectionId)
    {
        lock (_lock)
        {
            Room room = GetRoom(documentId);
            bool free = room.SeedOwner is null || !room.Members.ContainsKey(room.SeedOwner);
            if (free) room.SeedOwner = connectionId;
            return free;
        }
    }

    public void SeedFinished(string documentId)
    {
        lock (_lock) if (_rooms.TryGetValue(documentId, out Room? room)) room.SeedOwner = null;
    }

    /// Removes the member. Returns their clientId and, if they owned a pending seed, the new owner (or null).
    public (long ClientId, string? NewSeedOwner) Leave(string documentId, string connectionId)
    {
        lock (_lock)
        {
            if (!_rooms.TryGetValue(documentId, out Room? room)) return (0, null);
            room.Members.Remove(connectionId, out Member? member);
            string? newOwner = null;
            if (room.SeedOwner == connectionId)
            {
                newOwner = room.Members.FirstOrDefault(m => m.Value.CanEdit).Key;
                room.SeedOwner = newOwner;
            }
            if (room.Members.Count == 0) _rooms.Remove(documentId);
            return (member?.ClientId ?? 0, newOwner);
        }
    }

    private Room GetRoom(string documentId)
    {
        if (!_rooms.TryGetValue(documentId, out Room? room)) _rooms[documentId] = room = new Room();
        return room;
    }
}
```

### 10.3 Hub

```csharp
[Authorize]
public sealed partial class EditorHub(
    ICollaborativeDocumentRepository repository,
    IDocumentPermissions permissions,
    CollaborationRooms rooms,
    IOptionsMonitor<CollaborationOptions> options) : Hub<IEditorClient>
{
    private const string DocumentKey = "document";
    private const string CanEditKey = "canEdit";
    private const string IdsKey = "ids";

    [GeneratedRegex("^(contract|note)_[0-9]{1,10}$")]
    private static partial Regex DocumentIdFormat();

    public async Task<JoinResult> Join(string documentId, long clientId)
    {
        CollaborationOptions config = options.CurrentValue;
        if (!config.Enabled) throw new HubException("Collaborative editing is disabled.");
        if (Context.Items.ContainsKey(DocumentKey)) throw new HubException("The connection is already in a document.");
        if (!DocumentIdFormat().IsMatch(documentId)) throw new HubException("Invalid document.");

        int userId = UserId();
        DocumentPermission permission = await permissions.GetAsync(documentId, userId, Context.ConnectionAborted);
        if (permission == DocumentPermission.None) throw new HubException("You do not have access to this document.");
        bool canEdit = permission == DocumentPermission.Edit;

        Context.Items[DocumentKey] = documentId;
        Context.Items[CanEditKey] = canEdit;

        // Group first, then read: an update that arrives in between is received twice (harmless), never zero times.
        await Groups.AddToGroupAsync(Context.ConnectionId, documentId);
        IReadOnlyList<StoredUpdate> updates = await repository.GetUpdatesAsync(documentId, Context.ConnectionAborted);
        Context.Items[IdsKey] = updates.Select(u => u.Id).ToArray();

        string? seedHtml = null;
        bool seeding = false;
        if (updates.Count == 0)
        {
            string? html = await repository.GetHtmlAsync(documentId, Context.ConnectionAborted);
            if (!string.IsNullOrEmpty(html))
            {
                if (canEdit && rooms.TryTakeSeed(documentId, Context.ConnectionId)) seedHtml = html;
                else seeding = true;
            }
        }

        rooms.Enter(documentId, Context.ConnectionId, clientId, canEdit);
        await Clients.OthersInGroup(documentId).PeerJoined(clientId);

        bool compact = canEdit && updates.Count > config.CompactionThreshold;
        return new JoinResult(updates.Select(u => u.Data).ToList(), canEdit, seedHtml, seeding, compact);
    }

    public async Task SendUpdate(byte[] update)
    {
        string documentId = CurrentDocument(requireEdit: true);
        if (update.Length == 0 || update.Length > options.CurrentValue.MaxBytesUpdate) throw new HubException("Invalid change.");

        // Without the connection token: if the client leaves right now, the change is still stored.
        await repository.AddUpdateAsync(documentId, update, UserId(), CancellationToken.None);
        rooms.SeedFinished(documentId);
        await Clients.OthersInGroup(documentId).ReceiveUpdate(update);
    }

    public Task SendAwareness(byte[] update)
    {
        string documentId = CurrentDocument(requireEdit: false);
        if (update.Length > options.CurrentValue.MaxBytesAwareness) throw new HubException("Invalid cursor.");
        return Clients.OthersInGroup(documentId).ReceiveAwareness(update);
    }

    public async Task Compact(byte[] state)
    {
        string documentId = CurrentDocument(requireEdit: true);
        if (state.Length == 0 || state.Length > options.CurrentValue.MaxBytesState) throw new HubException("Invalid state.");
        if (Context.Items[IdsKey] is not long[] { Length: > 0 } ids) return;

        // Only the rows this connection received: never "Id <= max" (see 5.5).
        Context.Items[IdsKey] = Array.Empty<long>();
        await repository.CompactAsync(documentId, ids, state, UserId(), CancellationToken.None);
    }

    public Task SaveHtml(string html)
    {
        string documentId = CurrentDocument(requireEdit: true);
        // Same limit and same treatment as the REST save endpoint.
        return repository.SaveHtmlAsync(documentId, html, UserId(), CancellationToken.None);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (Context.Items[DocumentKey] is string documentId)
        {
            (long clientId, string? newOwner) = rooms.Leave(documentId, Context.ConnectionId);
            if (newOwner is not null)
            {
                string? html = await repository.GetHtmlAsync(documentId, CancellationToken.None);
                if (!string.IsNullOrEmpty(html)) await Clients.Client(newOwner).SeedRequested(html);
            }
            await Clients.OthersInGroup(documentId).PeerLeft(clientId);
        }
        await base.OnDisconnectedAsync(exception);
    }

    private string CurrentDocument(bool requireEdit)
    {
        if (Context.Items[DocumentKey] is not string documentId) throw new HubException("You must join the document first.");
        if (requireEdit && Context.Items[CanEditKey] is not true) throw new HubException("You do not have permission to edit.");
        return documentId;
    }

    // Adjust to the project's real claim.
    private int UserId() =>
        int.TryParse(Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value, out int id) ? id : throw new HubException("Invalid user.");
}
```

### 10.4 Program.cs

```csharp
builder.Services.Configure<CollaborationOptions>(builder.Configuration.GetSection("Collaboration"));
builder.Services.AddSingleton<CollaborationRooms>();
builder.Services.AddScoped<ICollaborativeDocumentRepository, CollaborativeDocumentRepository>();
builder.Services.AddScoped<IDocumentPermissions, DocumentPermissions>();

// If AddSignalR is already called for another hub, this only adds options for EditorHub.
builder.Services.AddSignalR()
    .AddHubOptions<EditorHub>(options => options.MaximumReceiveMessageSize = 2 * 1024 * 1024);

// Inside the existing AddJwtBearer:
options.Events = new JwtBearerEvents
{
    OnMessageReceived = context =>
    {
        // The browser cannot send headers on a WebSocket: the token comes in the query. Only for the hub.
        string? token = context.Request.Query["access_token"];
        if (!string.IsNullOrEmpty(token) && context.HttpContext.Request.Path.StartsWithSegments("/api/hubs/editor"))
        {
            context.Token = token;
        }
        return Task.CompletedTask;
    },
};

// Next to the other hubs, without AllowAnonymous:
app.MapHub<EditorHub>("/api/hubs/editor", options => options.CloseOnAuthenticationExpiration = true);
```

If `PathBase` is configured, `Request.Path` already comes without it: the `StartsWithSegments` above is still
correct.

If there is a reverse proxy (YARP, nginx, IIS ARR), it must let the WebSocket upgrade through on the hub route.
See [7.2](#72-the-token-travels-in-the-url-keep-it-out-of-the-logs) for its logs.

## 11. Acceptance tests

With two browsers (or a normal window and an incognito one) and two users:

| # | Scenario | Expected |
|---|---|---|
| 1 | Open a document that only has HTML | The HTML shows, with locked blocks and editable fields intact. 1 row is created. |
| 2 | Open it at the same time from 2 browsers (document with no rows) | The content appears **only once** in both. |
| 3 | Type at the same time in different paragraphs | Both see everything. Nothing is lost. |
| 4 | Ctrl+Z in A | Undoes only A's changes. B sees the change. |
| 5 | Read-only user | Sees changes live. Cannot type. A forced `SendUpdate` from the console → error. |
| 6 | Cut B's network, type, reconnect | What was typed offline reaches A. |
| 7 | Stop typing for 3 s | The HTML in the database matches what is shown. |
| 8 | Document with more rows than the threshold, join | Rows drop to 1–2. The content stays the same. |
| 9 | Move the cursor / close the tab | The other user sees the named cursor. On close, it disappears immediately. |
| 10 | The first to join leaves before it loads | The second receives `SeedRequested`, seeds, and sees the content. |
| 11 | `Join` with another user's or a malformed `documentId` | `HubException`. The front end loads nothing. |
| 12 | Expired token with the tab open | The connection drops and reconnects on its own with a new token. |
| 13 | Check the proxy, web server and telemetry logs | No `access_token` appears. |

## 12. Open questions

To settle between back end and front end before implementing:

1. **Which documents are collaborative** and how the `documentId` is built (final prefixes and regex).
2. **Permission rules** (`Read` / `Edit`) by document type and state (draft, sent, signed).
3. **Lifecycle**: when a document is sent or signed, are the Yjs rows deleted so only the HTML remains?
   (Recommended: yes. It also removes the deleted text Yjs keeps until compaction.)
4. **Processes that change the HTML outside the editor**: list them, because they must delete the rows
   ([5.6](#56-html-savehtml)).
5. **One instance or several** of the API in production ([9](#9-scaling-one-instance-or-several)).
6. **Auditing**: is `UserId` + `CreatedAt` per row enough, or do you need an HTML version history?
