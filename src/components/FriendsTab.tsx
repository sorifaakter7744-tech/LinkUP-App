import React, { useEffect, useState } from 'react';
import {
  Search,
  UserPlus,
  Check,
  Clock,
  MapPin,
  Copy,
  CheckCircle2,
  UserMinus,
  EyeOff,
  Radio,
  Users,
  Sparkles,
  Loader2,
} from 'lucide-react';
import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError } from '../firebase';
import {
  FriendRequest,
  OperationType,
  UserLocation,
  UserProfile,
} from '../types';
import {
  calculateDistanceMeters,
  formatDistance,
  formatRelativeTime,
  getInitials,
  sanitizeUsername,
} from '../utils/geo';

interface FriendsTabProps {
  profile: UserProfile;
  myCoords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    updatedAtMs: number;
  } | null;
  friendProfiles: UserProfile[];
  friendLocations: Record<string, UserLocation>;
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  onSendFriendRequest: (targetUser: UserProfile) => Promise<void>;
  onAcceptRequest: (req: FriendRequest) => Promise<void>;
  onRemoveFriend: (friendUid: string) => Promise<void>;
  onFocusFriendOnMap: (friendUid: string) => void;
}

export const FriendsTab: React.FC<FriendsTabProps> = ({
  profile,
  myCoords,
  friendProfiles,
  friendLocations,
  incomingRequests,
  outgoingRequests,
  onSendFriendRequest,
  onAcceptRequest,
  onRemoveFriend,
  onFocusFriendOnMap,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [copiedUsername, setCopiedUsername] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [confirmRemoveUid, setConfirmRemoveUid] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const handleCopyMyUsername = async () => {
    try {
      await navigator.clipboard.writeText(`@${profile.username}`);
      setCopiedUsername(true);
      setTimeout(() => setCopiedUsername(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleSearchUsers = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleaned = sanitizeUsername(searchQuery);
    if (!cleaned) {
      setSearchResults([]);
      setHasSearched(false);
      setSearchError(null);
      return;
    }

    if (!navigator.onLine) {
      setSearchError(
        'Internet unavailable. Please reconnect to search for friends by username.'
      );
      return;
    }

    setSearching(true);
    setHasSearched(true);
    setSearchError(null);
    try {
      // Prefix search on usernameLower
      const q = query(
        collection(db, 'users'),
        where('usernameLower', '>=', cleaned),
        where('usernameLower', '<=', cleaned + '\uf8ff'),
        limit(15)
      );
      const snap = await getDocs(q);
      const results: UserProfile[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as UserProfile;
        if (data.uid !== profile.uid) {
          results.push(data);
        }
      });
      setSearchResults(results);
    } catch (err: any) {
      console.error('Friend search error:', err);
      setSearchError(
        'Could not search usernames right now. Please check your connection and try again.'
      );
    } finally {
      setSearching(false);
    }
  };

  // Trigger live search as user types
  useEffect(() => {
    const cleaned = sanitizeUsername(searchQuery);
    if (cleaned.length < 1) {
      setSearchResults([]);
      setHasSearched(false);
      setSearchError(null);
      return;
    }
    const timeout = setTimeout(() => {
      handleSearchUsers();
    }, 280);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const handleSendRequestClick = async (targetUser: UserProfile) => {
    if (!navigator.onLine) {
      setSearchError(
        'Internet unavailable. Reconnect to send friend requests.'
      );
      return;
    }
    setBusyUid(targetUser.uid);
    setFeedbackBanner(null);
    setSearchError(null);
    try {
      await onSendFriendRequest(targetUser);
      setFeedbackBanner(
        `Friend request sent to ${targetUser.displayName} (@${targetUser.username})!`
      );
    } catch (err: any) {
      setSearchError(err?.message || 'Could not send friend request.');
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-950 p-4 sm:p-5 pb-24 space-y-5">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header + Your Shareable Handle Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              Your Friend Handle
            </span>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-white">
                {profile.displayName}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-xs font-mono-tech text-emerald-400">
                @{profile.username}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Share your username with friends so they can search and add you.
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopyMyUsername}
            className="px-4 py-2.5 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-200 flex items-center justify-center gap-2 shrink-0 transition cursor-pointer"
          >
            {copiedUsername ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">Copied @{profile.username}</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-400" />
                <span>Copy @{profile.username}</span>
              </>
            )}
          </button>
        </div>

        {feedbackBanner && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{feedbackBanner}</span>
          </div>
        )}

        {searchError && (
          <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs font-semibold flex items-center gap-2">
            <span>{searchError}</span>
          </div>
        )}

        {/* Search Friends by Username */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Search className="w-4 h-4 text-emerald-400" />
              <span>Search Friends by Username</span>
            </h3>
          </div>

          <form onSubmit={handleSearchUsers} className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by @username (e.g. sakib)..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-2xl pl-10 pr-24 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none transition font-mono-tech"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg bg-slate-900 cursor-pointer"
              >
                Clear
              </button>
            )}
          </form>

          {/* Search Results */}
          {searching && (
            <div className="py-4 flex items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Searching username directory...</span>
            </div>
          )}

          {!searching && hasSearched && searchResults.length === 0 && (
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 text-center text-xs text-slate-400">
              No user found matching{' '}
              <span className="text-white font-mono-tech">
                @{sanitizeUsername(searchQuery)}
              </span>
              . Ask your friend for their exact username!
            </div>
          )}

          {!searching && searchResults.length > 0 && (
            <div className="space-y-2 pt-1">
              {searchResults.map((user) => {
                const isAlreadyFriend = profile.friends.includes(user.uid);
                const outgoingPending = outgoingRequests.find(
                  (r) => r.toUid === user.uid && r.status === 'pending'
                );
                const incomingPending = incomingRequests.find(
                  (r) => r.fromUid === user.uid && r.status === 'pending'
                );

                return (
                  <div
                    key={user.uid}
                    className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-extrabold text-slate-950 shrink-0"
                        style={{ backgroundColor: user.avatarColor }}
                      >
                        {getInitials(user.displayName)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">
                          {user.displayName}
                        </div>
                        <div className="text-xs font-mono-tech text-slate-400 truncate">
                          @{user.username}
                        </div>
                      </div>
                    </div>

                    {isAlreadyFriend ? (
                      <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5 shrink-0">
                        <Check className="w-3.5 h-3.5" />
                        <span>Friends</span>
                      </span>
                    ) : incomingPending ? (
                      <button
                        type="button"
                        disabled={busyUid === user.uid}
                        onClick={async () => {
                          setBusyUid(user.uid);
                          try {
                            await onAcceptRequest(incomingPending);
                          } finally {
                            setBusyUid(null);
                          }
                        }}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 shrink-0 transition cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept Request</span>
                      </button>
                    ) : outgoingPending ? (
                      <span className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1.5 shrink-0">
                        <Clock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Request Sent</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busyUid === user.uid}
                        onClick={() => handleSendRequestClick(user)}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-bold flex items-center gap-1.5 shrink-0 transition cursor-pointer"
                      >
                        {busyUid === user.uid ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <UserPlus className="w-3.5 h-3.5" />
                        )}
                        <span>Add Friend</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Accepted Friends List */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Your Accepted Friends ({friendProfiles.length})</span>
            </h3>
            <span className="text-[11px] text-slate-400">
              Private Circle
            </span>
          </div>

          {friendProfiles.length === 0 ? (
            <div className="p-6 rounded-2xl bg-slate-950/60 border border-slate-800/70 text-center space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto">
                <Users className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-slate-200">
                No accepted friends yet
              </p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Use the username search bar above to send a friend request, or accept incoming requests in the Requests tab.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {friendProfiles.map((friend) => {
                const loc = friendLocations[friend.uid];
                const isLive =
                  Boolean(loc) && loc.sharingEnabled && friend.sharingEnabled;
                const timeInfo = isLive
                  ? formatRelativeTime(loc.updatedAtMs, loc.updatedAt, nowMs)
                  : null;
                const distMeters =
                  isLive && myCoords
                    ? calculateDistanceMeters(
                        myCoords.latitude,
                        myCoords.longitude,
                        loc.latitude,
                        loc.longitude
                      )
                    : null;

                return (
                  <div
                    key={friend.uid}
                    className="p-4 rounded-2xl bg-slate-950 border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div
                        className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-extrabold text-slate-950 shrink-0 mt-0.5"
                        style={{ backgroundColor: friend.avatarColor }}
                      >
                        {getInitials(friend.displayName)}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-extrabold text-white">
                            {friend.displayName}
                          </span>
                          <span className="text-xs font-mono-tech text-slate-400">
                            @{friend.username}
                          </span>
                        </div>

                        {isLive && timeInfo ? (
                          <div className="space-y-0.5">
                            <div
                              className={`flex items-center gap-1.5 text-xs font-semibold ${
                                timeInfo.isStale
                                  ? 'text-amber-400'
                                  : 'text-emerald-400'
                              }`}
                            >
                              <Radio
                                className={`w-3.5 h-3.5 ${
                                  timeInfo.isStale ? '' : 'animate-pulse'
                                }`}
                              />
                              <span>
                                {timeInfo.isStale
                                  ? 'Last Known Location (Stale)'
                                  : 'Sharing Live GPS'}
                              </span>
                              {distMeters !== null && (
                                <span className="text-sky-400 font-mono-tech">
                                  • {formatDistance(distMeters)}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono-tech">
                              <Clock className="w-3 h-3 text-slate-500" />
                              <span>
                                Last updated: {timeInfo.relative} ({timeInfo.exact})
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                            <span>
                              {friend.sharingEnabled
                                ? 'Waiting for GPS signal...'
                                : 'Location sharing turned OFF'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {isLive && (
                        <button
                          type="button"
                          onClick={() => onFocusFriendOnMap(friend.uid)}
                          className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>View on Map</span>
                        </button>
                      )}

                      {confirmRemoveUid === friend.uid ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={async () => {
                              setBusyUid(friend.uid);
                              try {
                                await onRemoveFriend(friend.uid);
                                setConfirmRemoveUid(null);
                              } finally {
                                setBusyUid(null);
                              }
                            }}
                            className="px-3 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs font-bold transition cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveUid(null)}
                            className="px-2.5 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold transition cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveUid(friend.uid)}
                          className="p-2 rounded-xl bg-slate-900 hover:bg-rose-500/15 border border-slate-800 hover:border-rose-500/30 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                          title="Remove Friend"
                          aria-label={`Remove ${friend.displayName}`}
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}
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
