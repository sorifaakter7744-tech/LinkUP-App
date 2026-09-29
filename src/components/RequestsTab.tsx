import React, { useState } from 'react';
import {
  Bell,
  Check,
  X,
  Send,
  Clock,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { FriendRequest } from '../types';
import { formatRelativeTime, getInitials } from '../utils/geo';

interface RequestsTabProps {
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  onAcceptRequest: (req: FriendRequest) => Promise<void>;
  onRejectRequest: (req: FriendRequest) => Promise<void>;
  onCancelRequest: (req: FriendRequest) => Promise<void>;
}

export const RequestsTab: React.FC<RequestsTabProps> = ({
  incomingRequests,
  outgoingRequests,
  onAcceptRequest,
  onRejectRequest,
  onCancelRequest,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendingIncoming = incomingRequests.filter(
    (r) => r.status === 'pending'
  );
  const pendingOutgoing = outgoingRequests.filter(
    (r) => r.status === 'pending'
  );

  return (
    <div className="h-full overflow-y-auto bg-slate-950 p-4 sm:p-5 pb-24 space-y-5">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Privacy Banner */}
        <div className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-300 leading-relaxed">
            <span className="font-bold text-white">Mutual Consent Only:</span>{' '}
            No one can see your location until you explicitly accept their friend request and enable Location Sharing.
          </div>
        </div>

        {/* Incoming Friend Requests */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-emerald-400" />
              <span>Incoming Friend Requests ({pendingIncoming.length})</span>
            </h2>
          </div>

          {pendingIncoming.length === 0 ? (
            <div className="p-6 rounded-2xl bg-slate-950/60 border border-slate-800/70 text-center space-y-1.5">
              <p className="text-sm font-bold text-slate-300">
                No pending incoming requests
              </p>
              <p className="text-xs text-slate-500">
                When a friend sends you a request, it will appear here in real time.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingIncoming.map((req) => {
                const timeInfo = formatRelativeTime(undefined, req.createdAt);
                return (
                  <div
                    key={req.id}
                    className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-extrabold text-slate-950 shrink-0"
                        style={{
                          backgroundColor: req.fromAvatarColor || '#10B981',
                        }}
                      >
                        {getInitials(req.fromName)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-white truncate">
                          {req.fromName}
                        </div>
                        <div className="text-xs font-mono-tech text-emerald-400 truncate">
                          @{req.fromUsername}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Received {timeInfo.relative}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        disabled={busyId === req.id}
                        onClick={async () => {
                          setBusyId(req.id);
                          try {
                            await onAcceptRequest(req);
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        {busyId === req.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>Accept</span>
                      </button>

                      <button
                        type="button"
                        disabled={busyId === req.id}
                        onClick={async () => {
                          setBusyId(req.id);
                          try {
                            await onRejectRequest(req);
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-rose-500/15 border border-slate-800 hover:border-rose-500/30 text-slate-300 hover:text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Decline</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Outgoing / Sent Friend Requests */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Send className="w-4 h-4 text-sky-400" />
              <span>Sent Friend Requests ({pendingOutgoing.length})</span>
            </h2>
          </div>

          {pendingOutgoing.length === 0 ? (
            <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800/70 text-center">
              <p className="text-xs text-slate-500">
                You have no pending outgoing friend requests.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {pendingOutgoing.map((req) => {
                const timeInfo = formatRelativeTime(undefined, req.createdAt);
                return (
                  <div
                    key={req.id}
                    className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-extrabold text-slate-950 shrink-0"
                        style={{
                          backgroundColor: req.toAvatarColor || '#3B82F6',
                        }}
                      >
                        {getInitials(req.toName)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">
                          {req.toName}
                        </div>
                        <div className="text-xs font-mono-tech text-slate-400 truncate">
                          @{req.toUsername} • Sent {timeInfo.relative}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-[11px] text-amber-400 font-semibold">
                        <Clock className="w-3 h-3" />
                        Pending
                      </span>
                      <button
                        type="button"
                        disabled={busyId === req.id}
                        onClick={async () => {
                          setBusyId(req.id);
                          try {
                            await onCancelRequest(req);
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-rose-500/15 border border-slate-800 hover:border-rose-500/30 text-xs font-semibold text-slate-400 hover:text-rose-300 transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
