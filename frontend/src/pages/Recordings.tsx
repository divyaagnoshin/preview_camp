import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import {
  getRecordingsList,
  getRecordingAudio,
  saveRecordingRemark,
} from '../api/client';
import {
  Card,
  PagedTable,
  Button,
  Modal,
  Select,
  PageLoader,
  EmptyState,
} from '../components/ui';
import {
  Search,
  Filter,
  X,
  Play,
  Volume2,
} from 'lucide-react';

export default function RecordingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Filter state
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [callType, setCallType] = useState('Outbound');
  
  // Audio Modal State
  const [showAudio, setShowAudio] = useState(false);
  const [activeRecording, setActiveRecording] = useState<any>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [remarksInput, setRemarksInput] = useState('');
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  // Fetch data
  const { data: recordingsData, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['recordings', fromDate, toDate, callType, user?.orgId],
    queryFn: () =>
      getRecordingsList({
        fromdate: fromDate,
        todate: toDate,
        option: callType,
        companyid: '1',
      }),
    enabled: true,
  });

  const recordings = useMemo(() => Array.isArray(recordingsData) ? recordingsData : [], [recordingsData]);

  const saveRemarkMut = useMutation({
    mutationFn: () =>
      saveRecordingRemark({
        select: activeRecording.uuid || activeRecording.uuid1,
        text: remarksInput,
        company_id: '1',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recordings'] });
      setShowAudio(false);
    },
  });

  const handlePlayAudio = async (row: any) => {
    setActiveRecording(row);
    setRemarksInput(row.remarks || '');
    setShowAudio(true);
    setAudioSrc(null);
    setIsAudioLoading(true);
    
    try {
      const data = await getRecordingAudio({
        uuid: row.uuid || row.uuid1,
        date: row.date1, // format is usually DD-MM-YYYY
      });
      if (data && data.length > 0 && data[0].val) {
        const src = `data:audio/wav;base64,${data[0].val}`;
        setAudioSrc(src);
      }
    } catch (e) {
      console.error('Failed to load audio', e);
    } finally {
      setIsAudioLoading(false);
    }
  };

  const closeAudio = () => {
    setShowAudio(false);
    setActiveRecording(null);
    setAudioSrc(null);
    setRemarksInput('');
  };

  return (
    <div className="p-6 space-y-5">
      {/* ── Page header ── */}
      <div className="page-header-bar">
        <div>
          <h1 className="text-2xl font-bold page-heading" style={{ fontFamily: 'Sora, sans-serif' }}>
            Recordings
          </h1>
          <p className="text-sm text-[#7A5C44] mt-0.5">
            {recordings.length} {recordings.length === 1 ? 'recording' : 'recordings'} found
          </p>
        </div>
        <Button onClick={() => refetch()} icon={<Search className="w-4 h-4" />}>
          Search
        </Button>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-4 items-end bg-white p-4 rounded-2xl border-2 border-[#FFD0B0]">
        <div>
          <label className="block text-xs font-medium text-[#5C4030] mb-1.5">From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="border-2 border-[#FFD0B0] rounded-xl px-3 py-2 text-sm text-[#1A0F00] bg-white focus:outline-none focus:ring-4 focus:ring-[#F4521E]/40 focus:border-[#F4521E]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#5C4030] mb-1.5">To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="border-2 border-[#FFD0B0] rounded-xl px-3 py-2 text-sm text-[#1A0F00] bg-white focus:outline-none focus:ring-4 focus:ring-[#F4521E]/40 focus:border-[#F4521E]"
          />
        </div>
        <div className="min-w-[200px]">
          <Select
            label="Call Type"
            value={callType}
            onChange={(e) => setCallType(e.target.value)}
            options={[
              { value: 'Outbound', label: 'Outbound' },
            ]}
          />
        </div>
      </div>

      {/* ── Data Table ── */}
      <Card>
        {isLoading || isFetching ? (
          <div className="py-20 flex justify-center"><PageLoader /></div>
        ) : recordings.length === 0 ? (
          <EmptyState
            title="No recordings found"
            description="Adjust your date range or call type filter to find recordings."
            action={null}
          />
        ) : (
          <PagedTable
            cols={[
              { header: 'Date', render: (r: any) => r.date1 },
              { header: 'Time', render: (r: any) => r.time1 },
              { header: 'Caller Number', render: (r: any) => r.caller_number },
              { header: 'Duration', render: (r: any) => r.duration },
              { header: 'Skill/Campaign', render: (r: any) => r.skillname },
              { header: 'Agent', render: (r: any) => r.agentname },
              { header: 'Remarks', render: (r: any) => <span className="truncate max-w-[150px] inline-block" title={r.remarks}>{r.remarks || '-'}</span> },
              {
                header: 'Audio',
                width: '100px',
                render: (r: any) => (
                  <button
                    onClick={() => handlePlayAudio(r)}
                    className="p-1.5 rounded-md text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 transition border border-indigo-200"
                    title="Play Audio"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                )
              }
            ]}
            rows={recordings}
            keyFn={(r: any) => r.uuid || r.uuid1 || (r.date1 + r.time1)}
          />
        )}
      </Card>

      {/* ── Audio Modal ── */}
      <Modal
        title="Recording Audio"
        open={showAudio}
        onClose={closeAudio}
        size="md"
      >
        <div className="space-y-6">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[#1A0F00]">Audio File</span>
            {isAudioLoading ? (
              <div className="h-14 flex items-center justify-center bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-sm text-gray-500 animate-pulse">Loading audio...</span>
              </div>
            ) : audioSrc ? (
              <audio controls src={audioSrc} autoPlay className="w-full outline-none" />
            ) : (
              <div className="h-14 flex items-center justify-center bg-red-50 rounded-xl border border-red-200">
                <span className="text-sm text-red-600">Audio file not found.</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[#1A0F00]">Remarks</span>
            <textarea
              value={remarksInput}
              onChange={(e) => setRemarksInput(e.target.value)}
              placeholder="Enter text here..."
              className="w-full border-2 border-[#FFD0B0] rounded-xl p-3 text-sm text-[#1A0F00] bg-white focus:outline-none focus:ring-4 focus:ring-[#F4521E]/40 focus:border-[#F4521E] hover:border-[#FFB890] transition-all placeholder:text-[#B89070] resize-none"
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[#FFF0E8]">
            <Button
              variant="secondary"
              onClick={closeAudio}
            >
              Cancel
            </Button>
            <Button
              onClick={() => saveRemarkMut.mutate()}
              loading={saveRemarkMut.isPending}
            >
              Save Remarks
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
