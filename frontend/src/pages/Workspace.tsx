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
} from 'lucide-react';

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
    'idle' | 'selecting' | 'ready' | 'previewing' | 'disposing'
  >('idle');
  const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
  const [contact, setContact] = useState<ContactCard | null>(null);
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
      const card = await getNextContact();
      if (card) {
        setContact(card);
        setPhase('previewing');
        setCallStarted(false);
        setCallEnded(false);
        setCallTimings({});
      } else {
        // No contact — poll again in 5s
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
    const now = new Date().toISOString();
    setCallTimings((t) => ({ ...t, accepted_at: now, dialed_at: now }));
    setCallStarted(true);
    setPhase('previewing'); // stays previewing visually
  }, [contact]);

  const handleCallConnected = () => {
    setCallTimings((t) => ({ ...t, answered_at: new Date().toISOString() }));
  };

  const handleHangUp = () => {
    setCallTimings((t) => ({
      ...t,
      disconnected_at: new Date().toISOString(),
    }));
    setCallEnded(true);
    setPhase('disposing');
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
  });

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
            className='w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg transition'
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

  if ((phase === 'previewing' || phase === 'disposing') && contact)
    return (
      <div className='min-h-screen bg-gray-50 p-4'>
        <div className='max-w-lg mx-auto'>
          {/* Campaign + attempt */}
          <div className='flex items-center justify-between mb-3'>
            <span className='text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded'>
              {contact.campaign_name}
            </span>
            <span className='text-xs text-gray-400'>
              Attempt #{contact.attempt_number}
            </span>
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
                  <div className='flex items-center gap-2 text-sm text-green-600 font-medium'>
                    <div className='w-2 h-2 bg-green-500 rounded-full animate-pulse' />
                    Call in progress
                  </div>
                  <div className='flex gap-2'>
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
                {dispCodesData?.data?.find((d: any) => d.id === dispCode)
                  ?.capability === 'RESCHEDULE' && (
                  <div>
                    <label className='text-xs text-gray-500 mb-1 block'>
                      Callback time
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
                    Notes
                  </label>
                  <textarea
                    value={dispNotes}
                    onChange={(e) => setDispNotes(e.target.value)}
                    rows={3}
                    placeholder='Optional notes...'
                    className='w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none'
                  />
                </div>
                <button
                  disabled={!dispCode || disposeMutation.isPending}
                  onClick={() => disposeMutation.mutate()}
                  className='w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition'
                >
                  <CheckCircle className='w-4 h-4' />
                  {disposeMutation.isPending ? 'Saving...' : 'Save & Continue'}
                </button>
              </div>
            </div>
          )}

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
