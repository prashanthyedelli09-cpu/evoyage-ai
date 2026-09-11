/**
 * EVoyage AI
 * Smart Charge Break Recommendation Engine
 *
 * Owner: Prashu
 *
 * Responsibilities:
 * - Match nearby places to EV charging duration
 * - Rank places using distance, rating, budget, preference and time fit
 * - Generate human-readable recommendation explanations
 *
 * This file contains no UI code and no AI assistant logic.
 */

export type PlaceCategory =
  | "restaurant"
  | "cafe"
  | "activity";

export type UserPreference =
  | "food"
  | "coffee"
  | "shopping"
  | "entertainment"
  | "sightseeing"
  | "relaxing"
  | "quick-bite";

export interface ChargingStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface ChargingSession {
  station: ChargingStation;
  chargingDurationMinutes: number;
  estimatedCost: number;
  currency?: string;
}

export interface UserPreferences {
  categories?: UserPreference[];
  maxBudget?: number;
  minRating?: number;
}

export interface TripContext {
  destination?: string;
  distanceRemainingKm?: number;
}

export interface Place {
  id: string;
  name: string;
  category: PlaceCategory;

  latitude: number;
  longitude: number;

  rating: number;

  /**
   * Estimated amount the user is likely to spend.
   * For free activities, use 0.
   */
  estimatedCost: number;

  /**
   * Estimated time required for the visit.
   */
  estimatedVisitDurationMinutes: number;

  /**
   * Tags used for preference matching.
   */
  preferences?: UserPreference[];

  address?: string;
}

export interface SmartBreakInput {
  charging: ChargingSession;
  places: Place[];
  preferences?: UserPreferences;
  trip?: TripContext;
}

export interface RecommendationScore {
  total: number;

  distanceScore: number;
  timeScore: number;
  ratingScore: number;
  budgetScore: number;
  preferenceScore: number;
}

export interface SmartBreakRecommendation {
  place: Place;

  distanceMeters: number;
  distanceMinutes: number;

  availableBreakMinutes: number;
  estimatedVisitDurationMinutes: number;

  score: RecommendationScore;

  explanation: string;

  /**
   * Indicates whether the place realistically fits
   * inside the charging window.
   */
  fitsChargingWindow: boolean;
}

const DEFAULT_CURRENCY = "₹";

/**
 * Weight distribution.
 *
 * Smart Charge Break prioritizes:
 * 1. Time fit
 * 2. Distance
 * 3. User preference
 * 4. Rating
 * 5. Budget
 */
const SCORE_WEIGHTS = {
  distance: 0.25,
  time: 0.30,
  rating: 0.15,
  budget: 0.10,
  preference: 0.20,
};

/**
 * Maximum practical walking distance used for scoring.
 *
 * A place farther than this may still appear,
 * but its distance score approaches 0.
 */
const MAX_DISTANCE_METERS = 2000;

/**
 * Average walking speed used to estimate
 * travel time from charger to destination.
 */
const WALKING_SPEED_METERS_PER_MINUTE = 80;

/**
 * Small safety margin so the user is not
 * recommended a place that consumes the
 * entire charging window.
 */
const SAFETY_BUFFER_MINUTES = 5;

/**
 * Calculate distance between two latitude/longitude
 * coordinates using the Haversine formula.
 */
function calculateDistanceMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): number {
  const earthRadiusMeters = 6371000;

  const lat1 = (latitude1 * Math.PI) / 180;
  const lat2 = (latitude2 * Math.PI) / 180;

  const deltaLat =
    ((latitude2 - latitude1) * Math.PI) / 180;

  const deltaLon =
    ((longitude2 - longitude1) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;

  const c =
    2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

/**
 * Convert distance into an approximate walking time.
 */
function estimateWalkingMinutes(
  distanceMeters: number,
): number {
  return Math.ceil(
    distanceMeters / WALKING_SPEED_METERS_PER_MINUTE,
  );
}

/**
 * Clamp a value between 0 and 1.
 */
function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Score physical distance.
 *
 * 0m      => 1.0
 * 2000m   => 0
 */
function calculateDistanceScore(
  distanceMeters: number,
): number {
  return clamp(
    1 - distanceMeters / MAX_DISTANCE_METERS,
  );
}

/**
 * Score how well the visit fits the charging window.
 *
 * A place that finishes comfortably before charging ends
 * receives a higher score.
 */
function calculateTimeScore(
  chargingMinutes: number,
  visitMinutes: number,
  oneWayTravelMinutes: number,
): number {
  const totalRequiredMinutes =
    visitMinutes + oneWayTravelMinutes * 2;

  const usableMinutes =
    chargingMinutes - SAFETY_BUFFER_MINUTES;

  if (usableMinutes <= 0) {
    return 0;
  }

  if (totalRequiredMinutes > usableMinutes) {
    return 0;
  }

  const remainingSlack =
    usableMinutes - totalRequiredMinutes;

  /**
   * Ideal situation:
   * the user can use most of their charging time
   * without being late returning to the charger.
   */
  const utilization =
    totalRequiredMinutes / usableMinutes;

  /**
   * Reward useful utilization while preventing
   * very small visits from dominating.
   */
  return clamp(
    0.5 + utilization * 0.5 - remainingSlack / 120,
  );
}

/**
 * Score rating on a 0-1 scale.
 */
function calculateRatingScore(
  rating: number,
): number {
  return clamp(rating / 5);
}

/**
 * Score budget compatibility.
 */
function calculateBudgetScore(
  estimatedCost: number,
  maxBudget?: number,
): number {
  /**
   * No budget specified:
   * every place gets a neutral score.
   */
  if (maxBudget === undefined) {
    return 0.7;
  }

  if (maxBudget <= 0) {
    return estimatedCost === 0 ? 1 : 0;
  }

  if (estimatedCost > maxBudget) {
    /**
     * Do not immediately eliminate it.
     * It can still appear with a low budget score.
     */
    return clamp(maxBudget / estimatedCost);
  }

  /**
   * Prefer places that leave some budget available.
   */
  const remainingBudget =
    maxBudget - estimatedCost;

  return clamp(
    0.7 + remainingBudget / maxBudget * 0.3,
  );
}

/**
 * Score preference compatibility.
 */
function calculatePreferenceScore(
  place: Place,
  preferences?: UserPreferences,
): number {
  if (!preferences?.categories?.length) {
    return 0.7;
  }

  const placePreferences =
    place.preferences ?? [];

  const matches =
    preferences.categories.filter((preference) =>
      placePreferences.includes(preference),
    );

  if (matches.length === 0) {
    return 0.2;
  }

  return clamp(
    matches.length / preferences.categories.length,
  );
}

/**
 * Build recommendation explanation.
 */
function buildExplanation(
  place: Place,
  distanceMeters: number,
  visitMinutes: number,
  chargingMinutes: number,
  preferences?: UserPreferences,
): string {
  const roundedDistance =
    Math.round(distanceMeters / 10) * 10;

  const ratingText =
    place.rating.toFixed(1);

  const budgetText =
    preferences?.maxBudget !== undefined
      ? `fits your ₹${preferences.maxBudget} budget`
      : "matches your budget";

  const preferenceMatched =
    preferences?.categories?.some((preference) =>
      place.preferences?.includes(preference),
    );

  const preferenceText =
    preferenceMatched
      ? "matches your preferences"
      : "is a nearby option";

  return `Recommended because it is ${roundedDistance}m from your charger, has a ${ratingText} rating, ${budgetText}, and its ${visitMinutes}-minute visit fits your ${chargingMinutes}-minute charging window. It also ${preferenceText}.`;
}

/**
 * Rank places for Smart Charge Break.
 *
 * This is the main function other modules should call.
 */
export function getSmartBreakRecommendations(
  input: SmartBreakInput,
): SmartBreakRecommendation[] {
  const {
    charging,
    places,
    preferences,
  } = input;

  const {
    station,
    chargingDurationMinutes,
  } = charging;

  /**
   * Return empty result cleanly.
   */
  if (!places.length) {
    return [];
  }

  const recommendations =
    places.map(
      (place): SmartBreakRecommendation => {
        const distanceMeters =
          calculateDistanceMeters(
            station.latitude,
            station.longitude,
            place.latitude,
            place.longitude,
          );

        const distanceMinutes =
          estimateWalkingMinutes(
            distanceMeters,
          );

        const visitMinutes =
          place.estimatedVisitDurationMinutes;

        const totalRequiredMinutes =
          visitMinutes +
          distanceMinutes * 2;

        const usableChargingMinutes =
          chargingDurationMinutes -
          SAFETY_BUFFER_MINUTES;

        const fitsChargingWindow =
          totalRequiredMinutes <=
          usableChargingMinutes;

        const distanceScore =
          calculateDistanceScore(
            distanceMeters,
          );

        const timeScore =
          calculateTimeScore(
            chargingDurationMinutes,
            visitMinutes,
            distanceMinutes,
          );

        const ratingScore =
          calculateRatingScore(
            place.rating,
          );

        const budgetScore =
          calculateBudgetScore(
            place.estimatedCost,
            preferences?.maxBudget,
          );

        const preferenceScore =
          calculatePreferenceScore(
            place,
            preferences,
          );

        const total =
          distanceScore *
            SCORE_WEIGHTS.distance +
          timeScore *
            SCORE_WEIGHTS.time +
          ratingScore *
            SCORE_WEIGHTS.rating +
          budgetScore *
            SCORE_WEIGHTS.budget +
          preferenceScore *
            SCORE_WEIGHTS.preference;

        return {
          place,

          distanceMeters,

          distanceMinutes,

          availableBreakMinutes:
            chargingDurationMinutes,

          estimatedVisitDurationMinutes:
            visitMinutes,

          score: {
            total,
            distanceScore,
            timeScore,
            ratingScore,
            budgetScore,
            preferenceScore,
          },

          explanation:
            buildExplanation(
              place,
              distanceMeters,
              visitMinutes,
              chargingDurationMinutes,
              preferences,
            ),

          fitsChargingWindow,
        };
      },
    );

  /**
   * Best matches first.
   *
   * Places that do not fit are moved below
   * places that realistically fit the charging window.
   */
  return recommendations.sort(
    (a, b) => {
      if (
        a.fitsChargingWindow !==
        b.fitsChargingWindow
      ) {
        return a.fitsChargingWindow
          ? -1
          : 1;
      }

      return (
        b.score.total -
        a.score.total
      );
    },
  );
}

/**
 * Convenience helper for displaying distance.
 */
export function formatDistance(
  distanceMeters: number,
): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)}m`;
  }

  return `${(
    distanceMeters / 1000
  ).toFixed(1)} km`;
}

/**
 * Convenience helper for displaying cost.
 */
export function formatCost(
  amount: number,
  currency = DEFAULT_CURRENCY,
): string {
  if (amount <= 0) {
    return "Free";
  }

  return `${currency}${Math.round(amount)}`;
}

/**
 * Convenience helper for displaying score.
 */
export function formatRecommendationScore(
  score: number,
): string {
  return `${Math.round(score * 100)}%`;
}
