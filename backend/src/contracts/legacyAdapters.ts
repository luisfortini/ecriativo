import type { BrandAnalysisOutput, CreativeOutput as LegacyCreativeOutput, StrategyOutput } from "../types.js";
import type { CreativeBrief } from "./creativeBrief.js";
import type { CreativeOutput } from "./creativeOutput.js";
import type { ProfileDiagnostic } from "./profileDiagnostic.js";

export function profileDiagnosticToLegacy(value: ProfileDiagnostic): BrandAnalysisOutput {
  return {
    brand_voice: value.brandVoice,
    positioning: value.positioning,
    target_audience: value.targetAudience,
    color_palette: value.colorPalette,
    visual_style: value.visualStyle,
    content_patterns: value.contentPatterns,
    common_ctas: value.commonCtas,
    recurring_words: value.recurringWords,
    approved_style_suggestions: value.approvedStyleSuggestions,
    forbidden_style_suggestions: value.forbiddenStyleSuggestions,
    strategic_notes: value.strategicNotes,
    confidence_score: value.confidenceScore,
    missing_information: value.missingInformation
  };
}

export function creativeBriefToLegacyStrategy(value: CreativeBrief): StrategyOutput {
  return {
    angulo: value.communicationAngle,
    publico: value.targetAudience,
    promessa: value.mainPromise,
    headline: value.headline,
    texto_principal: value.adCaption,
    cta: value.callToAction,
    briefing_criativo: {
      conceito: value.visualDirection.concept,
      emocao: value.visualDirection.emotion,
      composicao: value.visualDirection.composition,
      paleta: value.visualDirection.colorPalette,
      elementos_visuais: value.visualDirection.visualElements,
      hierarquia: value.elementHierarchy.join(" > "),
      evitar: unique([...value.restrictions, ...value.visualDirection.avoid])
    }
  };
}

export function creativeOutputToLegacy(value: CreativeOutput): LegacyCreativeOutput {
  return {
    prompt_imagem: value.imagePrompt,
    negative_prompt: value.negativePrompt,
    direcao_visual_resumida: value.visualDirectionSummary
  };
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
