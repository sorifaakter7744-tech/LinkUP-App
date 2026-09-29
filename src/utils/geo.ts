/**
 * Calculate Haversine distance between two GPS coordinates in meters.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Format distance in meters to human-readable string (e.g., "140 m" or "2.4 km")
 */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || Number.isNaN(meters)) {
    return '';
  }
  if (meters < 25) {
    return 'Right here (<25m)';
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m away`;
  }
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
}

/**
 * Format a timestamp into a live relative string + clock time, with freshness/staleness flags.
 */
export function formatRelativeTime(
  updatedAtMs?: number,
  updatedAtIso?: string,
  nowMs: number = Date.now()
): { relative: string; exact: string; isFresh: boolean; isStale: boolean } {
  const targetMs =
    typeof updatedAtMs === 'number' && updatedAtMs > 0
      ? updatedAtMs
      : updatedAtIso
      ? new Date(updatedAtIso).getTime()
      : 0;

  if (!targetMs || Number.isNaN(targetMs)) {
    return { relative: 'Unknown', exact: '--:--', isFresh: false, isStale: true };
  }

  const diffSec = Math.max(0, Math.floor((nowMs - targetMs) / 1000));
  const dateObj = new Date(targetMs);
  const exact = dateObj.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // Fresh if updated within the last 3 minutes (180 seconds); stale if older
  const isFresh = diffSec < 180;
  const isStale = !isFresh;

  if (diffSec < 10) {
    return { relative: 'Just now', exact, isFresh: true, isStale: false };
  }
  if (diffSec < 60) {
    return { relative: `${diffSec}s ago`, exact, isFresh: true, isStale: false };
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return { relative: `${diffMin}m ago`, exact, isFresh, isStale };
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return { relative: `${diffHours}h ago`, exact, isFresh: false, isStale: true };
  }
  const diffDays = Math.floor(diffHours / 24);
  return { relative: `${diffDays}d ago`, exact, isFresh: false, isStale: true };
}

/**
 * Normalize a username into lowercase alphanumeric + underscores (2..30 chars).
 */
export function sanitizeUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 28);
}

/**
 * Extract initials from a display name.
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'LU';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
