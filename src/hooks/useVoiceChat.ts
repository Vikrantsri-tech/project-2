import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Peer } from '@/lib/types';

interface UseVoiceChatOptions {
  roomId: string;
  userId: string | undefined;
  displayName: string;
  peers: Peer[];
}

interface UseVoiceChatReturn {
  micOn: boolean;
  toggleMic: () => Promise<void>;
  speakingPeers: Set<string>;
  audioEnabled: boolean;
  permissionError: string | null;
}

interface VoiceSignalPayload {
  from: string;
  to: string;
  type: 'offer' | 'answer' | 'ice';
  data: unknown;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useVoiceChat({ roomId, userId, displayName, peers }: UseVoiceChatOptions): UseVoiceChatReturn {
  const [micOn, setMicOn] = useState(false);
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set());
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const peerConnsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const userIdRef = useRef(userId);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const ensureStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current) return streamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      setPermissionError(null);
      return stream;
    } catch (err) {
      setPermissionError(err instanceof Error ? err.message : 'Microphone access denied');
      return null;
    }
  }, []);

  const sendSignal = useCallback((to: string, type: 'offer' | 'answer' | 'ice', data: unknown) => {
    const from = userIdRef.current;
    if (!from) return;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'voice-signal',
      payload: { from, to, type, data } satisfies VoiceSignalPayload,
    });
  }, []);

  const attachRemoteStream = useCallback((peerId: string, stream: MediaStream) => {
    let audio = audioElementsRef.current.get(peerId);
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      audioElementsRef.current.set(peerId, audio);
    }
    audio.srcObject = stream;
    audio.play().catch(() => {});

    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let active = false;
      const tick = () => {
        if (!audioElementsRef.current.has(peerId)) {
          ctx.close();
          return;
        }
        analyser.getByteFrequencyData(data);
        const volume = data.reduce((a, b) => a + b, 0) / data.length;
        const nowActive = volume > 8;
        if (nowActive !== active) {
          active = nowActive;
          setSpeakingPeers((prev) => {
            const next = new Set(prev);
            if (nowActive) next.add(peerId);
            else next.delete(peerId);
            return next;
          });
        }
        requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // AudioContext unavailable; skip voice activity detection
    }
  }, []);

  const closePeer = useCallback((peerId: string) => {
    const conn = peerConnsRef.current.get(peerId);
    if (conn) {
      conn.close();
      peerConnsRef.current.delete(peerId);
    }
    const audio = audioElementsRef.current.get(peerId);
    if (audio) {
      audio.srcObject = null;
      audioElementsRef.current.delete(peerId);
    }
    setSpeakingPeers((prev) => {
      const next = new Set(prev);
      next.delete(peerId);
      return next;
    });
  }, []);

  const createPeerConnection = useCallback(
    (peerId: string, initiator: boolean, stream: MediaStream): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnsRef.current.set(peerId, pc);

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal(peerId, 'ice', e.candidate.toJSON());
      };

      pc.ontrack = (e) => {
        if (e.streams[0]) attachRemoteStream(peerId, e.streams[0]);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          closePeer(peerId);
        }
      };

      if (initiator) {
        pc.onnegotiationneeded = async () => {
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal(peerId, 'offer', pc.localDescription);
          } catch {
            closePeer(peerId);
          }
        };
      }

      return pc;
    },
    [sendSignal, attachRemoteStream, closePeer]
  );

  const connectToPeers = useCallback(async () => {
    const stream = await ensureStream();
    if (!stream) return;
    const myId = userIdRef.current ?? '';
    peers.forEach((peer) => {
      if (peer.userId === myId) return;
      if (peerConnsRef.current.has(peer.userId)) return;
      const initiator = myId < peer.userId;
      createPeerConnection(peer.userId, initiator, stream);
    });
  }, [ensureStream, peers, createPeerConnection]);

  const toggleMic = useCallback(async () => {
    if (!micOn) {
      await connectToPeers();
      setMicOn(true);
    } else {
      peerConnsRef.current.forEach((_, id) => closePeer(id));
      peerConnsRef.current.clear();
      audioElementsRef.current.forEach((a) => {
        a.srcObject = null;
      });
      audioElementsRef.current.clear();
      setSpeakingPeers(new Set());
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setMicOn(false);
    }
  }, [micOn, connectToPeers, closePeer]);

  // Connect to newly-joined peers while mic is on
  useEffect(() => {
    if (!micOn) return;
    const stream = streamRef.current;
    if (!stream) return;
    const myId = userIdRef.current ?? '';
    peers.forEach((peer) => {
      if (peer.userId === myId) return;
      if (!peerConnsRef.current.has(peer.userId)) {
        const initiator = myId < peer.userId;
        createPeerConnection(peer.userId, initiator, stream);
      }
    });
  }, [peers, micOn, createPeerConnection]);

  // Signaling channel
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`voice-${roomId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'voice-signal' }, (raw: unknown) => {
        const msg = raw as { payload?: VoiceSignalPayload };
        const p = msg.payload;
        if (!p || !userId || p.to !== userId || p.from === userId) return;
        const fromId = p.from;

        let pc = peerConnsRef.current.get(fromId);
        if (!pc && p.type === 'offer') {
          const stream = streamRef.current;
          if (!stream) return;
          pc = createPeerConnection(fromId, false, stream);
        }
        if (!pc) return;

        (async () => {
          try {
            if (p.type === 'offer' || p.type === 'answer') {
              await pc.setRemoteDescription(new RTCSessionDescription(p.data as RTCSessionDescriptionInit));
              if (p.type === 'offer') {
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                sendSignal(fromId, 'answer', pc.localDescription);
              }
            } else if (p.type === 'ice') {
              try {
                await pc.addIceCandidate(p.data as RTCIceCandidateInit);
              } catch {
                // candidate may arrive before description; ignore
              }
            }
          } catch {
            closePeer(fromId);
          }
        })();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
      peerConnsRef.current.forEach((_, id) => closePeer(id));
      peerConnsRef.current.clear();
      audioElementsRef.current.forEach((a) => {
        a.srcObject = null;
      });
      audioElementsRef.current.clear();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setSpeakingPeers(new Set());
    };
  }, [roomId, userId, sendSignal, createPeerConnection, closePeer]);

  return {
    micOn,
    toggleMic,
    speakingPeers,
    audioEnabled: micOn,
    permissionError,
  };
}
