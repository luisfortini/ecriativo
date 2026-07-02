import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const CREATIVE_OUTPUT_SCHEMA_VERSION = "1.0.0" as const;

export const BrandOverlayPositionSchema = Type.Union([
  Type.Literal("top_left"),
  Type.Literal("top_right"),
  Type.Literal("bottom_left"),
  Type.Literal("bottom_right"),
  Type.Literal("bottom_center")
]);

export const CreativeOutputSchema = Type.Object(
  {
    schemaVersion: Type.Literal(CREATIVE_OUTPUT_SCHEMA_VERSION),
    imagePrompt: Type.String(),
    negativePrompt: Type.String(),
    visualDirectionSummary: Type.String(),
    brandOverlay: Type.Object(
      {
        logoRequired: Type.Boolean(),
        preferredPosition: BrandOverlayPositionSchema,
        sizePercent: Type.Integer({ minimum: 8, maximum: 20 })
      },
      { additionalProperties: false }
    )
  },
  {
    additionalProperties: false
  }
);

export type CreativeOutput = Static<typeof CreativeOutputSchema>;
export type BrandOverlayPosition = Static<typeof BrandOverlayPositionSchema>;

export function isCreativeOutput(value: unknown): value is CreativeOutput {
  return Value.Check(CreativeOutputSchema, value);
}
