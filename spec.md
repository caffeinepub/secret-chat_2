# Secret Chat

## Current State
A dark-themed calculator disguised app. PIN 9696 unlocks a private chat room with text-only messaging, real-time polling every 2s, username support, and clear-all function. Backend stores messages with id/text/sender/timestamp.

## Requested Changes (Diff)

### Add
- Photo sending: file picker (images), upload to blob storage, display inline in chat
- Video sending: file picker (videos), upload to blob storage, display inline video player in chat
- Live video call: WebRTC peer-to-peer video/audio call with signaling via backend
- Offline/P2P real-time messaging: WebRTC data channels for direct peer messages once connected
- Attachment button in chat input bar (camera icon for photo, video icon for video)
- "Live" button to start/join video call
- Message type field (text | image | video | webrtc-text)

### Modify
- Backend Message type: add optional `mediaUrl` and `msgType` fields
- Backend: add WebRTC signaling methods (storeOffer, storeAnswer, addIceCandidate, getSignaling, clearSignaling)
- ChatRoom component: render images/videos inline; add media upload buttons

### Remove
- Nothing removed

## Implementation Plan
1. Select blob-storage and camera components
2. Update backend: new Message shape with msgType + mediaUrl, WebRTC signaling storage
3. Frontend ChatRoom: add photo/video upload with StorageClient, inline media rendering
4. Frontend: LiveCall component using WebRTC getUserMedia + RTCPeerConnection with backend signaling
5. Wire Live button in chat header to toggle call overlay
6. WebRTC data channel for offline P2P text messages (shown in same chat feed)
