# Chat Media Single Attachment Design

## Goal

Add single-attachment media support to the player chat experience so a player can:

1. choose one image or one video into the composer
2. optionally enter text
3. send both together in one action
4. receive an answer grounded in both the player text and AI analysis of the uploaded media

This is a lightweight first release. It must fit the existing `web/chat.html` + `web/js/chat.js` + `server/src/routes/public.js` + `server/src/services/chatService.js` flow without introducing a new standalone media-message model.

## Scope

### In scope

- one attachment per message
- image or video attachment
- composer preview before send
- send-time upload and AI analysis
- chat reply generation using:
  - player text
  - media analysis summary
  - existing KB / RAG / live reply logic
- clear failure feedback for unsupported file type, oversize file, upload failure, analysis failure

### Out of scope

- multiple attachments
- separate media-only message bubbles
- timeline-level video understanding
- frame extraction UI
- attachment history / gallery
- background upload before send
- reuse by simulation or admin pages in this release

## Existing Context

### Frontend

The chat page already has:

- image button `#chat-image-btn`
- video button `#chat-video-btn`
- hidden file inputs `#chat-file-image` and `#chat-file-video`
- pending preview area `#chat-input-preview`

`web/js/chat.js` already keeps a local `pendingAttachment` preview, but the attachment is not uploaded or sent to the backend.

### Backend

`POST /api/public/chat` currently accepts JSON only and passes plain text `message` into `chatService.handleChat`.

The existing backend already has patterns for:

- `multer` uploads in `server/src/routes/bot.js`
- upload directories in `server/src/config/kb.js`
- SSE stage push in `server/src/routes/public.js`

There is no chat-media persistence or media analysis service yet.

## Recommended Approach

Implement send-time synchronous upload and media analysis.

Reasoning:

- it matches the requested UX exactly
- it keeps the state model small
- it avoids orphaned uploads
- it minimizes risk to the current chat flow

The cost is added latency on send. That is acceptable for this release and can be surfaced with clear sending status text.

## User Experience

### Composer behavior

- Player selects one image or one video.
- Composer shows one preview chip:
  - image: thumbnail + filename + remove action
  - video: video icon + filename + remove action
- Selecting another file replaces the previous attachment.
- Player can still type text after attaching media.
- Send action allows:
  - text only
  - attachment only
  - text + attachment

### Send behavior

On send:

1. disable send button and attachment actions
2. show sending status in composer area
3. upload the file
4. run media analysis
5. submit chat request with original text plus media payload
6. restore composer state on success or failure

### Failure behavior

- unsupported file type: block immediately in frontend
- file too large: frontend block when possible, backend hard block always
- upload failure: show inline error, keep text intact, keep attachment selected if safe
- analysis failure: show inline error, do not silently answer without media

## Architecture

### Frontend changes

File: `web/js/chat.js`

Add:

- attachment validation helpers
- `sendAttachmentAndMessage()` path inside existing `send()`
- `FormData` request support for chat send when attachment exists
- composer status rendering for:
  - uploading
  - analyzing
  - sending

No separate upload API call from the browser is required in this release. The chat request can submit multipart data directly to the chat endpoint.

### Backend route changes

File: `server/src/routes/public.js`

Change `/api/public/chat` to support both:

- `application/json` for text-only chat
- `multipart/form-data` for text + single attachment

Implementation:

- add `multer` middleware dedicated to chat media
- accept one file field, for example `attachment`
- validate type and size before calling `chatService.handleChat`

### Media service

New file: `server/src/services/chatMediaService.js`

Responsibilities:

- validate media type and size
- create deterministic upload target under `uploads/chat-media/<versionId>/<yyyy-mm>/`
- save uploaded file
- call multimodal AI analysis
- return normalized media context object

Suggested response shape:

```js
{
  kind: 'image' | 'video',
  mimeType: 'image/png',
  originalName: 'example.png',
  sizeBytes: 12345,
  storedUrl: '/chat-media/1/2026-07/abc123.png',
  analysis: {
    summary: '...',
    tags: ['...'],
    safety: 'normal'
  }
}
```

### Chat service integration

File: `server/src/services/chatService.js`

Extend `handleChat()` options with optional `mediaContext`.

Behavior:

- preserve the original player text for storage and scoring as the player message
- build an internal augmented prompt for retrieval + answering:
  - original player text
  - media type
  - media analysis summary
  - optional instruction that the reply should directly answer the player using both text and media evidence

Important:

- do not expose internal phrases like "AI analysis shows"
- do not force mention of media unless relevant
- do not bypass KB logic; media context is additional context, not a separate answer mode

### Static file serving

File: `server/src/app.js`

Add static serving for `/chat-media` mapped to `uploads/chat-media`.

This allows future preview reuse and debugging, even if this release does not yet render sent media bubbles.

## Request / Data Flow

### Text only

Current flow remains unchanged.

### Text + attachment

1. browser submits multipart request to `/api/public/chat`
2. route validates `versionId`, `sessionKey`, `message`, and single file
3. route stores file through `chatMediaService`
4. `chatMediaService` runs multimodal analysis and returns `mediaContext`
5. route calls `chatService.handleChat({ ..., message, mediaContext })`
6. `chatService` builds augmented internal prompt and generates final answer
7. response returns existing chat payload structure

## Multimodal Analysis Contract

The analysis output should be concise and retrieval-friendly.

Target fields:

- `summary`: 1 short paragraph describing the media content relevant to gameplay / UI / objects / text in the scene
- `tags`: a few short tokens for retrieval and debugging

Prompt rules for the multimodal analyzer:

- describe only visible / inferable content
- include OCR-like text when clearly visible
- avoid speculation
- focus on game-relevant signals:
  - UI labels
  - hero names
  - rewards
  - lineup screens
  - battle result screens
  - resource counts

## Validation Rules

### Supported types

Images:

- `image/png`
- `image/jpeg`
- `image/webp`
- `image/gif`

Videos:

- `video/mp4`
- `video/webm`
- `video/quicktime`

### Limits

Release-default limits:

- image: 10 MB
- video: 25 MB

If the environment or upstream model has tighter limits, the service should fail early with a clear message.

## Error Handling

### Frontend

- inline composer error text
- attachment stays visible after recoverable failure
- text input is never cleared on failure

### Backend

- unsupported type -> 400
- oversized file -> 400
- media save failure -> 500
- media analysis failure -> 502 or 500 with stable message
- chat generation failure after successful upload -> 500

The route should avoid half-success responses. If media analysis fails, the overall send fails.

## Testing

### Backend

Add focused tests for:

- text-only chat still works
- multipart chat with image reaches media service
- multipart chat with invalid type is rejected
- `chatService.handleChat()` correctly augments internal prompt when `mediaContext` is present

### Frontend

Manual verification:

- choose image, type text, send
- choose video, type text, send
- replace existing attachment
- remove attachment
- send attachment only
- upload failure path

## Rollout Notes

- This design intentionally avoids database schema changes for the first release.
- Stored media lives on disk only.
- If later we need message-level attachment history, add a `chat_message_media` table in a follow-up release instead of overloading `chat_messages`.

## Implementation Steps

1. add chat media config and static serving
2. add `chatMediaService`
3. update `/api/public/chat` to support multipart
4. extend `chatService.handleChat` with `mediaContext`
5. update frontend composer send flow
6. add focused tests
7. run local verification
