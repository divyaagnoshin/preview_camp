// React hook wrapping a JsSIP UA registered against FreeSWITCH over WSS.
// Exposes a small imperative API (dial / hangup / mute / hold) plus a
// reactive state object the workspace UI binds to. The UA registers once
// per logged-in agent and is reused for every contact dialled.

import { useEffect, useRef, useState, useCallback } from 'react';
// JsSIP ships its own type declarations
import * as JsSIP from 'jssip';
import { getSipCredentials, SipCredentials } from '../api/client';

// Enable JsSIP's built-in SIP message logger — every REGISTER / INVITE /
// 4xx / 200 OK is dumped to the browser DevTools console as both pretty
// log lines and raw SIP packet bodies. Indispensable for diagnosing
// registration rejects and call setup failures.
JsSIP.debug.enable('JsSIP:*');

export type SipTraceEntry = {
  ts: number;
  direction: 'sent' | 'recv';
  preview: string; // first line of the SIP message (e.g. "INVITE sip:...")
  body: string;
};

export type CallState = 'idle' | 'calling' | 'ringing' | 'answered' | 'ended';

export interface SipPhone {
  ready: boolean;
  registered: boolean;
  callState: CallState;
  muted: boolean;
  onHold: boolean;
  error: string | null;
  // Lifecycle timestamps the workspace UI feeds into saveDisposition
  timings: {
    dialed_at?: string;
    answered_at?: string;
    disconnected_at?: string;
  };
  dial: (phoneNumber: string, interactionId: string) => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  trace: SipTraceEntry[];
  clearTrace: () => void;
}

const TRACE_LIMIT = 200;

// Normalises a contact phone number into the digits the FreeSWITCH outbound
// dialplan actually expects. Three rules, in order:
//   1. Strip everything that isn't a digit, +, * or #.
//   2. If the number is in E.164 form (starts with +), drop the + and dial
//      it as-is \u2014 the dialplan should already have an `^\d{11,}$` route
//      for international and we don't want to glue a national prefix onto a
//      country code.
//   3. Otherwise, if a `dialPrefix` is configured AND the cleaned digits
//      don't already start with it, prepend it. This is what turns the
//      contact's stored "9551011126" into "09551011126" so the trunk
//      route matches and we stop getting 484 Address Incomplete.
function normalizeDialString(raw: string, dialPrefix: string): string {
  const cleaned = raw.replace(/[^+\d*#]/g, '');
  if (cleaned.startsWith('+')) return cleaned.slice(1);
  if (dialPrefix && !cleaned.startsWith(dialPrefix)) {
    return dialPrefix + cleaned;
  }
  return cleaned;
}

// Wraps JsSIP's WebSocketInterface so every SIP frame sent to and received
// from the FreeSWITCH WSS is captured and forwarded to the React state via
// the supplied callback. Uses a Proxy so we don't have to re-implement the
// JsSIP socket contract; only `send` is intercepted, the rest is passthrough.
function makeTracingSocket(
  url: string,
  onFrame: (entry: SipTraceEntry) => void,
): JsSIP.WebSocketInterface {
  const inner = new JsSIP.WebSocketInterface(url);
  const origSend = inner.send.bind(inner);
  inner.send = (msg: string) => {
    onFrame({
      ts: Date.now(),
      direction: 'sent',
      preview: msg.split('\r\n', 1)[0] || '(empty)',
      body: msg,
    });
    return origSend(msg);
  };
  // JsSIP's WebSocketInterface fires `onMessage(msg)` after parsing; that
  // hook is on the prototype. We monkey-patch it to capture inbound frames
  // before they're handed off to JsSIP's parser.
  const origOnMessage = (inner as any).onMessage?.bind(inner);
  (inner as any).onMessage = (msg: string) => {
    onFrame({
      ts: Date.now(),
      direction: 'recv',
      preview: msg.split('\r\n', 1)[0] || '(empty)',
      body: msg,
    });
    if (origOnMessage) return origOnMessage(msg);
  };
  return inner;
}

export function useSipPhone(enabled: boolean): SipPhone {
  const uaRef = useRef<JsSIP.UA | null>(null);
  const sessionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const credsRef = useRef<SipCredentials | null>(null);

  const [ready, setReady] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [callState, setCallState] = useState<CallState>('idle');
  const [muted, setMuted] = useState(false);
  const [onHold, setOnHold] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timings, setTimings] = useState<SipPhone['timings']>({});
  const [trace, setTrace] = useState<SipTraceEntry[]>([]);

  const pushTrace = useCallback((entry: SipTraceEntry) => {
    setTrace((prev) => {
      const next = prev.concat(entry);
      return next.length > TRACE_LIMIT ? next.slice(-TRACE_LIMIT) : next;
    });
  }, []);

  const clearTrace = useCallback(() => setTrace([]), []);

  // Lazy-create the hidden <audio> sink the remote (FreeSWITCH-bridged)
  // stream is piped into. `playsinline` is required for Safari/iOS to play
  // without entering fullscreen. We also pin volume=1 + muted=false so a
  // stale browser state can't silently silence the call.
  useEffect(() => {
    if (audioRef.current) return;
    const el = document.createElement('audio');
    el.autoplay = true;
    el.setAttribute('playsinline', '');
    el.muted = false;
    el.volume = 1.0;
    el.style.display = 'none';
    document.body.appendChild(el);
    audioRef.current = el;
    return () => {
      el.srcObject = null;
      el.remove();
      audioRef.current = null;
    };
  }, []);

  // Fetch creds + start UA when enabled
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const creds = await getSipCredentials();
        if (cancelled) return;
        credsRef.current = creds;

        const socket = makeTracingSocket(creds.wss_url, pushTrace);
        const ua = new JsSIP.UA({
          sockets: [socket],
          uri: `sip:${creds.extension}@${creds.sip_domain}`,
          password: creds.password,
          display_name: creds.caller_id_name,
          register: true,
          session_timers: false,
        });

        ua.on('registered', () => setRegistered(true));
        ua.on('unregistered', () => setRegistered(false));
        ua.on('registrationFailed', (e: any) => {
          setRegistered(false);
          setError(`SIP registration failed: ${e.cause}`);
        });
        ua.on('disconnected', () => setRegistered(false));

        ua.start();
        uaRef.current = ua;
        setReady(true);
      } catch (err: any) {
        setError(`Failed to load SIP credentials: ${err?.message || err}`);
      }
    })();
    return () => {
      cancelled = true;
      try {
        sessionRef.current?.terminate();
      } catch {
        /* no-op */
      }
      try {
        uaRef.current?.stop();
      } catch {
        /* no-op */
      }
      uaRef.current = null;
      sessionRef.current = null;
      setReady(false);
      setRegistered(false);
    };
  }, [enabled]);

  // Pipes a MediaStream into the hidden <audio> sink and forces playback.
  // Without the explicit play() call Chrome silently drops audio when its
  // autoplay heuristic decides the page hasn't earned playback rights yet
  // (the dial() call is triggered by the agent's Accept click, which IS a
  // user gesture, so play() should resolve \u2014 but we still surface any
  // rejection into the SIP trace so the agent can see it).
  const attachRemoteStream = useCallback(
    (stream: MediaStream) => {
      const el = audioRef.current;
      if (!el || !stream) return;
      if (el.srcObject === stream) return;
      el.srcObject = stream;
      const playPromise = el.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch((err) => {
          pushTrace({
            ts: Date.now(),
            direction: 'recv',
            preview: `[audio] play() blocked: ${err?.name || 'Error'}`,
            body: String(err?.message || err),
          });
          setError(
            `Browser blocked audio playback (${err?.name || 'Error'}). Click anywhere on the page and try again.`,
          );
        });
      }
    },
    [pushTrace],
  );

  const attachSessionHandlers = useCallback(
    (session: any) => {
      session.on('progress', () => setCallState('ringing'));
      session.on('accepted', () => {
        setCallState('answered');
        setTimings((t) => ({ ...t, answered_at: new Date().toISOString() }));
      });
      session.on('confirmed', () => setCallState('answered'));
      session.on('failed', (e: any) => {
        setCallState('ended');
        setTimings((t) => ({
          ...t,
          disconnected_at: new Date().toISOString(),
        }));
        setError(`Call failed: ${e?.cause || 'unknown'}`);
      });
      session.on('ended', () => {
        setCallState('ended');
        setTimings((t) => ({
          ...t,
          disconnected_at: new Date().toISOString(),
        }));
      });
      session.on('peerconnection', (e: any) => {
        const pc: RTCPeerConnection = e.peerconnection;

        // Modern API: the `track` event fires once per remote track when the
        // SDP answer is processed. ev.streams[0] is the canonical path; when
        // FreeSWITCH (or some intermediate) doesn't tag the track with a
        // stream id we fall back to wrapping ev.track in a fresh stream.
        pc.addEventListener('track', (ev) => {
          if (ev.streams && ev.streams[0]) {
            attachRemoteStream(ev.streams[0]);
          } else if (ev.track) {
            attachRemoteStream(new MediaStream([ev.track]));
          }
        });

        // Legacy fallback for older WebRTC stacks that still fire
        // `addstream` instead of `track`. Harmless when both fire.
        pc.addEventListener('addstream' as any, (ev: any) => {
          if (ev.stream) attachRemoteStream(ev.stream);
        });

        // ICE diagnostics surfaced to the SIP trace so a stuck
        // 'checking' / 'failed' state is visible without DevTools.
        pc.addEventListener('iceconnectionstatechange', () => {
          pushTrace({
            ts: Date.now(),
            direction: 'recv',
            preview: `[ice] ${pc.iceConnectionState}`,
            body: `iceConnectionState=${pc.iceConnectionState}`,
          });
        });
      });
    },
    [attachRemoteStream, pushTrace],
  );

  const dial = useCallback(
    (phoneNumber: string, interactionId: string) => {
      const ua = uaRef.current;
      const creds = credsRef.current;
      if (!ua || !creds) {
        setError('SIP phone not ready');
        return;
      }
      setError(null);
      setMuted(false);
      setOnHold(false);
      setTimings({ dialed_at: new Date().toISOString() });
      setCallState('calling');

      const target = `sip:${normalizeDialString(phoneNumber, creds.dial_prefix)}@${creds.sip_domain}`;
      // Build the ICE server list defensively. Empty / whitespace URLs are
      // rejected by RTCPeerConnection (which would abort PC creation and
      // produce a SIP-only call with no media path), so we drop them.
      // Order: STUN first (cheap, host/srflx discovery), TURN second
      // (fallback relay when symmetric NAT blocks the srflx path).
      const iceServers: RTCIceServer[] = [];
      if (creds.stun_url && creds.stun_url.trim()) {
        iceServers.push({ urls: creds.stun_url.trim() });
      }
      if (creds.turn_url && creds.turn_url.trim()) {
        iceServers.push({
          urls: creds.turn_url.trim(),
          username: creds.turn_username || undefined,
          credential: creds.turn_password || undefined,
        });
      }
      // When force_turn is on we tell the browser to discard host/srflx
      // candidates and only emit `relay` ones \u2014 guarantees the RTP path
      // goes through TURN regardless of NAT topology.
      const pcConfig: RTCConfiguration = { iceServers };
      if (creds.force_turn && creds.turn_url) {
        pcConfig.iceTransportPolicy = 'relay';
      }
      const session = ua.call(target, {
        mediaConstraints: { audio: true, video: false },
        rtcOfferConstraints: {
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        },
        pcConfig,
        extraHeaders: [`X-Interaction-Id: ${interactionId}`],
      });
      sessionRef.current = session;
      attachSessionHandlers(session);
    },
    [attachSessionHandlers],
  );

  const hangup = useCallback(() => {
    try {
      sessionRef.current?.terminate();
    } catch {
      /* no-op */
    }
  }, []);

  const toggleMute = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (muted) {
      session.unmute({ audio: true });
      setMuted(false);
    } else {
      session.mute({ audio: true });
      setMuted(true);
    }
  }, [muted]);

  const toggleHold = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    if (onHold) {
      session.unhold();
      setOnHold(false);
    } else {
      session.hold();
      setOnHold(true);
    }
  }, [onHold]);

  return {
    ready,
    registered,
    callState,
    muted,
    onHold,
    error,
    timings,
    dial,
    hangup,
    toggleMute,
    toggleHold,
    trace,
    clearTrace,
  };
}
