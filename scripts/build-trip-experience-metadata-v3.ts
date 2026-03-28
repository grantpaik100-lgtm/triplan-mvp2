import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

type RawExperienceRow = {
  experience_id: string;
  place_id: string;
  region: string;
  place_name: string;
  category: string;
  place_type: string;
  micro_action: string;
  macro_action: string;
  action_strength: string | number;
  is_primary_action: string | number;
  base_experience_label: string;
  manual_review: string | number;
  mapping_notes?: string;
};

type EngineDatasetRow = {
  experience_id: string;
  place_id: string;
  region: string;
  place_name: string;
  category: string;
  place_type: string;
  micro_action: string;
  macro_action: string;
  action_strength: string | number;
  is_primary_action: string | number;
  base_experience_label: string;
  manual_review: string | number;
  mapping_notes?: string;

  feat_food: string | number;
  feat_culture: string | number;
  feat_nature: string | number;
  feat_shopping: string | number;
  feat_entertainment: string | number;
  feat_quiet: string | number;
  feat_romantic: string | number;
  feat_local: string | number;
  feat_touristy: string | number;
  feat_luxury: string | number;
  feat_hipster: string | number;
  feat_traditional: string | number;
  feat_walk_intensity: string | number;
  feat_crowd_level: string | number;
  feat_activity_intensity: string | number;
  feat_cost: string | number;
  feat_morning: string | number;
  feat_afternoon: string | number;
  feat_sunset: string | number;
  feat_evening: string | number;
  feat_night: string | number;
  feat_solo: string | number;
  feat_couple: string | number;
  feat_friends: string | number;
  feat_family: string | number;
  vector_dim?: string | number;
};

type MappedPlaceRow = {
  place_id: string;
  region: string;
  name: string;
  category: string;
  place_type: string;
  experience_count?: string | number;
  needs_manual_review?: string | number;
};

type FinalMetadataRow = {
  id: string;
  place_id: string;
  place_name: string;
  region_raw: string;
  area: string;
  category: string;
  place_type: string;
  macro_action: string;
  micro_action: string;
  action_strength: number;
  is_primary_action: boolean;
  base_experience_label: string;
  preferred_time: string;
  allowed_times: string[];
  time_flexibility: string;
  min_duration: number;
  recommended_duration: number;
  fatigue: number;
  is_meal: boolean;
  is_indoor: boolean;
  is_night_friendly: boolean;
  companion_fit: Record<string, number>;
  features: Record<string, number>;
  priority_hints: Record<string, unknown>;
  review: Record<string, unknown>;
};

const ROOT = process.cwd();

const INPUT_RAW_CSV = path.join(ROOT, "data", "triplan_experience_rows_v1.csv");
const INPUT_ENGINE_XLSX = path.join(ROOT, "data", "triplan_engine_dataset_v1.xlsx");
const INPUT_MAPPING_XLSX = path.join(ROOT, "data", "triplan_experience_mapping_v1.xlsx");

const OUTPUT_CSV = path.join(ROOT, "data", "trip_experience_metadata_v3.csv");
const OUTPUT_JSON = path.join(ROOT, "data", "trip_experience_metadata_v3.json");

const FEATURE_KEYS = [
  "food",
  "culture",
  "nature",
  "shopping",
  "entertainment",
  "quiet",
  "romantic",
  "local",
  "touristy",
  "luxury",
  "hipster",
  "traditional",
  "walkIntensity",
  "crowdLevel",
  "activityIntensity",
  "cost",
] as const;

const TIME_SCORE_KEYS = [
  "morning",
  "afternoon",
  "sunset",
  "evening",
  "night",
] as const;

const COMPANION_KEYS = [
  "solo",
  "couple",
  "friends",
  "family",
] as const;

function readCsvFile<T>(filePath: string): T[] {
  const text = fs.readFileSync(filePath, "utf-8");
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as T[];
}

function readExcelSheet<T>(filePath: string, sheetName: string): T[] {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName} in ${filePath}`);
  }
  return XLSX.utils.sheet_to_json<T>(sheet, {
    defval: "",
    raw: false,
  });
}

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBoolean(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function slugifyKoreanArea(regionRaw: string): string {
  const normalized = regionRaw.trim();

  const map: Record<string, string> = {
    "종로": "jongno",
    "익선동": "ikseondong",
    "북촌": "bukchon",
    "성수": "seongsu",
    "홍대": "hongdae",
    "연남": "yeonnam",
    "이태원": "itaewon",
    "해방촌": "haebangchon",
    "한남": "hannam",
    "잠실": "jamsil",
    "여의도": "yeouido",
    "강남": "gangnam",
    "서촌": "seochon",
    "을지로": "euljiro",
    "명동": "myeongdong",
  };

  if (map[normalized]) {
    return map[normalized];
  }

  return normalized
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function inferAllowedTimes(row: EngineDatasetRow): string[] {
  const scored = [
    { key: "morning", value: toNumber(row.feat_morning) },
    { key: "afternoon", value: toNumber(row.feat_afternoon) },
    { key: "sunset", value: toNumber(row.feat_sunset) },
    { key: "evening", value: toNumber(row.feat_evening) },
    { key: "night", value: toNumber(row.feat_night) },
  ] as const;

  const picked = scored
    .filter((item) => item.value >= 0.45)
    .map((item) => item.key);

  if (picked.length > 0) {
    return picked;
  }

  const best = scored.sort((a, b) => b.value - a.value)[0];
  return [best.key];
}

function inferPreferredTime(row: EngineDatasetRow): string {
  const scored = [
    { key: "morning", value: toNumber(row.feat_morning) },
    { key: "afternoon", value: toNumber(row.feat_afternoon) },
    { key: "sunset", value: toNumber(row.feat_sunset) },
    { key: "evening", value: toNumber(row.feat_evening) },
    { key: "night", value: toNumber(row.feat_night) },
  ];

  scored.sort((a, b) => b.value - a.value);
  return scored[0]?.key ?? "afternoon";
}

function inferTimeFlexibility(allowedTimes: string[]): string {
  if (allowedTimes.length >= 4) return "high";
  if (allowedTimes.length >= 2) return "medium";
  return "low";
}

function inferIsMeal(row: RawExperienceRow): boolean {
  const category = toText(row.category).toLowerCase();
  const placeType = toText(row.place_type).toLowerCase();
  const microAction = toText(row.micro_action).toLowerCase();

  const foodTokens = [
    "cafe",
    "restaurant",
    "bar",
    "pub",
    "bakery",
    "dessert",
    "brunch",
    "food",
    "dining",
  ];

  if (foodTokens.some((token) => placeType.includes(token))) return true;
  if (foodTokens.some((token) => microAction.includes(token))) return true;
  if (category.includes("카페")) return true;
  if (category.includes("음식")) return true;
  if (category.includes("맛집")) return true;

  return false;
}

function inferIsIndoor(row: RawExperienceRow): boolean {
  const placeType = toText(row.place_type).toLowerCase();
  const microAction = toText(row.micro_action).toLowerCase();

  const outdoorTypes = [
    "park",
    "river",
    "trail",
    "mountain",
    "viewpoint",
    "plaza",
    "market_street",
    "street",
    "historic_site",
    "palace",
  ];

  if (outdoorTypes.some((token) => placeType.includes(token))) return false;
  if (microAction === "walk") return false;
  if (microAction === "picnic") return false;
  if (microAction === "viewpoint") return false;

  return true;
}

function inferIsNightFriendly(row: EngineDatasetRow): boolean {
  const sunset = toNumber(row.feat_sunset);
  const evening = toNumber(row.feat_evening);
  const night = toNumber(row.feat_night);
  return Math.max(sunset, evening, night) >= 0.55;
}

function inferDurations(row: RawExperienceRow, isMeal: boolean): {
  min_duration: number;
  recommended_duration: number;
} {
  const microAction = toText(row.micro_action).toLowerCase();
  const placeType = toText(row.place_type).toLowerCase();

  if (isMeal) {
    if (placeType.includes("cafe") || microAction.includes("cafe")) {
      return { min_duration: 45, recommended_duration: 75 };
    }
    if (placeType.includes("bar") || microAction.includes("bar")) {
      return { min_duration: 60, recommended_duration: 90 };
    }
    return { min_duration: 50, recommended_duration: 80 };
  }

  if (microAction === "walk") {
    return { min_duration: 45, recommended_duration: 75 };
  }

  if (microAction === "viewpoint") {
    return { min_duration: 30, recommended_duration: 50 };
  }

  if (microAction === "shopping") {
    return { min_duration: 50, recommended_duration: 90 };
  }

  if (placeType.includes("museum") || placeType.includes("gallery")) {
    return { min_duration: 60, recommended_duration: 90 };
  }

  if (placeType.includes("park")) {
    return { min_duration: 40, recommended_duration: 70 };
  }

  if (placeType.includes("historic_site")) {
    return { min_duration: 45, recommended_duration: 75 };
  }

  return { min_duration: 40, recommended_duration: 60 };
}

function inferFatigue(row: EngineDatasetRow): number {
  const walkIntensity = toNumber(row.feat_walk_intensity);
  const activityIntensity = toNumber(row.feat_activity_intensity);
  const crowdLevel = toNumber(row.feat_crowd_level);

  const composite =
    walkIntensity * 0.45 +
    activityIntensity * 0.4 +
    crowdLevel * 0.15;

  if (composite >= 0.75) return 4;
  if (composite >= 0.55) return 3;
  if (composite >= 0.3) return 2;
  return 1;
}

function buildFeatures(row: EngineDatasetRow): Record<string, number> {
  return {
    food: round2(toNumber(row.feat_food)),
    culture: round2(toNumber(row.feat_culture)),
    nature: round2(toNumber(row.feat_nature)),
    shopping: round2(toNumber(row.feat_shopping)),
    entertainment: round2(toNumber(row.feat_entertainment)),
    quiet: round2(toNumber(row.feat_quiet)),
    romantic: round2(toNumber(row.feat_romantic)),
    local: round2(toNumber(row.feat_local)),
    touristy: round2(toNumber(row.feat_touristy)),
    luxury: round2(toNumber(row.feat_luxury)),
    hipster: round2(toNumber(row.feat_hipster)),
    traditional: round2(toNumber(row.feat_traditional)),
    walkIntensity: round2(toNumber(row.feat_walk_intensity)),
    crowdLevel: round2(toNumber(row.feat_crowd_level)),
    activityIntensity: round2(toNumber(row.feat_activity_intensity)),
    cost: round2(toNumber(row.feat_cost)),
  };
}

function buildCompanionFit(row: EngineDatasetRow): Record<string, number> {
  return {
    solo: round2(toNumber(row.feat_solo)),
    couple: round2(toNumber(row.feat_couple)),
    friends: round2(toNumber(row.feat_friends)),
    family: round2(toNumber(row.feat_family)),
  };
}

function buildPriorityHints(
  row: RawExperienceRow,
  features: Record<string, number>,
  allowedTimes: string[],
  preferredTime: string,
  isMeal: boolean,
): Record<string, unknown> {
  const anchorReasons: string[] = [];
  const microAction = toText(row.micro_action).toLowerCase();
  const placeType = toText(row.place_type).toLowerCase();
  const isPrimaryAction = toBoolean(row.is_primary_action);
  const actionStrength = toNumber(row.action_strength, 1);

  if (isPrimaryAction) {
    anchorReasons.push("primary_action");
  }

  if (actionStrength >= 0.9) {
    anchorReasons.push("strong_action");
  }

  if (isMeal) {
    anchorReasons.push("meal_anchor");
  }

  if (preferredTime === "sunset") {
    anchorReasons.push("sunset_moment");
  }

  if (preferredTime === "night") {
    anchorReasons.push("night_moment");
  }

  if (microAction === "walk") {
    anchorReasons.push("walk_anchor");
  }

  if (microAction === "viewpoint") {
    anchorReasons.push("viewpoint");
  }

  if (placeType.includes("historic_site")) {
    anchorReasons.push("landmark");
  }

  if (features.romantic >= 0.8) {
    anchorReasons.push("romantic_spot");
  }

  if (allowedTimes.length <= 1) {
    anchorReasons.push("time_sensitive");
  }

  const uniqueReasons = Array.from(new Set(anchorReasons));

  return {
    canBeAnchor: uniqueReasons.length > 0,
    anchorReasons: uniqueReasons,
  };
}

function buildReview(
  row: RawExperienceRow,
  mappedPlace?: MappedPlaceRow,
): Record<string, unknown> {
  const reasons: string[] = [];

  if (toBoolean(row.manual_review)) {
    reasons.push("manual_review_flag");
  }

  if (toText(row.mapping_notes)) {
    reasons.push("mapping_notes_present");
  }

  if (mappedPlace && toBoolean(mappedPlace.needs_manual_review)) {
    reasons.push("mapped_place_manual_review");
  }

  return {
    manualReview: reasons.length > 0,
    reasons,
    mappingNotes: toText(row.mapping_notes) || null,
  };
}

function buildFinalRow(
  rawRow: RawExperienceRow,
  engineRow: EngineDatasetRow,
  mappedPlace?: MappedPlaceRow,
): FinalMetadataRow {
  const allowedTimes = inferAllowedTimes(engineRow);
  const preferredTime = inferPreferredTime(engineRow);
  const timeFlexibility = inferTimeFlexibility(allowedTimes);
  const isMeal = inferIsMeal(rawRow);
  const isIndoor = inferIsIndoor(rawRow);
  const isNightFriendly = inferIsNightFriendly(engineRow);
  const { min_duration, recommended_duration } = inferDurations(rawRow, isMeal);
  const fatigue = inferFatigue(engineRow);
  const features = buildFeatures(engineRow);
  const companionFit = buildCompanionFit(engineRow);
  const priorityHints = buildPriorityHints(
    rawRow,
    features,
    allowedTimes,
    preferredTime,
    isMeal,
  );
  const review = buildReview(rawRow, mappedPlace);

  return {
    id: toText(rawRow.experience_id),
    place_id: toText(rawRow.place_id),
    place_name: toText(rawRow.place_name),
    region_raw: toText(rawRow.region),
    area: slugifyKoreanArea(toText(rawRow.region)),
    category: toText(rawRow.category),
    place_type: toText(rawRow.place_type),
    macro_action: toText(rawRow.macro_action),
    micro_action: toText(rawRow.micro_action),
    action_strength: round2(toNumber(rawRow.action_strength, 1)),
    is_primary_action: toBoolean(rawRow.is_primary_action),
    base_experience_label: toText(rawRow.base_experience_label),
    preferred_time: preferredTime,
    allowed_times: allowedTimes,
    time_flexibility: timeFlexibility,
    min_duration,
    recommended_duration,
    fatigue,
    is_meal: isMeal,
    is_indoor: isIndoor,
    is_night_friendly: isNightFriendly,
    companion_fit: companionFit,
    features,
    priority_hints: priorityHints,
    review,
  };
}

function escapeCsvValue(value: unknown): string {
  const str = String(value ?? "");
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

function toCsv(rows: FinalMetadataRow[]): string {
  const headers = [
    "id",
    "place_id",
    "place_name",
    "region_raw",
    "area",
    "category",
    "place_type",
    "macro_action",
    "micro_action",
    "action_strength",
    "is_primary_action",
    "base_experience_label",
    "preferred_time",
    "allowed_times",
    "time_flexibility",
    "min_duration",
    "recommended_duration",
    "fatigue",
    "is_meal",
    "is_indoor",
    "is_night_friendly",
    "companion_fit",
    "features",
    "priority_hints",
    "review",
  ];

  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        escapeCsvValue(row.id),
        escapeCsvValue(row.place_id),
        escapeCsvValue(row.place_name),
        escapeCsvValue(row.region_raw),
        escapeCsvValue(row.area),
        escapeCsvValue(row.category),
        escapeCsvValue(row.place_type),
        escapeCsvValue(row.macro_action),
        escapeCsvValue(row.micro_action),
        escapeCsvValue(row.action_strength),
        escapeCsvValue(row.is_primary_action),
        escapeCsvValue(row.base_experience_label),
        escapeCsvValue(row.preferred_time),
        escapeCsvValue(JSON.stringify(row.allowed_times)),
        escapeCsvValue(row.time_flexibility),
        escapeCsvValue(row.min_duration),
        escapeCsvValue(row.recommended_duration),
        escapeCsvValue(row.fatigue),
        escapeCsvValue(row.is_meal),
        escapeCsvValue(row.is_indoor),
        escapeCsvValue(row.is_night_friendly),
        escapeCsvValue(JSON.stringify(row.companion_fit)),
        escapeCsvValue(JSON.stringify(row.features)),
        escapeCsvValue(JSON.stringify(row.priority_hints)),
        escapeCsvValue(JSON.stringify(row.review)),
      ].join(","),
    ),
  ];

  return lines.join("\n");
}

function printSummary(rows: FinalMetadataRow[]) {
  const areaCounts = new Map<string, number>();
  const mealCount = rows.filter((row) => row.is_meal).length;
  const indoorCount = rows.filter((row) => row.is_indoor).length;
  const manualReviewCount = rows.filter(
    (row) => Boolean((row.review as { manualReview?: boolean }).manualReview),
  ).length;

  for (const row of rows) {
    areaCounts.set(row.area, (areaCounts.get(row.area) ?? 0) + 1);
  }

  console.log("[build] total rows:", rows.length);
  console.log("[build] meal rows:", mealCount);
  console.log("[build] indoor rows:", indoorCount);
  console.log("[build] manual review rows:", manualReviewCount);
  console.log("[build] area counts:", Object.fromEntries(areaCounts));
  console.log("[build] sample row:", rows[0]);
}

function main() {
  if (!fs.existsSync(INPUT_RAW_CSV)) {
    throw new Error(`Missing file: ${INPUT_RAW_CSV}`);
  }
  if (!fs.existsSync(INPUT_ENGINE_XLSX)) {
    throw new Error(`Missing file: ${INPUT_ENGINE_XLSX}`);
  }
  if (!fs.existsSync(INPUT_MAPPING_XLSX)) {
    throw new Error(`Missing file: ${INPUT_MAPPING_XLSX}`);
  }

  const rawRows = readCsvFile<RawExperienceRow>(INPUT_RAW_CSV);
  const engineRows = readExcelSheet<EngineDatasetRow>(
    INPUT_ENGINE_XLSX,
    "engine_dataset_v1",
  );
  const mappedPlaces = readExcelSheet<MappedPlaceRow>(
    INPUT_MAPPING_XLSX,
    "mapped_places",
  );

  const rawById = new Map(rawRows.map((row) => [toText(row.experience_id), row]));
  const mappedPlaceByPlaceId = new Map(
    mappedPlaces.map((row) => [toText(row.place_id), row]),
  );

  const finalRows: FinalMetadataRow[] = [];

  for (const engineRow of engineRows) {
    const experienceId = toText(engineRow.experience_id);
    const rawRow = rawById.get(experienceId);

    if (!rawRow) {
      throw new Error(`Missing raw row for experience_id=${experienceId}`);
    }

    const mappedPlace = mappedPlaceByPlaceId.get(toText(rawRow.place_id));

    finalRows.push(buildFinalRow(rawRow, engineRow, mappedPlace));
  }

  finalRows.sort((a, b) => a.id.localeCompare(b.id));

  fs.writeFileSync(OUTPUT_CSV, toCsv(finalRows), "utf-8");
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(finalRows, null, 2), "utf-8");

  printSummary(finalRows);

  console.log(`[build] wrote csv: ${OUTPUT_CSV}`);
  console.log(`[build] wrote json: ${OUTPUT_JSON}`);
}

main();
