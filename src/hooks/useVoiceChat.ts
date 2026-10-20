import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import SimplePeer from 'simple-peer';
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

export function useVoiceChat({ roomId, userId, displayName, peers }: UseVoiceChatOptions): UseVoiceChatReturn {
  const [micOn, setMicOn] = useState(false);
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set());
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const peerConnsRef = useRef<Map<string, InstanceType<typeof SimplePeer>>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const displayNameRef = useRef(displayName);
  const userIdRef = useRef(userId);

  useEffect(() => {
    displayNameRef.current = displayName;
    userIdRef.current = userId;
  }, [displayName, userId]);

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
    channelRef.current?.send({
      type: 'broadcast',
      event: 'voice-signal',
      payload: { from: userIdRef.current, to, type, data },
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

    // Simple voice activity detection via volume analysis
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

  const createPeer = useCallback((peerId: string, initiator: boolean, stream: MediaStream) => {
    if (peerConnsRef.current.has(peerId)) return;
    const peer = new SimplePeer({
      initiator,
      stream,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] },
    });

    peer.on('signal', (data) => {
      const dataType = (data as { type?: string }).type;
      const type: 'offer' | 'answer' | 'ice' =
        dataType === 'offer' ? 'offer' : dataType === 'answer' ? 'answer' : 'ice';
      sendSignal(peerId, type, data);
    });

    peer.on('stream', (remoteStream) => {
      attachRemoteStream(peerId, remoteStream);
    });

    peer.on('error', () => {
      peer.destroy();
      peerConnsRef.current.delete(peerId);
    });

    peer.on('close', () => {
      peerConnsRef.current.delete(peerId);
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
    });

    peerConnsRef.current.set(peerId, peer);
  }, [sendSignal, attachRemoteStream]);

  const connectToPeers = useCallback(async () => {
    const stream = await ensureStream();
    if (!stream) return;

    peers.forEach((peer) => {
      if (peer.userId === userIdRef.current) return;
      // Lower userId is initiator to avoid both ends offering
      const initiator = (userIdRef.current ?? '') < peer.userId;
      createPeer(peer.userId, initiator, stream);
    });
  }, [ensureStream, peers, createPeer]);

  const toggleMic = useCallback(async () => {
    if (!micOn) {
      await connectToPeers();
      setMicOn(true);
    } else {
      peerConnsRef.current.forEach((p) => p.destroy());
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
  }, [micOn, connectToPeers]);

  // Handle new peers joining after we're already live
  useEffect(() => {
    if (!micOn) return;
    const stream = streamRef.current;
    if (!stream) return;
    peers.forEach((peer) => {
      if (peer.userId === userIdRef.current) return;
      if (!peerConnsRef.current.has(peer.userId)) {
        const initiator = (userIdRef.current ?? '') < peer.userId;
        createPeer(peer.userId, initiator, stream);
      }
    });
  }, [peers, micOn, createPeer]);

  // Signaling channel
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`voice-${roomId}`);
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'voice-signal' }, (raw: unknown) => {
        const msg = raw as { payload?: { from?: string; to?: string; type?: string; data?: unknown } };
        const p = msg.payload;
        if (!p || !p.from || !p.to || !userId || p.to !== userId || p.from === userId) return;
        const fromId = p.from;
        let peer = peerConnsRef.current.get(fromId);
        if (!peer && p.type === 'offer') {
          const stream = streamRef.current;
          if (!stream) return;
          peer = new SimplePeer({ initiator: false, stream, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } });
          peer.on('signal', (data) => {
            const dataType = (data as { type?: string }).type;
            const type: 'answer' | 'ice' = dataType === 'answer' ? 'answer' : 'ice';
            sendSignal(fromId, type, data);
          });
          peer.on('stream', (remoteStream) => attachRemoteStream(fromId, remoteStream));
          peer.on('error', () => {
            peer?.destroy();
            peerConnsRef.current.delete(fromId);
          });
          peer.on('close', () => {
            peerConnsRef.current.delete(fromId);
            const audio = audioElementsRef.current.get(fromId);
            if (audio) {
              audio.srcObject = null;
              audioElementsRef.current.delete(fromId);
            }
          });
          peerConnsRef.current.set(fromId, peer);
        }
        if (peer) {
          peer.signal(p.data as SimplePeer.SignalData);
        }
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
      peerConnsRef.current.forEach((p) => p.destroy());
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
  }, [roomId, userId, sendSignal, attachRemoteStream]);

  return {
    micOn,
    toggleMic,
    speakingPeers,
    audioEnabled: micOn,
    permissionError,
  };
}
