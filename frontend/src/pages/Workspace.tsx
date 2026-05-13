import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getJobs,
  goReady,
  getNextContact,
  rejectContact,
  saveDisposition,
  sendHeartbeat,
  goOffline,
  getDispositionCodes,
} from '../api/client';
import { useAuth } from '../hooks/useAuth';
import {
  Phone,
  PhoneOff,
  UserX,
  CheckCircle,
  Clock,
  RefreshCw,
  Mic,
  MicOff,
  Pause,
  Play,
} from 'lucide-react';
import { useSipPhone, SipTraceEntry } from '../hooks/useSipPhone';

const REJECT_REASONS = [
  { code: 'NOT_READY', label: 'Not Ready' },
  { code: 'NEED_BREAK', label: 'Need Break' },
  { code: 'SKILL_MISMATCH', label: 'Skill Mismatch' },
  { code: 'TECHNICAL_ISSUE', label: 'Technical Issue' },
  { code: 'SUPERVISOR_HOLD', label: 'Supervisor Hold' },
];

interface ContactCard {
  interaction_id: string;
  ccs_id: string;
  contact_id: string;
  job_id: string;
  campaign_name: string;
  phone_number: string;
  first_name: string;
  last_name: string;
  attempt_number: number;
  priority: number;
  assigned_agent_id: string | null;
  custom_fields: Record<string, any>;
  field_definitions: {
    field_key: string;
    field_label: string;
    data_type: string;
    field_type: string;
    display_order: number;
  }[];
  auto_dial_in_sec: number;
  given_at: string;
}

export default function WorkspacePage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [phase, setPhase] = useState<
    'idle' | 'selecting' | 'ready' | 'previewing' | 'disposing' | 'completed'
  >('idle');
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [contact, setContact] = useState<ContactCard | null>(null);
  const [completedInfo, setCompletedInfo] = useState<{
    total: number;
    completed: number;
    with_agent: number;
    waiting: number;
  } | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [callStarted, setCallStarted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [dispCode, setDispCode] = useState('');
  const [dispNotes, setDispNotes] = useState('');
  const [rescheduleAt, setRescheduleAt] = useState('');
  const [callTimings, setCallTimings] = useState<{
    accepted_at?: string;
    dialed_at?: string;
    answered_at?: string;
    disconnected_at?: string;
  }>({});

  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const fetchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // SIP softphone — registers against FreeSWITCH WSS as soon as the agent
  // moves past the idle/selecting phases and stays registered for the
  // lifetime of the workspace session.
  const phone = useSipPhone(phase !== 'idle' && phase !== 'selecting');

  // Mirror the SIP session's lifecycle timestamps into the local
  // callTimings used by saveDisposition so the disposition payload is
  // accurate even when the call ended via remote hangup / network drop.
  useEffect(() => {
    setCallTimings((t) => ({ ...t, ...phone.timings }));
  }, [phone.timings]);

  // Remote hangup: when JsSIP fires 'ended' or 'failed', flip the UI to
  // the disposition phase so the agent can wrap up.
  useEffect(() => {
    if (phone.callState === 'ended' && callStarted && !callEnded) {
      setCallEnded(true);
      setPhase('disposing');
    }
  }, [phone.callState, callStarted, callEnded]);

  // Heartbeat
  useEffect(() => {
    if (phase === 'idle' || phase === 'selecting') return;
    heartbeatRef.current = setInterval(
      () => sendHeartbeat().catch(() => {}),
      20000,
    );
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [phase]);

  // Auto-dial countdown
  useEffect(() => {
    if (phase !== 'previewing' || !contact) return;
    setCountdown(contact.auto_dial_in_sec);
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(t);
          handleAccept();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, contact?.interaction_id]);

  const { data: jobsData } = useQuery({
    queryKey: ['jobs', 'active'],
    queryFn: () => getJobs({ status: 'active' }),
    enabled: phase === 'selecting',
  });

  const { data: dispCodesData } = useQuery({
    queryKey: ['disposition-codes'],
    queryFn: () => getDispositionCodes(),
    enabled: phase === 'disposing',
  });

  const fetchNext = useCallback(async () => {
    try {
      const resp = await getNextContact();
      if (resp && (resp as any).exhausted) {
        // Backend confirms every CCS row on the selected jobs is in a
        // terminal state — stop polling and show a final screen.
        setCompletedInfo((resp as any).breakdown || null);
        setPhase('completed');
        return;
      }
      if (resp) {
        setContact(resp as ContactCard);
        setPhase('previewing');
        setCallStarted(false);
        setCallEnded(false);
        setCallTimings({});
      } else {
        // No contact right now — poll again in 5s
        fetchTimerRef.current = setTimeout(fetchNext, 5000);
      }
    } catch {
      fetchTimerRef.current = setTimeout(fetchNext, 5000);
    }
  }, []);

  const readyMutation = useMutation({
    mutationFn: (jobIds: string[]) => goReady(jobIds),
    onSuccess: () => {
      setPhase('ready');
      fetchNext();
    },
    onError: (err: any) => {
      // Surface backend errors (e.g. inactive job, missing session table
      // constraint) instead of failing silently and leaving the button stuck.
      alert(
        `Could not go ready: ${err?.response?.data?.error || err?.message || 'Unknown error'}`,
      );
    },
  });

  const handleAccept = useCallback(() => {
    if (!contact) return;
    if (!phone.registered) {
      alert(
        phone.error ||
          'Softphone is not registered with FreeSWITCH yet — please wait a moment and try again.',
      );
      return;
    }
    const now = new Date().toISOString();
    setCallTimings((t) => ({ ...t, accepted_at: now }));
    setCallStarted(true);
    setPhase('previewing'); // stays previewing visually
    // Place the actual SIP INVITE through FreeSWITCH. dialed_at /
    // answered_at / disconnected_at are populated by the hook from
    // JsSIP session events.
    phone.dial(contact.phone_number, contact.interaction_id);
  }, [contact, phone]);

  const handleCallConnected = () => {
    // Manual fallback if the SIP 'accepted' event was missed (rare). The
    // sync effect won't overwrite an existing answered_at.
    setCallTimings((t) => ({
      ...t,
      answered_at: t.answered_at || new Date().toISOString(),
    }));
  };

  const handleHangUp = () => {
    // Tearing down the SIP session triggers JsSIP's 'ended' event, which
    // the sync effect translates into disconnected_at + phase=disposing.
    phone.hangup();
  };

  const rejectMutation = useMutation({
    mutationFn: () => rejectContact(contact!.interaction_id, rejectReason),
    onSuccess: () => {
      setContact(null);
      setShowRejectModal(false);
      setPhase('ready');
      fetchNext();
    },
  });

  const disposeMutation = useMutation({
    mutationFn: () =>
      saveDisposition({
        interaction_id: contact!.interaction_id,
        disposition_code_id: dispCode,
        accepted_at: callTimings.accepted_at,
        dialed_at: callTimings.dialed_at,
        answered_at: callTimings.answered_at || null,
        disconnected_at: callTimings.disconnected_at,
        call_status: callTimings.answered_at ? 'connected' : 'no_answer',
        reschedule_at: rescheduleAt || null,
        notes: dispNotes || null,
      }),
    onSuccess: () => {
      setContact(null);
      setDispCode('');
      setDispNotes('');
      setRescheduleAt('');
      setPhase('ready');
      fetchNext();
    },
    // Surface the backend's reason instead of failing silently \u2014 most
    // common cause is a CLOSED disposition with notes_required=true and
    // an empty Notes field (e.g. PROMISE_TO_PAY).
    onError: (err: any) => {
      alert(
        `Could not save disposition: ${
          err?.response?.data?.error || err?.message || 'Unknown error'
        }`,
      );
    },
  });

  // Selected disposition code metadata (used to drive notes-required
  // styling and the Save button's enabled state).
  const selectedDispCode = dispCodesData?.data?.find(
    (d: any) => d.id === dispCode,
  );
  const notesRequired = !!selectedDispCode?.notes_required;
  const rescheduleRequired =
    selectedDispCode?.capability === 'RESCHEDULE' &&
    !selectedDispCode?.retry_delay_min;
  const canSaveDisposition =
    !!dispCode &&
    (!notesRequired || dispNotes.trim().length > 0) &&
    (!rescheduleRequired || !!rescheduleAt) &&
    !disposeMutation.isPending;

  // ── RENDER ─────────────────────────────────────────────────────────

  if (phase === 'idle')
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <div className='bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-md text-center'>
          <div className='w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4'>
            <Phone className='w-8 h-8 text-indigo-600' />
          </div>
          <h1 className='text-xl font-semibold text-gray-900 mb-1'>
            Agent Workspace
          </h1>
          <p className='text-gray-500 text-sm mb-6'>
            Welcome, {user?.firstName}. Select jobs to start working.
          </p>
          <button
            onClick={() => setPhase('selecting')}
            className='w-full bg-gradient-to-r from-[#F4521E] to-[#F5A623] text-white font-medium py-2.5 rounded-lg transition'
          >
            Get Started
          </button>
        </div>
      </div>
    );

  if (phase === 'selecting')
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <div className='bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-md'>
          <h2 className='text-lg font-semibold mb-4 text-gray-900'>
            Select Active Jobs
          </h2>
          {jobsData?.data?.length === 0 && (
            <p className='text-gray-400 text-sm text-center py-4'>
              No active jobs available.
            </p>
          )}
          <div className='space-y-2 mb-6'>
            {jobsData?.data?.map((job: any) => (
              <label
                key={job.id}
                className='flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50'
              >
                <input
                  type='checkbox'
                  value={job.id}
                  checked={selectedJobs.includes(job.id)}
                  onChange={(e) =>
                    setSelectedJobs((p) =>
                      e.target.checked
                        ? [...p, job.id]
                        : p.filter((x) => x !== job.id),
                    )
                  }
                  className='w-4 h-4 text-indigo-600 rounded'
                />
                <div>
                  <div className='font-medium text-sm text-gray-900'>
                    {job.campaign_name}
                  </div>
                  <div className='text-xs text-gray-400'>
                    Run #{job.job_run_number} · {job.total_contacts} contacts
                  </div>
                </div>
              </label>
            ))}
          </div>
          <button
            disabled={!selectedJobs.length || readyMutation.isPending}
            onClick={() => readyMutation.mutate(selectedJobs)}
            className='w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition'
          >
            {readyMutation.isPending ? 'Starting...' : 'Go Ready'}
          </button>
        </div>
      </div>
    );

  if (phase === 'ready')
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center'>
        <div className='text-center'>
          <RefreshCw className='w-10 h-10 text-indigo-400 animate-spin mx-auto mb-4' />
          <p className='text-gray-600 font-medium'>
            Looking for next contact...
          </p>
          <p className='text-gray-400 text-sm mt-1'>
            You will be connected automatically
          </p>
        </div>
      </div>
    );

  if (phase === 'completed')
    return (
      <div className='min-h-screen bg-gray-50 flex items-center justify-center p-4'>
        <div className='bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-md text-center'>
          <div className='w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4'>
            <CheckCircle className='w-8 h-8 text-green-600' />
          </div>
          <h1 className='text-xl font-semibold text-gray-900 mb-1'>
            All contacts processed
          </h1>
          <p className='text-gray-500 text-sm mb-6'>
            {completedInfo && completedInfo.total > 0
              ? `Every contact in the selected ${
                  selectedJobs.length === 1 ? 'job' : 'jobs'
                } has been completed (${completedInfo.completed} of ${completedInfo.total}).`
              : 'There are no contacts left to dispatch on the selected jobs.'}
          </p>
          <button
            onClick={() => {
              setCompletedInfo(null);
              setSelectedJobs([]);
              setPhase('selecting');
            }}
            className='w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg transition'
          >
            Pick different jobs
          </button>
          <button
            onClick={() => {
              goOffline().catch(() => {});
              setCompletedInfo(null);
              setSelectedJobs([]);
              setPhase('idle');
            }}
            className='w-full mt-2 text-gray-500 hover:text-gray-700 text-sm py-2'
          >
            Go offline
          </button>
        </div>
      </div>
    );

  if ((phase === 'previewing' || phase === 'disposing') && contact)
    return (
      <div className='min-h-screen bg-gray-50 p-4'>
        <div className='max-w-lg mx-auto'>
          {/* Campaign + attempt */}
          <div className='flex items-center justify-between mb-3'>
            <span className='text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded'>
              {contact.campaign_name}
            </span>
            <div className='flex items-center gap-2'>
              <span
                className={`flex items-center gap-1 text-xs ${
                  phone.registered ? 'text-green-600' : 'text-gray-400'
                }`}
                title={phone.error || ''}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    phone.registered ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                />
                {phone.registered ? 'SIP ready' : 'SIP…'}
              </span>
              <span className='text-xs text-gray-400'>
                Attempt #{contact.attempt_number}
              </span>
            </div>
          </div>

          {/* Contact card */}
          <div className='bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-4'>
            <div className='bg-gradient-to-r from-indigo-600 to-indigo-700 p-5'>
              <div className='text-white'>
                <h2 className='text-2xl font-bold'>
                  {contact.first_name} {contact.last_name}
                </h2>
                <p className='text-indigo-200 text-lg mt-1'>
                  {contact.phone_number}
                </p>
                {contact.assigned_agent_id && (
                  <span className='inline-block mt-2 text-xs bg-white/20 px-2 py-0.5 rounded-full'>
                    Assigned to you
                  </span>
                )}
              </div>
            </div>

            {/* Custom fields */}
            {contact.field_definitions.length > 0 && (
              <div className='p-4 border-b border-gray-100'>
                <div className='grid grid-cols-2 gap-3'>
                  {contact.field_definitions.map((f) => (
                    <div key={f.field_key}>
                      <div className='text-xs text-gray-400 mb-0.5'>
                        {f.field_label}
                      </div>
                      <div className='text-sm font-medium text-gray-900'>
                        {contact.custom_fields[f.field_key] ?? '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Call controls */}
            <div className='p-4'>
              {!callStarted && phase === 'previewing' && (
                <div className='flex items-center gap-3'>
                  <button
                    onClick={handleAccept}
                    className='flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-lg transition'
                  >
                    <Phone className='w-4 h-4' />
                    Accept {countdown > 0 && `(${countdown}s)`}
                  </button>
                  <button
                    onClick={() => setShowRejectModal(true)}
                    className='flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 rounded-lg transition'
                  >
                    <UserX className='w-4 h-4' /> Reject
                  </button>
                </div>
              )}
              {callStarted && !callEnded && (
                <div className='space-y-2'>
                  <div className='flex items-center gap-2 text-sm font-medium'>
                    <div
                      className={`w-2 h-2 rounded-full ${
                        phone.callState === 'answered'
                          ? 'bg-green-500 animate-pulse'
                          : 'bg-yellow-500 animate-pulse'
                      }`}
                    />
                    <span
                      className={
                        phone.callState === 'answered'
                          ? 'text-green-600'
                          : 'text-yellow-600'
                      }
                    >
                      {phone.callState === 'calling' && 'Dialing…'}
                      {phone.callState === 'ringing' && 'Ringing…'}
                      {phone.callState === 'answered' && 'Call in progress'}
                      {phone.callState === 'idle' && 'Connecting…'}
                    </span>
                  </div>
                  <div className='flex gap-2'>
                    <button
                      onClick={phone.toggleMute}
                      disabled={phone.callState !== 'answered'}
                      className={`flex-1 flex items-center justify-center gap-1 text-sm py-2 rounded-lg transition disabled:opacity-50 ${
                        phone.muted
                          ? 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                    >
                      {phone.muted ? (
                        <MicOff className='w-3.5 h-3.5' />
                      ) : (
                        <Mic className='w-3.5 h-3.5' />
                      )}
                      {phone.muted ? 'Unmute' : 'Mute'}
                    </button>
                    <button
                      onClick={phone.toggleHold}
                      disabled={phone.callState !== 'answered'}
                      className={`flex-1 flex items-center justify-center gap-1 text-sm py-2 rounded-lg transition disabled:opacity-50 ${
                        phone.onHold
                          ? 'bg-amber-100 hover:bg-amber-200 text-amber-800'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                    >
                      {phone.onHold ? (
                        <Play className='w-3.5 h-3.5' />
                      ) : (
                        <Pause className='w-3.5 h-3.5' />
                      )}
                      {phone.onHold ? 'Resume' : 'Hold'}
                    </button>
                    <button
                      onClick={handleCallConnected}
                      className='flex-1 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 py-2 rounded-lg transition'
                    >
                      Mark Connected
                    </button>
                    <button
                      onClick={handleHangUp}
                      className='flex-1 flex items-center justify-center gap-1 bg-red-600 hover:bg-red-700 text-white text-sm py-2 rounded-lg transition'
                    >
                      <PhoneOff className='w-3.5 h-3.5' /> Hang Up
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Disposition form */}
          {phase === 'disposing' && (
            <div className='bg-white rounded-xl border border-gray-200 shadow-sm p-4'>
              <h3 className='font-semibold text-gray-900 mb-3'>
                Save Disposition
              </h3>
              <div className='space-y-3'>
                <div>
                  <label className='text-xs text-gray-500 mb-1 block'>
                    Outcome *
                  </label>
                  <select
                    value={dispCode}
                    onChange={(e) => setDispCode(e.target.value)}
                    className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm'
                  >
                    <option value=''>Select outcome...</option>
                    {dispCodesData?.data?.map((dc: any) => (
                      <option key={dc.id} value={dc.id}>
                        [{dc.capability}] {dc.label}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Reschedule time if RESCHEDULE capability */}
                {selectedDispCode?.capability === 'RESCHEDULE' && (
                  <div>
                    <label className='text-xs text-gray-500 mb-1 block'>
                      Callback time {rescheduleRequired && '*'}
                    </label>
                    <input
                      type='datetime-local'
                      value={rescheduleAt}
                      onChange={(e) => setRescheduleAt(e.target.value)}
                      className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm'
                    />
                  </div>
                )}
                <div>
                  <label className='text-xs text-gray-500 mb-1 block'>
                    Notes{' '}
                    {notesRequired && <span className='text-red-600'>*</span>}
                  </label>
                  <textarea
                    value={dispNotes}
                    onChange={(e) => setDispNotes(e.target.value)}
                    rows={3}
                    placeholder={
                      notesRequired
                        ? 'Notes are required for this disposition...'
                        : 'Optional notes...'
                    }
                    className={`w-full border rounded-lg px-3 py-2 text-sm resize-none ${
                      notesRequired && !dispNotes.trim()
                        ? 'border-red-300 focus:border-red-500'
                        : 'border-gray-200'
                    }`}
                  />
                </div>
                <button
                  disabled={!canSaveDisposition}
                  onClick={() => disposeMutation.mutate()}
                  className='w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#F4521E] to-[#F5A623] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition'
                >
                  <CheckCircle className='w-4 h-4' />
                  {disposeMutation.isPending ? 'Saving...' : 'Save & Continue'}
                </button>
              </div>
            </div>
          )}

          {/* SIP trace — every REGISTER / INVITE / response sent to or
              received from FreeSWITCH, captured straight off the WSS so
              the agent can diagnose registration/dial failures without
              needing to open DevTools. */}
          <SipTracePanel trace={phone.trace} onClear={phone.clearTrace} />

          {/* Reject modal */}
          {showRejectModal && (
            <div className='fixed inset-0 bg-black/40 flex items-end justify-center z-50 p-4'>
              <div className='bg-white rounded-xl w-full max-w-sm p-5'>
                <h3 className='font-semibold text-gray-900 mb-1'>
                  Reject Contact
                </h3>
                <p className='text-xs text-gray-400 mb-3'>
                  Select the reason why you cannot take this contact right now.
                </p>
                <div className='space-y-2 mb-4'>
                  {REJECT_REASONS.map((r) => (
                    <label
                      key={r.code}
                      className='flex items-center gap-2 cursor-pointer'
                    >
                      <input
                        type='radio'
                        name='reject'
                        value={r.code}
                        checked={rejectReason === r.code}
                        onChange={() => setRejectReason(r.code)}
                        className='text-indigo-600'
                      />
                      <span className='text-sm text-gray-700'>{r.label}</span>
                    </label>
                  ))}
                </div>
                <div className='flex gap-2'>
                  <button
                    onClick={() => setShowRejectModal(false)}
                    className='flex-1 py-2 rounded-lg border text-sm text-gray-600 hover:bg-gray-50'
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!rejectReason || rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate()}
                    className='flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium'
                  >
                    {rejectMutation.isPending ? '...' : 'Reject'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );

  return null;
}

// Collapsible viewer for the SIP frames captured by useSipPhone. Each row
// shows the SIP request/response start-line; clicking it expands the full
// raw packet so the agent (or a supporting engineer) can inspect headers,
// To/From URIs, auth challenges and SDP without leaving the workspace.
function SipTracePanel({
  trace,
  onClear,
}: {
  trace: SipTraceEntry[];
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to newest frame whenever the panel is open and a frame arrives
  useEffect(() => {
    if (!open || !scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [trace, open]);

  return (
    <div className='bg-white rounded-xl border border-gray-200 mt-4 overflow-hidden'>
      <button
        onClick={() => setOpen((o) => !o)}
        className='w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 text-left'
      >
        <span className='text-sm font-semibold text-gray-700'>
          SIP trace{' '}
          <span className='text-xs text-gray-400 font-normal'>
            ({trace.length} frame{trace.length === 1 ? '' : 's'})
          </span>
        </span>
        <span className='text-xs text-gray-500'>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div>
          <div className='flex items-center justify-between px-4 py-1 border-b border-gray-100 text-xs text-gray-500'>
            <span>
              Newest at the bottom. Click a row to view the raw packet.
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(null);
                onClear();
              }}
              className='text-indigo-600 hover:text-indigo-700'
            >
              Clear
            </button>
          </div>
          <div
            ref={scrollerRef}
            className='max-h-64 overflow-y-auto font-mono text-xs'
          >
            {trace.length === 0 ? (
              <div className='px-4 py-6 text-center text-gray-400'>
                No SIP frames yet. Frames appear here as soon as the UA connects
                to FreeSWITCH.
              </div>
            ) : (
              trace.map((entry, i) => {
                const isOpen = expanded === i;
                const arrow = entry.direction === 'sent' ? '→' : '←';
                const colour =
                  entry.direction === 'sent'
                    ? 'text-emerald-700'
                    : 'text-sky-700';
                const time = new Date(entry.ts).toISOString().substring(11, 23);
                return (
                  <div key={i} className='border-b border-gray-50'>
                    <button
                      onClick={() => setExpanded(isOpen ? null : i)}
                      className='w-full flex items-start gap-2 px-3 py-1 hover:bg-gray-50 text-left'
                    >
                      <span className='text-gray-400'>{time}</span>
                      <span className={`${colour} font-semibold`}>{arrow}</span>
                      <span className='text-gray-700 truncate'>
                        {entry.preview}
                      </span>
                    </button>
                    {isOpen && (
                      <pre className='whitespace-pre-wrap break-all bg-gray-900 text-gray-100 px-3 py-2 text-[11px]'>
                        {entry.body}
                      </pre>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
