import { normalizeArea } from "./area";
import type {
  ExperienceFeatures,
  ExperienceMetadata,
  FunctionalRole,
  ThemeCluster,
  TimeBucket,
  TimeFlexibility,
} from "./types";

type RawExperienceRow = Record<string, string>;

function toNumber(value: string | undefined, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function inferPreferredTime(row: RawExperienceRow): TimeBucket {
  const scores: Array<{ bucket: TimeBucket; score: number }> = [
    { bucket: "morning", score: toNumber(row["feat_morning"]) },
    { bucket: "afternoon", score: toNumber(row["feat_afternoon"]) },
    { bucket: "sunset", score: toNumber(row["feat_sunset"]) },
    { bucket: "dinner", score: toNumber(row["feat_evening"]) },
    { bucket: "night", score: toNumber(row["feat_night"]) },
  ];

  scores.sort((a, b) => b.score - a.score);

  if (scores[0].score <= 0) return "afternoon";
  return scores[0].bucket;
}

function inferAllowedTimes(preferred: TimeBucket, placeType: string): TimeBucket[] {
  const key = placeType.toLowerCase();

  if (key.includes("cafe")) {
    if (preferred === "morning") return ["morning", "late_morning", "lunch", "afternoon"];
    if (preferred === "dinner") return ["afternoon", "dinner", "night"];
    return ["late_morning", "lunch", "afternoon", "dinner"];
  }

  if (key.includes("park") || key.includes("walk")) {
    if (preferred === "sunset") return ["afternoon", "sunset"];
    return ["morning", "afternoon", "sunset"];
  }

  if (preferred === "night") return ["dinner", "night"];
  if (preferred === "sunset") return ["afternoon", "sunset"];
  if (preferred === "morning") return ["morning", "late_morning"];

  return ["late_morning", "lunch", "afternoon"];
}

function inferTimeFlexibility(preferred: TimeBucket, allowed: TimeBucket[]): TimeFlexibility {
  if (preferred === "sunset" || preferred === "night") return "low";
  if (allowed.length <= 2) return "medium";
  return "high";
}

function inferDuration(
  placeType: string,
  macroAction: string,
): { min: number; recommended: number } {
  const key = `${placeType} ${macroAction}`.toLowerCase();

  if (key.includes("cafe")) return { min: 45, recommended: 75 };
  if (key.includes("restaurant") || key.includes("food")) return { min: 60, recommended: 90 };
  if (key.includes("park")) return { min: 45, recommended: 75 };
  if (key.includes("museum") || key.includes("gallery")) return { min: 60, recommended: 90 };
  if (key.includes("shopping")) return { min: 45, recommended: 90 };
  if (key.includes("view") || key.includes("photo")) return { min: 30, recommended: 45 };

  return { min: 45, recommended: 60 };
}

function inferFatigue(features: ExperienceFeatures): 1 | 2 | 3 | 4 | 5 {
  const raw =
    features.walkIntensity * 0.35 +
    features.activityIntensity * 0.35 +
    features.crowdLevel * 0.2 +
    features.cost * 0.1;

  if (raw < 1.5) return 1;
  if (raw < 2.2) return 2;
  if (raw < 3.0) return 3;
  if (raw < 3.8) return 4;
  return 5;
}

function inferIsMeal(category: string, macroAction: string, microAction: string): boolean {
  const text = `${category} ${macroAction} ${microAction}`.toLowerCase();
  return (
    text.includes("food") ||
    text.includes("meal") ||
    text.includes("dining") ||
    text.includes("restaurant") ||
    text.includes("cafe") ||
    text.includes("brunch")
  );
}

function inferIsIndoor(category: string, placeType: string): boolean {
  const text = `${category} ${placeType}`.toLowerCase();
  return (
    text.includes("cafe") ||
    text.includes("museum") ||
    text.includes("gallery") ||
    text.includes("store") ||
    text.includes("mall") ||
    text.includes("indoor")
  );
}

function inferAnchorHints(
  preferredTime: TimeBucket,
  isMeal: boolean,
  baseExperienceLabel: string,
): { canBeAnchor: boolean; anchorReasons: string[] } {
  const reasons: string[] = [];
  const label = baseExperienceLabel.toLowerCase();

  if (preferredTime === "sunset") reasons.push("sunset_moment");
  if (preferredTime === "night") reasons.push("night_moment");
  if (preferredTime === "lunch" || preferredTime === "dinner") reasons.push("meal_anchor");
  if (isMeal) reasons.push("experience_pivot");
  if (label.includes("view")) reasons.push("viewpoint");
  if (label.includes("walk")) reasons.push("walk_anchor");

  return {
    canBeAnchor: reasons.length > 0,
    anchorReasons: reasons,
  };
}

function inferThemeCluster(
  category: string,
  placeType: string,
  macroAction: string,
  microAction: string,
  preferredTime: TimeBucket,
  features: ExperienceFeatures,
): ThemeCluster {
  const categoryText = category.toLowerCase();
  const placeTypeText = placeType.toLowerCase();
  const macroText = macroAction.toLowerCase();
  const microText = microAction.toLowerCase();
  const text = `${categoryText} ${placeTypeText} ${macroText} ${microText}`;

  // 1. Food / cafe
  if (
    macroText.includes("food") ||
    microText.includes("restaurant") ||
    microText.includes("meal") ||
    placeTypeText.includes("restaurant") ||
    categoryText.includes("음식")
  ) {
    return "food_discovery";
  }

  if (
    microText.includes("cafe") ||
    placeTypeText.includes("cafe")
  ) {
    return "cafe_relax";
  }

  // 2. Culture / historic / exhibition
  if (
    macroText.includes("culture") ||
    microText.includes("historic") ||
    microText.includes("museum") ||
    microText.includes("exhibition") ||
    placeTypeText.includes("historic") ||
    placeTypeText.includes("museum") ||
    placeTypeText.includes("gallery") ||
    categoryText.includes("관광")
  ) {
    if (features.traditional >= 0.7) {
      return "culture_art";
    }
    if (features.local >= 0.5) {
      return "walk_local";
    }
    return "culture_art";
  }

  // 3. Nature / park / walk
  if (
    macroText.includes("nature") ||
    microText.includes("walk") ||
    microText.includes("park") ||
    microText.includes("hiking") ||
    placeTypeText.includes("park") ||
    categoryText.includes("자연")
  ) {
    if (preferredTime === "sunset" || preferredTime === "night") {
      return "night_view";
    }
    return "nature_scenery";
  }

  // 4. Street / local exploration
  if (
    microText.includes("street") ||
    microText.includes("street_explore") ||
    placeTypeText.includes("street") ||
    categoryText.includes("산책")
  ) {
    if (features.local >= 0.5) {
      return "walk_local";
    }
    if (preferredTime === "sunset" || preferredTime === "night") {
      return "night_view";
    }
    return "walk_local";
  }

  // 5. Shopping
  if (
    macroText.includes("shopping") ||
    microText.includes("shopping") ||
    microText.includes("market") ||
    placeTypeText.includes("mall") ||
    placeTypeText.includes("market") ||
    categoryText.includes("쇼핑")
  ) {
    return "shopping_street";
  }

  // 6. Night / viewpoint / romantic skyline
  if (
    microText.includes("viewpoint") ||
    placeTypeText.includes("view") ||
    preferredTime === "sunset" ||
    preferredTime === "night"
  ) {
    return "night_view";
  }

  // 7. Soft atmosphere fallback
  if (features.quiet >= 0.7) {
    return "cafe_relax";
  }

  if (features.local >= 0.6) {
    return "walk_local";
  }

  if (features.traditional >= 0.7 || features.culture >= 0.7) {
    return "culture_art";
  }

  if (features.nature >= 0.7) {
    return "nature_scenery";
  }

  if (features.shopping >= 0.7) {
    return "shopping_street";
  }

  if (features.romantic >= 0.75 && features.touristy >= 0.5) {
    return "night_view";
  }

  return "mixed";
}
function inferFunctionalRoleHints(
  isMeal: boolean,
  preferredTime: TimeBucket,
  features: ExperienceFeatures,
  priorityHints: { canBeAnchor: boolean },
): FunctionalRole[] {
  const roles: FunctionalRole[] = [];

  if (priorityHints.canBeAnchor) {
    roles.push("anchor");
  }

  if (isMeal) {
    roles.push("meal");
  }

  if (
    features.quiet >= 0.7 ||
    preferredTime === "late_morning"
  ) {
    roles.push("rest");
  }

  if (
    preferredTime === "sunset" ||
    preferredTime === "night"
  ) {
    roles.push("viewpoint");
  }

  if (roles.length === 0) {
    roles.push("core");
  }

  return roles;
}

export function normalizeExperienceRow(row: RawExperienceRow): ExperienceMetadata {
  const features: ExperienceFeatures = {
    food: toNumber(row["feat_food"]),
    culture: toNumber(row["feat_culture"]),
    nature: toNumber(row["feat_nature"]),
    shopping: toNumber(row["feat_shopping"]),
    entertainment: toNumber(row["feat_entertainment"]),

    quiet: toNumber(row["feat_quiet"]),
    romantic: toNumber(row["feat_romantic"]),
    local: toNumber(row["feat_local"]),
    touristy: toNumber(row["feat_touristy"]),
    luxury: toNumber(row["feat_luxury"]),
    hipster: toNumber(row["feat_hipster"]),
    traditional: toNumber(row["feat_traditional"]),

    walkIntensity: toNumber(row["feat_walk_intensity"]),
    crowdLevel: toNumber(row["feat_crowd_level"]),
    activityIntensity: toNumber(row["feat_activity_intensity"]),
    cost: toNumber(row["feat_cost"]),
  };

  const preferredTime = inferPreferredTime(row);
  const allowedTimes = inferAllowedTimes(preferredTime, row["place_type"] ?? "");
  const timeFlexibility = inferTimeFlexibility(preferredTime, allowedTimes);
  const duration = inferDuration(row["place_type"] ?? "", row["macro_action"] ?? "");
  const isMeal = inferIsMeal(
    row["category"] ?? "",
    row["macro_action"] ?? "",
    row["micro_action"] ?? "",
  );
  const isIndoor = inferIsIndoor(row["category"] ?? "", row["place_type"] ?? "");
  const anchorHints = inferAnchorHints(preferredTime, isMeal, row["base_experience_label"] ?? "");


    const themeCluster = inferThemeCluster(
  row["category"] ?? "",
  row["place_type"] ?? "",
  row["macro_action"] ?? "",
  row["micro_action"] ?? "",
  preferredTime,
  features,
);

  const functionalRoleHints = inferFunctionalRoleHints(
    isMeal,
    preferredTime,
    features,
    anchorHints,
  );
  return {
    id: row["experience_id"],
    placeId: row["place_id"],

    placeName: row["place_name"],
    regionRaw: row["region"],
    area: normalizeArea(row["region"]),

    category: row["category"],
    placeType: row["place_type"],

    macroAction: row["macro_action"],
    microAction: row["micro_action"],
    actionStrength: toNumber(row["action_strength"], 1),
    isPrimaryAction: toBool(row["is_primary_action"]),

    baseExperienceLabel: row["base_experience_label"],

    preferredTime,
    allowedTimes,
    timeFlexibility,

    minDuration: duration.min,
    recommendedDuration: duration.recommended,

    fatigue: inferFatigue(features),

    isMeal,
    isIndoor,
    isNightFriendly: preferredTime === "night" || allowedTimes.includes("night"),

    companionFit: {
      solo: toNumber(row["feat_solo"]),
      couple: toNumber(row["feat_couple"]),
      friends: toNumber(row["feat_friends"]),
      family: toNumber(row["feat_family"]),
    },

    features,
    
    themeCluster,
    functionalRoleHints,

    priorityHints: anchorHints,

    review: {
      manualReview: toBool(row["manual_review"]),
      mappingNotes: row["mapping_notes"] || undefined,
    },
  };
}
