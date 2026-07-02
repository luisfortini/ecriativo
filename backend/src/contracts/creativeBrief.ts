import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const CREATIVE_BRIEF_SCHEMA_VERSION = "2.0.0" as const;

export const CreativeBriefSchema = Type.Object(
  {
    schemaVersion: Type.Literal(CREATIVE_BRIEF_SCHEMA_VERSION),
    campaignObjective: Type.String(),
    targetAudience: Type.String(),
    funnelStage: Type.String(),
    communicationAngle: Type.String(),
    mainPromise: Type.String(),
    centralBenefit: Type.String(),
    objectionAddressed: Type.String(),
    headline: Type.String(),
    subheadline: Type.String(),
    callToAction: Type.String(),
    toneOfVoice: Type.String(),
    allowedTriggers: Type.Array(Type.String()),
    restrictions: Type.Array(Type.String()),
    visualDirection: Type.Object(
      {
        concept: Type.String(),
        emotion: Type.String(),
        composition: Type.String(),
        colorPalette: Type.Array(Type.String()),
        visualElements: Type.Array(Type.String()),
        avoid: Type.Array(Type.String())
      },
      { additionalProperties: false }
    ),
    elementHierarchy: Type.Array(Type.String()),
    imageInstructions: Type.String(),
    adCaption: Type.String(),
    captionInstructions: Type.String()
  },
  {
    additionalProperties: false
  }
);

export type CreativeBrief = Static<typeof CreativeBriefSchema>;

export function isCreativeBrief(value: unknown): value is CreativeBrief {
  return Value.Check(CreativeBriefSchema, value);
}
