// utils/geo.ts
//
// Pure geographic utility functions for distance calculations.
//
// These are used by the Start Session modal to find the nearest gym
// to the user's current location. No external dependencies — just math.
//
// WHY HAVERSINE?
// The Haversine formula calculates the "great-circle distance" between
// two points on a sphere (the Earth). It's accurate enough for distances
// between a user and nearby gyms (< 100 km). For these short distances,
// the Earth's ellipsoidal shape introduces < 0.3% error, which is
// negligible for "which gym is closest?" comparisons.

/**
 * Earth's mean radius in kilometers.
 * Used in the Haversine formula to convert angular distance to km.
 */
const EARTH_RADIUS_KM = 6371;

/**
 * Convert degrees to radians.
 * Trig functions in JavaScript use radians, but GPS coordinates are in degrees.
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate the distance between two GPS coordinates using the Haversine formula.
 *
 * The formula works in three steps:
 * 1. Convert lat/lon differences to radians
 * 2. Compute the "Haversine" of the central angle (a)
 * 3. Convert back to a distance in km using Earth's radius
 *
 * @param lat1 — Latitude of point 1 (in degrees)
 * @param lon1 — Longitude of point 1 (in degrees)
 * @param lat2 — Latitude of point 2 (in degrees)
 * @param lon2 — Longitude of point 2 (in degrees)
 * @returns Distance in kilometers
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  // Step 1: Convert coordinate differences to radians
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  // Step 2: Haversine formula
  // 'a' is the square of half the chord length between the two points.
  // sin²(Δlat/2) handles the latitude component, and the cos·cos·sin²
  // term handles the longitude component (which shrinks near the poles).
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  // Step 3: Convert the angular distance to km.
  // atan2 is more numerically stable than asin for small distances.
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Shape of a gym object for the findNearestGym helper.
 * Only requires the fields needed for distance calculation — the rest of
 * the gym data (name, address, etc.) passes through untouched.
 */
export interface GymWithCoords {
  id: string;
  latitude: number | null;
  longitude: number | null;
  [key: string]: unknown;
}

/**
 * Find the nearest gym to a given GPS position.
 *
 * Filters out gyms without coordinates (latitude/longitude are null),
 * then returns the closest one by Haversine distance. Returns null if
 * no gyms have valid coordinates or the list is empty.
 *
 * @param userLat — User's current latitude
 * @param userLon — User's current longitude
 * @param gyms — Array of gym objects (must have id, latitude, longitude)
 * @returns The closest gym, or null if none have coordinates
 */
export function findNearestGym<T extends GymWithCoords>(
  userLat: number,
  userLon: number,
  gyms: T[]
): T | null {
  let nearest: T | null = null;
  let minDistance = Infinity;

  for (const gym of gyms) {
    // Skip gyms without GPS coordinates — can't calculate distance
    if (gym.latitude == null || gym.longitude == null) continue;

    const distance = haversineDistance(
      userLat,
      userLon,
      gym.latitude,
      gym.longitude
    );

    if (distance < minDistance) {
      minDistance = distance;
      nearest = gym;
    }
  }

  return nearest;
}
