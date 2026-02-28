// app/secondary/secondarySchema.ts
import { z } from "zod";

const placeItemSchema = z.object({
  name: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  importance: z.enum(["낮", "중", "높"]),
});

export const secondarySchema = z.object({
  a_rhythm: z.enum(["아침형", "중간", "저녁형"]),
  a_density: z.enum(["느슨", "보통", "빡빡"]),

  b_allergyTags: z.array(z.string().trim().min(1)).optional().default([]),

  // waiting preset: "0" | "15" | "30" | "60" | "직접"
  b_waitingPreset: z.enum(["0", "15", "30", "60", "직접"]),
  b_waitingCustomMinutes: z.number().int().min(0).optional().default(25),

  c_transportPrefs: z.array(z.enum(["도보", "대중교통", "택시", "렌트"])).optional().default([]),
  c_mobilityConstraint: z.enum(["없음", "있음"]).optional().default("없음"),

  d_lodgingStrategy: z.enum(["1곳 고정", "2곳까지", "상관없음"]),
  d_lodgingRank: z
    .array(z.enum(["위치", "가격", "청결", "조식", "욕장/샤워"]))
    .length(5),

  e_groupMode: z.enum(["혼자", "여럿"]).optional().default("혼자"),
  e_conflictRule: z.enum(["다수결", "최약자 우선", "번갈아"]).optional(),

  f_places: z.array(placeItemSchema).min(1),
  f_placeReasonOneLine: z.string().trim().min(1),
});

export type SecondaryAnswers = z.infer<typeof secondarySchema>;
export type SecondarySchema = typeof secondarySchema;
