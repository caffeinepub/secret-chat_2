import { useCallback, useEffect, useRef, useState } from "react";
import type { backendInterface } from "../backend";

interface Props {
  actor: backendInterface;
  onClose: () => void;
  onP2PMessage: (text: string) => void;
}

type CallStatus = "idle" | "waiting" | "connecting" | "connected" | "ended";
type CallRole = "caller" | "answerer" | null;

const STUN_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export default function LiveCall({ actor, onClose, onP2PMessage }: Props) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [role, setRole] = useState<CallRole>(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endedRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const cleanup = useCallback(async () => {
    endedRef.current = true;
    stopPolling();
    dataChannelRef.current?.close();
    pcRef.current?.close();
    pcRef.current = null;
    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) t.stop();
    }
    localStreamRef.current = null;
    try {
      await actor.clearSignaling();
    } catch {
      // ignore
    }
  }, [actor, stopPolling]);

  const handleEnd = useCallback(async () => {
    await cleanup();
    setStatus("ended");
    onClose();
  }, [cleanup, onClose]);

  const getUserMedia = async (): Promise<MediaStream> => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    return stream;
  };

  const setupDataChannel = (channel: RTCDataChannel) => {
    dataChannelRef.current = channel;
    channel.onmessage = (e) => {
      onP2PMessage(e.data as string);
    };
  };

  const startAsCaller = async () => {
    setRole("caller");
    setStatus("waiting");

    const stream = await getUserMedia();
    const pc = new RTCPeerConnection(STUN_CONFIG);
    pcRef.current = pc;

    for (const track of stream.getTracks()) pc.addTrack(track, stream);

    const dc = pc.createDataChannel("chat");
    setupDataChannel(dc);

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
      setStatus("connected");
    };

    pc.onicecandidate = async ({ candidate }) => {
      if (candidate && !endedRef.current) {
        try {
          await actor.addIceCandidateOfferer(JSON.stringify(candidate));
        } catch {
          // ignore
        }
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await actor.storeOffer(offer.sdp ?? "");

    pollingRef.current = setInterval(async () => {
      if (endedRef.current) return;
      try {
        const sig = await actor.getSignaling();
        if (sig?.answerSDP && pc.remoteDescription === null) {
          await pc.setRemoteDescription({
            type: "answer",
            sdp: sig.answerSDP,
          });
          setStatus("connecting");
        }
        if (sig?.iceCandidatesAnswerer?.length) {
          for (const raw of sig.iceCandidatesAnswerer) {
            try {
              await pc.addIceCandidate(JSON.parse(raw) as RTCIceCandidateInit);
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
    }, 2000);
  };

  const joinAsAnswerer = async () => {
    setRole("answerer");
    setStatus("waiting");

    const waitForOffer = (): Promise<string> =>
      new Promise((resolve) => {
        const interval = setInterval(async () => {
          if (endedRef.current) {
            clearInterval(interval);
            return;
          }
          try {
            const sig = await actor.getSignaling();
            if (sig?.offerSDP) {
              clearInterval(interval);
              resolve(sig.offerSDP);
            }
          } catch {
            // ignore
          }
        }, 2000);
      });

    const offerSDP = await waitForOffer();
    if (endedRef.current) return;

    const stream = await getUserMedia();
    const pc = new RTCPeerConnection(STUN_CONFIG);
    pcRef.current = pc;

    for (const track of stream.getTracks()) pc.addTrack(track, stream);

    pc.ondatachannel = (e) => {
      setupDataChannel(e.channel);
    };

    pc.ontrack = (e) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
      setStatus("connected");
    };

    pc.onicecandidate = async ({ candidate }) => {
      if (candidate && !endedRef.current) {
        try {
          await actor.addIceCandidateAnswerer(JSON.stringify(candidate));
        } catch {
          // ignore
        }
      }
    };

    await pc.setRemoteDescription({ type: "offer", sdp: offerSDP });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await actor.storeAnswer(answer.sdp ?? "");
    setStatus("connecting");

    pollingRef.current = setInterval(async () => {
      if (endedRef.current) return;
      try {
        const sig = await actor.getSignaling();
        if (sig?.iceCandidatesOfferer?.length) {
          for (const raw of sig.iceCandidatesOfferer) {
            try {
              await pc.addIceCandidate(JSON.parse(raw) as RTCIceCandidateInit);
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
    }, 2000);
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getAudioTracks()) {
        t.enabled = !t.enabled;
      }
    }
    setMuted((m) => !m);
  };

  const toggleCam = () => {
    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getVideoTracks()) {
        t.enabled = !t.enabled;
      }
    }
    setCamOff((c) => !c);
  };

  useEffect(() => {
    return () => {
      endedRef.current = true;
      stopPolling();
      pcRef.current?.close();
      if (localStreamRef.current) {
        for (const t of localStreamRef.current.getTracks()) t.stop();
      }
    };
  }, [stopPolling]);

  const statusLabel: Record<CallStatus, string> = {
    idle: "Ready",
    waiting: "Waiting\u2026",
    connecting: "Connecting\u2026",
    connected: "Connected",
    ended: "Call Ended",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "oklch(0.06 0 0)" }}
      data-ocid="livecall.modal"
    >
      <div className="flex-1 relative">
        {/* biome-ignore lint/a11y/useMediaCaption: live video call stream */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
          style={{ background: "oklch(0.1 0 0)" }}
        />
        {status !== "connected" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: "oklch(0.18 0 0)" }}
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="oklch(0.5 0 0)"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <title>Camera</title>
                <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <p className="text-muted-foreground text-sm">
              {statusLabel[status]}
            </p>
          </div>
        )}

        <div className="absolute bottom-4 right-4 w-28 h-20 rounded-xl overflow-hidden border border-border/30 shadow-lg">
          {/* biome-ignore lint/a11y/useMediaCaption: local camera preview */}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ background: "oklch(0.15 0 0)" }}
          />
          {camOff && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: "oklch(0.15 0 0)" }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="oklch(0.4 0 0)"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <title>Camera off</title>
                <line x1="2" y1="2" x2="22" y2="22" />
                <path d="M10.68 10.68A2 2 0 0012 14H5a2 2 0 01-2-2V8a2 2 0 012-2h.34M14 8.34V8a2 2 0 00-2-2H8.34M19 8.87v6.26a1 1 0 01-1.447.894L15 14M15 10l4.553-2.069A1 1 0 0121 8.87" />
              </svg>
            </div>
          )}
        </div>
      </div>

      <div
        className="flex items-center justify-center py-2 px-4"
        style={{ background: "oklch(0.1 0 0)" }}
      >
        <span
          className="text-xs"
          style={{
            color:
              status === "connected" ? "oklch(0.7 0.15 140)" : "oklch(0.5 0 0)",
          }}
        >
          {statusLabel[status]}
        </span>
      </div>

      <div
        className="flex items-center justify-center gap-4 px-4 py-4"
        style={{ background: "oklch(0.1 0 0)" }}
      >
        {status === "idle" && (
          <>
            <button
              type="button"
              data-ocid="livecall.primary_button"
              onClick={startAsCaller}
              className="flex flex-col items-center gap-1 px-5 py-2 rounded-xl text-xs transition-colors"
              style={{
                background: "oklch(0.35 0.15 140)",
                color: "oklch(0.95 0 0)",
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <title>Start call</title>
                <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
              Start Call
            </button>
            <button
              type="button"
              data-ocid="livecall.secondary_button"
              onClick={joinAsAnswerer}
              className="flex flex-col items-center gap-1 px-5 py-2 rounded-xl text-xs transition-colors"
              style={{
                background: "oklch(0.25 0.1 220)",
                color: "oklch(0.95 0 0)",
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <title>Join call</title>
                <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Join Call
            </button>
            <button
              type="button"
              data-ocid="livecall.close_button"
              onClick={onClose}
              className="flex flex-col items-center gap-1 px-5 py-2 rounded-xl text-xs transition-colors"
              style={{
                background: "oklch(0.22 0 0)",
                color: "oklch(0.6 0 0)",
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <title>Close</title>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Close
            </button>
          </>
        )}

        {status !== "idle" && status !== "ended" && (
          <>
            <button
              type="button"
              data-ocid="livecall.toggle"
              onClick={toggleMute}
              title={muted ? "Unmute" : "Mute"}
              className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
              style={{
                background: muted ? "oklch(0.4 0.1 30)" : "oklch(0.22 0 0)",
              }}
            >
              {muted ? (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="oklch(0.9 0 0)"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <title>Unmute</title>
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" />
                  <path d="M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              ) : (
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="oklch(0.9 0 0)"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <title>Mute</title>
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                  <path d="M19 10v2a7 7 0 01-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>

            <button
              type="button"
              data-ocid="livecall.delete_button"
              onClick={handleEnd}
              className="w-14 h-14 rounded-full flex items-center justify-center transition-colors"
              style={{ background: "oklch(0.5 0.2 25)" }}
              title="End Call"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                aria-hidden="true"
              >
                <title>End call</title>
                <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7 2 2 0 011.72 2v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.42 19.42 0 013.07 9.5 19.79 19.79 0 010 .86 2 2 0 012 -1.32h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6 6.68" />
              </svg>
            </button>

            <button
              type="button"
              data-ocid="livecall.secondary_button"
              onClick={toggleCam}
              title={camOff ? "Turn camera on" : "Turn camera off"}
              className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
              style={{
                background: camOff ? "oklch(0.4 0.1 30)" : "oklch(0.22 0 0)",
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="oklch(0.9 0 0)"
                strokeWidth="2"
                aria-hidden="true"
              >
                <title>{camOff ? "Camera on" : "Camera off"}</title>
                {camOff ? (
                  <>
                    <line x1="2" y1="2" x2="22" y2="22" />
                    <path d="M10.68 10.68A2 2 0 0012 14H5a2 2 0 01-2-2V8a2 2 0 012-2h.34M14 8.34V8a2 2 0 00-2-2H8.34M19 8.87v6.26a1 1 0 01-1.447.894L15 14M15 10l4.553-2.069A1 1 0 0121 8.87" />
                  </>
                ) : (
                  <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                )}
              </svg>
            </button>
          </>
        )}
      </div>

      {role && status !== "idle" && (
        <div
          className="text-center py-2 text-[10px] text-muted-foreground"
          style={{ background: "oklch(0.08 0 0)" }}
        >
          You are the{" "}
          <span className="font-medium" style={{ color: "oklch(0.6 0.1 220)" }}>
            {role === "caller" ? "Caller" : "Answerer"}
          </span>
        </div>
      )}
    </div>
  );
}
