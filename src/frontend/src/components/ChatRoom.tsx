import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalBlob } from "../backend";
import type { Message } from "../backend.d";
import { useActor } from "../hooks/useActor";
import LiveCall from "./LiveCall";

interface Props {
  onExit: () => void;
}

interface LocalMessage {
  id: bigint;
  text: string;
  sender: string;
  timestamp: bigint;
  msgType: string;
  mediaUrl?: string;
}

function msgToLocal(msg: Message): LocalMessage {
  return {
    id: msg.id,
    text: msg.text,
    sender: msg.sender,
    timestamp: msg.timestamp,
    msgType: msg.msgType || "text",
    mediaUrl: msg.mediaUrl ?? (msg.blob ? msg.blob.getDirectURL() : undefined),
  };
}

export default function ChatRoom({ onExit }: Props) {
  const { actor } = useActor();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [text, setText] = useState("");
  const [sender, setSender] = useState("Me");
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!actor) return;
    try {
      const msgs = await actor.getMessages();
      setMessages((prev) => {
        const remoteIds = new Set(msgs.map((m) => String(m.id)));
        const localP2P = prev.filter(
          (m) => m.msgType === "webrtc-text" && !remoteIds.has(String(m.id)),
        );
        const remote = [...msgs]
          .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))
          .map(msgToLocal);
        return [...remote, ...localP2P].sort((a, b) =>
          a.timestamp < b.timestamp ? -1 : 1,
        );
      });
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    } catch {
      // ignore
    }
  }, [actor]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 2000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !actor) return;
    setSending(true);
    try {
      await actor.sendMessage(trimmed, sender || "Me", null, null);
      if (dataChannelRef.current?.readyState === "open") {
        try {
          dataChannelRef.current.send(trimmed);
        } catch {
          // ignore
        }
      }
      setText("");
      await fetchMessages();
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
    inputRef.current?.focus();
  };

  const handleClear = async () => {
    if (!actor) return;
    setClearing(true);
    try {
      await actor.clearMessages();
      setMessages([]);
    } catch {
      // ignore
    } finally {
      setClearing(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !actor) return;

    const isVideo = file.type.startsWith("video/");
    const msgType = isVideo ? "video" : "image";

    setUploadProgress(0);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const blob = ExternalBlob.fromBytes(bytes).withUploadProgress((pct) =>
        setUploadProgress(pct),
      );
      const url = blob.getDirectURL();
      await actor.sendMessage(file.name, sender || "Me", msgType, url);
      await fetchMessages();
    } catch {
      // ignore
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleP2PMessage = useCallback((p2pText: string) => {
    const localMsg: LocalMessage = {
      id: BigInt(Date.now()),
      text: p2pText,
      sender: "P2P",
      msgType: "webrtc-text",
      timestamp: BigInt(Date.now()) * 1_000_000n,
    };
    setMessages((prev) => [...prev, localMsg]);
  }, []);

  const formatTime = (ts: bigint) => {
    const ms = Number(ts / 1_000_000n);
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div
      className="w-full max-w-[420px] min-h-screen flex flex-col relative"
      style={{ background: "oklch(0.1 0 0)" }}
    >
      {showCall && actor && (
        <LiveCall
          actor={actor}
          onClose={() => setShowCall(false)}
          onP2PMessage={handleP2PMessage}
        />
      )}

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border"
        style={{ background: "oklch(0.14 0 0)" }}
      >
        <button
          type="button"
          data-ocid="chat.close_button"
          onClick={onExit}
          className="text-muted-foreground hover:text-foreground transition-colors text-lg p-1"
          aria-label="Exit"
        >
          &larr;
        </button>
        <span className="text-foreground text-sm font-medium tracking-widest uppercase opacity-60">
          Room
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-ocid="chat.open_modal_button"
            onClick={() => setShowCall(true)}
            disabled={!actor}
            className="p-1.5 rounded transition-colors hover:opacity-80 disabled:opacity-30"
            style={{ color: "oklch(0.7 0.15 140)" }}
            aria-label="Live video call"
            title="Live video call"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <title>Video call</title>
              <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14" />
              <rect x="1" y="6" width="14" height="12" rx="2" />
            </svg>
          </button>
          <button
            type="button"
            data-ocid="chat.delete_button"
            onClick={handleClear}
            disabled={clearing || !actor}
            className="text-xs px-3 py-1 rounded text-destructive border border-destructive/40 hover:bg-destructive/10 transition-colors disabled:opacity-40"
          >
            {clearing ? "Clearing\u2026" : "Clear All"}
          </button>
        </div>
      </div>

      {/* Name bar */}
      <div
        className="flex items-center gap-2 px-4 py-2 border-b border-border"
        style={{ background: "oklch(0.12 0 0)" }}
      >
        <span className="text-muted-foreground text-xs">Name:</span>
        <input
          data-ocid="chat.input"
          type="text"
          value={sender}
          onChange={(e) => setSender(e.target.value)}
          className="bg-transparent text-foreground text-xs outline-none w-28 border-b border-border/50 pb-0.5"
          maxLength={20}
          placeholder="Me"
        />
      </div>

      {/* Upload progress */}
      {uploadProgress !== null && (
        <div
          data-ocid="chat.loading_state"
          className="flex items-center gap-2 px-4 py-2 border-b border-border text-xs"
          style={{ background: "oklch(0.13 0.03 220)" }}
        >
          <svg
            className="animate-spin"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="oklch(0.6 0.15 220)"
            strokeWidth="2"
            aria-hidden="true"
          >
            <title>Uploading</title>
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          <span style={{ color: "oklch(0.6 0.15 220)" }}>
            Uploading\u2026 {uploadProgress}%
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div
            data-ocid="chat.empty_state"
            className="flex items-center justify-center h-full min-h-[200px]"
          >
            <p className="text-muted-foreground text-xs opacity-50">
              No messages yet
            </p>
          </div>
        )}
        {messages.map((msg, idx) => {
          const isMine = msg.sender === (sender || "Me");
          const isP2P = msg.msgType === "webrtc-text";
          return (
            <div
              key={String(msg.id)}
              data-ocid={`chat.item.${idx + 1}`}
              className={`flex flex-col gap-0.5 ${
                isMine || isP2P ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                  isMine || isP2P ? "rounded-tr-sm" : "rounded-tl-sm"
                } text-foreground`}
                style={{
                  background: isP2P
                    ? "oklch(0.28 0.08 120)"
                    : isMine
                      ? "oklch(0.35 0.1 220)"
                      : "oklch(0.2 0 0)",
                }}
              >
                {isP2P && (
                  <span
                    className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded mr-1.5 align-middle"
                    style={{
                      background: "oklch(0.4 0.12 120)",
                      color: "oklch(0.95 0 0)",
                    }}
                  >
                    P2P
                  </span>
                )}
                {msg.msgType === "image" && msg.mediaUrl ? (
                  <img
                    src={msg.mediaUrl}
                    alt={msg.text}
                    className="max-w-[200px] rounded-lg block"
                  />
                ) : msg.msgType === "video" && msg.mediaUrl ? (
                  // biome-ignore lint/a11y/useMediaCaption: user-generated content, captions not available
                  <video
                    src={msg.mediaUrl}
                    controls
                    className="max-w-[200px] rounded-lg block"
                  />
                ) : (
                  msg.text
                )}
              </div>
              <span className="text-muted-foreground text-[10px] px-1">
                {msg.sender} &middot; {formatTime(msg.timestamp)}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="flex items-center gap-2 px-3 py-3 border-t border-border"
        style={{ background: "oklch(0.14 0 0)" }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileSelect}
          aria-label="Attach file"
        />
        <button
          type="button"
          data-ocid="chat.upload_button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!actor || uploadProgress !== null}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-opacity disabled:opacity-30"
          style={{ background: "oklch(0.2 0 0)" }}
          aria-label="Attach photo or video"
          title="Send photo or video"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="oklch(0.6 0 0)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <title>Attach</title>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>

        <input
          ref={inputRef}
          data-ocid="chat.search_input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="Message\u2026"
          className="flex-1 rounded-full px-4 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground border border-border/30"
          style={{ background: "oklch(0.18 0 0)" }}
        />
        <button
          type="button"
          data-ocid="chat.primary_button"
          onClick={handleSend}
          disabled={sending || !text.trim() || !actor}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-opacity disabled:opacity-30"
          style={{ background: "oklch(0.75 0.18 50)" }}
          aria-label="Send"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="oklch(0.1 0 0)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <title>Send</title>
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
