import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const PROFILE_DIAGNOSTIC_SCHEMA_VERSION = "1.0.0" as const;

export const ProfileDiagnosticSchema = Type.Object(
  {
    schemaVersion: Type.Literal(PROFILE_DIAGNOSTIC_SCHEMA_VERSION),
    brandVoice: Type.String(),
    positioning: Type.String(),
    targetAudience: Type.String(),
    colorPalette: Type.Array(Type.String()),
    visualStyle: Type.String(),
    contentPatterns: Type.Array(Type.String()),
    commonCtas: Type.Array(Type.String()),
    recurringWords: Type.Array(Type.String()),
    approvedStyleSuggestions: Type.Array(Type.String()),
    forbiddenStyleSuggestions: Type.Array(Type.String()),
    strategicNotes: Type.String(),
    confidenceScore: Type.Number({ minimum: 0, maximum: 1 }),
    missingInformation: Type.Array(Type.String())
  },
  {
    additionalProperties: false
  }
);

export type ProfileDiagnostic = Static<typeof ProfileDiagnosticSchema>;

export function isProfileDiagnostic(value: unknown): value is ProfileDiagnostic {
  return Value.Check(ProfileDiagnosticSchema, value);
}
