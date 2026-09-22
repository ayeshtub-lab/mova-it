// src/lib/movaEngine.ts

/**
 * Calculates distance between two geographic coordinates using the Haversine formula (in kilometers)
 */
export function calculateDistanceKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Computes the "Why Now Score" for ranking moments based on freshness, 
 * angles count, and witness activity.
 */
export function computeWhyNowScore(
  createdAt: Date,
  updatedAt: Date,
  anglesCount: number,
  witnessesCount: number
): number {
  const now = new Date().getTime();
  const hoursSinceCreated = (now - createdAt.getTime()) / (1000 * 60 * 60);
  const hoursSinceUpdated = (now - updatedAt.getTime()) / (1000 * 60 * 60);

  // Boost score if updated recently with new witness/angle
  const freshnessFactor = 1 / (hoursSinceUpdated + 0.5);
  const anglesFactor = anglesCount * 1.5;
  const witnessFactor = witnessesCount * 2.0;

  return freshnessFactor * (1 + anglesFactor + witnessFactor);
}

/**
 * Checks if a new post can be clustered into an existing moment 
 * based on spatial and temporal proximity.
 */
export function checkClusterPossibility(
  newLat: number, newLng: number, newTime: Date,
  existingLat: number, existingLng: number, existingTime: Date,
  maxDistanceKm = 0.5, // 500 meters radius
  maxTimeDiffMinutes = 30 // 30 minutes timeframe
): { canCluster: boolean; confidence: number } {
  const distance = calculateDistanceKm(newLat, newLng, existingLat, existingLng);
  const timeDiffMins = Math.abs(newTime.getTime() - existingTime.getTime()) / (1000 * 60);

  if (distance <= maxDistanceKm && timeDiffMins <= maxTimeDiffMinutes) {
    const distScore = 1 - distance / maxDistanceKm;
    const timeScore = 1 - timeDiffMins / maxTimeDiffMinutes;
    const confidence = Number(((distScore + timeScore) / 2).toFixed(2));
    
    return { canCluster: confidence >= 0.7, confidence };
  }

  return { canCluster: false, confidence: 0 };
}