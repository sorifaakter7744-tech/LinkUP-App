import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Navigation,
  Users,
  Radio,
  EyeOff,
  RefreshCw,
  Layers,
  UserPlus,
  Clock,
  MapPin,
  ShieldAlert,
  Maximize2,
} from 'lucide-react';
import {
  PermissionStatusType,
  UserLocation,
  UserProfile,
} from '../types';
import {
  calculateDistanceMeters,
  formatDistance,
  formatRelativeTime,
  getInitials,
} from '../utils/geo';

interface MapViewProps {
  profile: UserProfile;
  myCoords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    updatedAtMs: number;
  } | null;
  friendProfiles: UserProfile[];
  friendLocations: Record<string, UserLocation>;
  permissionStatus: PermissionStatusType;
  gpsError: string | null;
  focusedFriendUid: string | null;
  onClearFocusedFriend: () => void;
  onToggleSharing: () => void;
  onRequestPermission: () => void;
  onRefreshGps: () => void;
  onOpenFriendsTab: () => void;
}

const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const MapView: React.FC<MapViewProps> = ({
  profile,
  myCoords,
  friendProfiles,
  friendLocations,
  permissionStatus,
  gpsError,
  focusedFriendUid,
  onClearFocusedFriend,
  onToggleSharing,
  onRequestPermission,
  onRefreshGps,
  onOpenFriendsTab,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const hasCenteredInitiallyRef = useRef(false);

  const [mapStyle, setMapStyle] = useState<'dark' | 'street'>('dark');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  // Tick every 5 seconds to keep "last updated" timestamps live
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Initialize Leaflet Map with 100% free OpenStreetMap tiles (no API key required)
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [0, 0],
      zoom: 2,
      zoomControl: false,
      attributionControl: true,
    });

    const tileLayer = L.tileLayer(OSM_TILES, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const markersGroup = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;
    tileLayerRef.current = tileLayer;
    markersLayerRef.current = markersGroup;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Center on user's real GPS location the first time it arrives
  useEffect(() => {
    if (
      myCoords &&
      mapInstanceRef.current &&
      !hasCenteredInitiallyRef.current &&
      !focusedFriendUid
    ) {
      hasCenteredInitiallyRef.current = true;
      mapInstanceRef.current.flyTo(
        [myCoords.latitude, myCoords.longitude],
        16,
        { duration: 1.0 }
      );
    }
  }, [myCoords, focusedFriendUid]);

  // Fly to a specific friend when selected from Friends tab
  useEffect(() => {
    if (!focusedFriendUid || !mapInstanceRef.current) return;
    const loc = friendLocations[focusedFriendUid];
    if (loc && loc.sharingEnabled) {
      setSelectedUid(focusedFriendUid);
      mapInstanceRef.current.flyTo([loc.latitude, loc.longitude], 16, {
        duration: 1.1,
      });
    }
    onClearFocusedFriend();
  }, [focusedFriendUid, friendLocations, onClearFocusedFriend]);

  // Render User & Accepted Friends Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = markersLayerRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // 1. Render Current User's Live GPS Marker ONLY when Location Sharing is ON
    if (myCoords && profile.sharingEnabled) {
      const myTime = formatRelativeTime(myCoords.updatedAtMs, undefined, nowMs);

      // Accuracy radius circle
      if (myCoords.accuracy && myCoords.accuracy < 1500) {
        L.circle([myCoords.latitude, myCoords.longitude], {
          radius: Math.max(myCoords.accuracy, 12),
          color: '#10B981',
          fillColor: '#10B981',
          fillOpacity: 0.12,
          weight: 1.5,
        }).addTo(group);
      }

      const myHtml = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -50%);">
          <div style="margin-bottom: 6px; padding: 3px 9px; border-radius: 9999px; background: rgba(15, 23, 42, 0.92); border: 1.5px solid #10B981; color: #F8FAFC; font-size: 11px; font-weight: 700; white-space: nowrap; box-shadow: 0 6px 16px rgba(0,0,0,0.45); display: flex; align-items: center; gap: 5px;">
            <span style="width: 7px; height: 7px; border-radius: 9999px; background: #10B981; display: inline-block;"></span>
            <span>You (${escapeHtml(profile.displayName)}) • ${myTime.relative}</span>
          </div>
          <div style="position: relative; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;">
            <div class="gps-pulse-ring" style="position: absolute; inset: 0; border-radius: 9999px; background: ${profile.avatarColor}; opacity: 0.55;"></div>
            <div style="position: relative; width: 34px; height: 34px; border-radius: 9999px; background: ${
              profile.avatarColor
            }; border: 3px solid #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: #090d16; font-weight: 800; font-size: 12px;">
              ${escapeHtml(getInitials(profile.displayName))}
            </div>
          </div>
        </div>
      `;

      const myIcon = L.divIcon({
        html: myHtml,
        className: 'custom-gps-marker',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
        popupAnchor: [0, -28],
      });

      const popupContent = `
        <div style="min-width: 185px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
            <strong style="font-size: 13px; color: #ffffff;">${escapeHtml(
              profile.displayName
            )} (You)</strong>
            <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 999px; background: rgba(16,185,129,0.2); color: #34D399;">
              SHARING ON
            </span>
          </div>
          <div style="font-size: 11px; color: #94A3B8; font-family: 'JetBrains Mono', monospace;">
            @${escapeHtml(profile.username)}
          </div>
          <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(148,163,184,0.15); font-size: 11px; color: #CBD5E1; display: flex; flex-direction: column; gap: 2px;">
            <span>Accuracy: ±${Math.round(myCoords.accuracy)}m</span>
            <span>Last updated: ${myTime.relative} (${myTime.exact})</span>
            <span style="font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #64748B;">
              ${myCoords.latitude.toFixed(5)}, ${myCoords.longitude.toFixed(5)}
            </span>
          </div>
        </div>
      `;

      L.marker([myCoords.latitude, myCoords.longitude], { icon: myIcon })
        .bindPopup(popupContent)
        .addTo(group);
    }

    // 2. Render Accepted Friends' Live Markers (Strictly when both friend.sharingEnabled and loc.sharingEnabled are true)
    friendProfiles.forEach((friend) => {
      const loc = friendLocations[friend.uid];
      if (
        !loc ||
        !loc.sharingEnabled ||
        !friend.sharingEnabled ||
        typeof loc.latitude !== 'number' ||
        typeof loc.longitude !== 'number'
      ) {
        return;
      }

      const timeInfo = formatRelativeTime(loc.updatedAtMs, loc.updatedAt, nowMs);
      const distMeters =
        myCoords && profile.sharingEnabled
          ? calculateDistanceMeters(
              myCoords.latitude,
              myCoords.longitude,
              loc.latitude,
              loc.longitude
            )
          : null;
      const distText = formatDistance(distMeters);
      const color = friend.avatarColor || loc.avatarColor || '#3B82F6';

      if (loc.accuracy && loc.accuracy < 1200) {
        L.circle([loc.latitude, loc.longitude], {
          radius: Math.max(loc.accuracy, 10),
          color: timeInfo.isStale ? '#F59E0B' : color,
          fillColor: timeInfo.isStale ? '#F59E0B' : color,
          fillOpacity: 0.09,
          weight: 1,
          dashArray: timeInfo.isStale ? '4 4' : undefined,
        }).addTo(group);
      }

      const friendHtml = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; transform: translate(-50%, -50%);">
          <div style="margin-bottom: 6px; padding: 3px 9px; border-radius: 9999px; background: rgba(15, 23, 42, 0.94); border: 1.5px solid ${
            timeInfo.isStale ? '#F59E0B' : color
          }; color: #F8FAFC; font-size: 11px; font-weight: 700; white-space: nowrap; box-shadow: 0 6px 16px rgba(0,0,0,0.5); display: flex; align-items: center; gap: 5px;">
            <span style="width: 6px; height: 6px; border-radius: 9999px; background: ${
              timeInfo.isFresh ? '#10B981' : '#F59E0B'
            }; display: inline-block;"></span>
            <span>${escapeHtml(friend.displayName)}</span>
            <span style="font-size: 10px; font-weight: 600; color: ${
              timeInfo.isStale ? '#FBBF24' : '#94A3B8'
            }; font-family: 'JetBrains Mono', monospace;">• ${
              timeInfo.relative
            }${timeInfo.isStale ? ' (Stale)' : ''}</span>
          </div>
          <div style="position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;">
            ${
              timeInfo.isFresh
                ? `<div class="gps-pulse-ring" style="position: absolute; inset: 0; border-radius: 9999px; background: ${color}; opacity: 0.45;"></div>`
                : ''
            }
            <div style="position: relative; width: 32px; height: 32px; border-radius: 9999px; background: ${color}; border: 2.5px solid ${
              timeInfo.isStale ? '#F59E0B' : '#ffffff'
            }; opacity: ${
              timeInfo.isStale ? '0.85' : '1'
            }; box-shadow: 0 4px 12px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: #090d16; font-weight: 800; font-size: 12px;">
              ${escapeHtml(getInitials(friend.displayName))}
            </div>
          </div>
        </div>
      `;

      const friendIcon = L.divIcon({
        html: friendHtml,
        className: 'custom-friend-gps-marker',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
        popupAnchor: [0, -28],
      });

      const friendPopup = `
        <div style="min-width: 205px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 3px;">
            <strong style="font-size: 13px; color: #ffffff;">${escapeHtml(
              friend.displayName
            )}</strong>
            <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 999px; background: ${
              timeInfo.isStale
                ? 'rgba(245,158,11,0.2)'
                : 'rgba(16,185,129,0.2)'
            }; color: ${timeInfo.isStale ? '#FBBF24' : '#34D399'};">
              ${timeInfo.isStale ? 'STALE LOCATION' : 'LIVE'}
            </span>
          </div>
          <div style="font-size: 11px; color: #94A3B8; font-family: 'JetBrains Mono', monospace;">
            @${escapeHtml(friend.username)}
          </div>
          <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(148,163,184,0.15); font-size: 11px; color: #CBD5E1; display: flex; flex-direction: column; gap: 3px;">
            ${
              distText
                ? `<span style="color: #38BDF8; font-weight: 600;">Distance: ${distText}</span>`
                : ''
            }
            <span style="color: ${timeInfo.isStale ? '#FBBF24' : '#CBD5E1'};">
              Last updated: <strong>${timeInfo.relative}</strong> (${
        timeInfo.exact
      })
            </span>
            ${
              timeInfo.isStale
                ? `<span style="font-size: 10px; color: #F59E0B;">Last known position — no recent GPS update</span>`
                : ''
            }
            <span>GPS Accuracy: ±${Math.round(loc.accuracy || 0)}m</span>
            <span style="font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #64748B;">
              ${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}
            </span>
          </div>
        </div>
      `;

      const marker = L.marker([loc.latitude, loc.longitude], {
        icon: friendIcon,
      })
        .bindPopup(friendPopup)
        .addTo(group);

      if (selectedUid === friend.uid) {
        marker.openPopup();
      }
    });
  }, [myCoords, profile, friendProfiles, friendLocations, nowMs, selectedUid]);

  const handleCenterOnMe = () => {
    if (!myCoords) {
      onRequestPermission();
      return;
    }
    setSelectedUid(profile.uid);
    mapInstanceRef.current?.flyTo(
      [myCoords.latitude, myCoords.longitude],
      16,
      { duration: 0.9 }
    );
  };

  const handleFitAllMarkers = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const points: [number, number][] = [];
    if (myCoords) {
      points.push([myCoords.latitude, myCoords.longitude]);
    }
    friendProfiles.forEach((f) => {
      const loc = friendLocations[f.uid];
      if (loc && loc.sharingEnabled && f.sharingEnabled) {
        points.push([loc.latitude, loc.longitude]);
      }
    });

    if (points.length === 0) {
      onRequestPermission();
      return;
    }
    if (points.length === 1) {
      map.flyTo(points[0], 15, { duration: 0.9 });
      return;
    }

    const bounds = L.latLngBounds(points);
    map.flyToBounds(bounds, { padding: [65, 65], maxZoom: 16, duration: 1.0 });
  };

  const handleFocusFriendCard = (friend: UserProfile) => {
    const loc = friendLocations[friend.uid];
    if (!loc || !loc.sharingEnabled || !friend.sharingEnabled) return;
    setSelectedUid(friend.uid);
    mapInstanceRef.current?.flyTo([loc.latitude, loc.longitude], 16, {
      duration: 0.9,
    });
  };

  const activeSharingFriendsCount = friendProfiles.filter((f) => {
    const loc = friendLocations[f.uid];
    return f.sharingEnabled && loc && loc.sharingEnabled;
  }).length;

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-slate-950">
      {/* Fullscreen Interactive Map Canvas */}
      <div
        ref={mapContainerRef}
        className={`w-full h-full z-0 ${
          mapStyle === 'dark' ? 'leaflet-dark-tiles' : ''
        }`}
      />

      {/* Top Floating Android App Bar */}
      <div className="absolute top-3 left-3 right-3 z-[400] flex flex-col gap-2 pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800/90 rounded-2xl px-3.5 py-2.5 shadow-xl flex items-center justify-between gap-2 pointer-events-auto">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-extrabold text-white truncate">
                  LinkUp
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-emerald-300 shrink-0">
                  Credit: Sakib
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {!profile.sharingEnabled
                  ? `Sharing OFF (Your pin is hidden) • ${activeSharingFriendsCount} of ${friendProfiles.length} friends live`
                  : myCoords
                  ? `GPS ±${Math.round(myCoords.accuracy)}m • ${activeSharingFriendsCount} of ${friendProfiles.length} friends live`
                  : 'Waiting for GPS location signal...'}
              </p>
            </div>
          </div>

          {/* Quick Location Sharing ON/OFF Pill Button */}
          <button
            type="button"
            onClick={onToggleSharing}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 border ${
              profile.sharingEnabled
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-slate-800/90 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
            title="Toggle Live Location Sharing ON or OFF"
          >
            {profile.sharingEnabled ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <Radio className="w-3.5 h-3.5 text-emerald-400" />
                <span>Sharing ON</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                <span>Sharing OFF</span>
              </>
            )}
          </button>
        </div>

        {/* Permission Warning Banner if GPS is not yet active */}
        {((profile.sharingEnabled && permissionStatus !== 'granted') ||
          gpsError) && (
          <div className="bg-amber-500/15 backdrop-blur-xl border border-amber-500/40 rounded-2xl px-3.5 py-2.5 shadow-lg flex items-center justify-between gap-3 pointer-events-auto">
            <div className="flex items-center gap-2 text-xs text-amber-200 min-w-0">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="truncate">
                {gpsError ||
                  'Allow device GPS permission to share your live location.'}
              </span>
            </div>
            <button
              type="button"
              onClick={onRequestPermission}
              className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shrink-0 transition cursor-pointer"
            >
              Allow GPS
            </button>
          </div>
        )}
      </div>

      {/* Right-side Floating Map Action Controls */}
      <div className="absolute right-3 bottom-36 z-[400] flex flex-col gap-2">
        <button
          type="button"
          onClick={() =>
            setMapStyle((prev) => (prev === 'dark' ? 'street' : 'dark'))
          }
          className="w-11 h-11 rounded-2xl bg-slate-900/90 hover:bg-slate-800 backdrop-blur-xl border border-slate-800 text-slate-200 shadow-lg flex items-center justify-center transition cursor-pointer"
          title="Switch Map Style (Dark / Street)"
          aria-label="Switch Map Style"
        >
          <Layers className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={handleFitAllMarkers}
          className="w-11 h-11 rounded-2xl bg-slate-900/90 hover:bg-slate-800 backdrop-blur-xl border border-slate-800 text-slate-200 shadow-lg flex items-center justify-center transition cursor-pointer"
          title="Fit All Friends on Screen"
          aria-label="Fit All Friends"
        >
          <Maximize2 className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={onRefreshGps}
          className="w-11 h-11 rounded-2xl bg-slate-900/90 hover:bg-slate-800 backdrop-blur-xl border border-slate-800 text-slate-200 shadow-lg flex items-center justify-center transition cursor-pointer"
          title="Refresh GPS Fix"
          aria-label="Refresh GPS"
        >
          <RefreshCw className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={handleCenterOnMe}
          className="w-11 h-11 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/25 flex items-center justify-center transition cursor-pointer"
          title="Center on My Location"
          aria-label="My Location"
        >
          <Navigation className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom Floating Friends Live Radar Strip */}
      <div className="absolute bottom-3 left-3 right-3 z-[400] pointer-events-none">
        <div className="bg-slate-900/92 backdrop-blur-xl border border-slate-800/90 rounded-2xl p-3 shadow-2xl pointer-events-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-white">
                Accepted Friends ({friendProfiles.length})
              </span>
            </div>
            <span className="text-[11px] font-semibold text-slate-400">
              Credit: Sakib
            </span>
          </div>

          {friendProfiles.length === 0 ? (
            <div className="flex items-center justify-between gap-3 py-1">
              <p className="text-xs text-slate-400">
                No accepted friends yet. Search by username to add your friends!
              </p>
              <button
                type="button"
                onClick={onOpenFriendsTab}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center gap-1.5 shrink-0 transition cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Friends</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
              {/* Self Quick Card */}
              <button
                type="button"
                onClick={
                  profile.sharingEnabled ? handleCenterOnMe : onToggleSharing
                }
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-950/80 hover:bg-slate-950 border border-slate-800 shrink-0 text-left transition cursor-pointer"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold text-slate-950 shrink-0"
                  style={{ backgroundColor: profile.avatarColor }}
                >
                  {getInitials(profile.displayName)}
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>You</span>
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        profile.sharingEnabled && myCoords
                          ? 'bg-emerald-400'
                          : 'bg-slate-500'
                      }`}
                    />
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono-tech">
                    {profile.sharingEnabled
                      ? myCoords
                        ? formatRelativeTime(
                            myCoords.updatedAtMs,
                            undefined,
                            nowMs
                          ).relative
                        : 'Locating...'
                      : 'Sharing OFF'}
                  </div>
                </div>
              </button>

              {/* Accepted Friends Cards */}
              {friendProfiles.map((friend) => {
                const loc = friendLocations[friend.uid];
                const isLive =
                  Boolean(loc) && loc.sharingEnabled && friend.sharingEnabled;
                const timeInfo = isLive
                  ? formatRelativeTime(loc.updatedAtMs, loc.updatedAt, nowMs)
                  : null;
                const distMeters =
                  isLive && myCoords && profile.sharingEnabled
                    ? calculateDistanceMeters(
                        myCoords.latitude,
                        myCoords.longitude,
                        loc.latitude,
                        loc.longitude
                      )
                    : null;

                return (
                  <button
                    key={friend.uid}
                    type="button"
                    onClick={() => handleFocusFriendCard(friend)}
                    disabled={!isLive}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border shrink-0 text-left transition ${
                      isLive
                        ? 'bg-slate-950/90 hover:bg-slate-800/80 border-slate-800 cursor-pointer'
                        : 'bg-slate-950/40 border-slate-800/50 opacity-65 cursor-not-allowed'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold text-slate-950 shrink-0"
                      style={{ backgroundColor: friend.avatarColor }}
                    >
                      {getInitials(friend.displayName)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span className="truncate max-w-[100px]">
                          {friend.displayName}
                        </span>
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            !isLive
                              ? 'bg-slate-600'
                              : timeInfo?.isStale
                              ? 'bg-amber-400'
                              : 'bg-emerald-400'
                          }`}
                        />
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 font-mono-tech">
                        {isLive && timeInfo ? (
                          <>
                            <Clock
                              className={`w-2.5 h-2.5 inline ${
                                timeInfo.isStale
                                  ? 'text-amber-400'
                                  : 'text-emerald-400'
                              }`}
                            />
                            <span
                              className={
                                timeInfo.isStale ? 'text-amber-300' : ''
                              }
                            >
                              {timeInfo.relative}
                              {timeInfo.isStale ? ' (Stale)' : ''}
                            </span>
                            {distMeters !== null && (
                              <span className="text-sky-400">
                                • {formatDistance(distMeters)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span>Sharing OFF</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
