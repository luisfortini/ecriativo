export type CampaignFormat = "1:1" | "4:5" | "9:16" | "16:9";
export type ClientAssetType =
  | "logo_main"
  | "logo_white"
  | "logo_dark"
  | "reference_image"
  | "approved_ad"
  | "rejected_ad"
  | "instagram_screenshot"
  | "website_screenshot"
  | "approved_reference"
  | "rejected_reference"
  | "previous_campaign"
  | "brand_material";
export type AgentKey = "strategist_agent" | "creative_agent" | string;

export interface CampaignInput {
  client_id?: number;
  cliente: string;
  segmento: string;
  objetivo: string;
  publico_alvo: string;
  oferta: string;
  formato: CampaignFormat;
  tom_marca: string;
  paleta_cores?: string;
  referencias_visuais?: string;
  restricoes?: string;
  observacoes?: string;
}

export interface NewCampaignInput {
  client_id: number;
  free_briefing: string;
  objetivo?: string;
  oferta?: string;
  formato: CampaignFormat;
  publico_alvo?: string;
  tom_marca?: string;
  paleta_cores?: string;
  referencias_visuais?: string;
  restricoes?: string;
  observacoes?: string;
}

export interface ClientProfile {
  id: number;
  name: string;
  segment: string | null;
  business_description: string | null;
  target_audience: string | null;
  differentiators: string | null;
  brand_voice: string | null;
  positioning: string | null;
  color_palette: string | null;
  forbidden_colors: string | null;
  preferred_typography: string | null;
  visual_references: string | null;
  approved_styles: string | null;
  forbidden_styles: string | null;
  communication_restrictions: string | null;
  preferred_ctas: string | null;
  segment_policies: string | null;
  strategic_notes: string | null;
  site_url: string | null;
  instagram_url: string | null;
  brand_analyses?: ClientBrandAnalysis[];
  created_at: string;
  updated_at: string;
}

export interface ClientAsset {
  id: number;
  client_id: number;
  type: ClientAssetType;
  file_url: string;
  description: string | null;
  analysis_status: string | null;
  ai_summary: string | null;
  dominant_colors_json: string | null;
  visual_style_tags_json: string | null;
  user_feedback: string | null;
  created_at: string;
}

export interface BrandAnalysisOutput {
  brand_voice: string;
  positioning: string;
  target_audience: string;
  color_palette: string[];
  visual_style: string;
  content_patterns: string[];
  common_ctas: string[];
  recurring_words: string[];
  approved_style_suggestions: string[];
  forbidden_style_suggestions: string[];
  strategic_notes: string;
  confidence_score: number;
  missing_information: string[];
}

export interface ClientBrandAnalysis {
  id: number;
  client_id: number;
  source_type: string;
  source_url: string | null;
  extracted_text: string | null;
  extracted_images_json: string | null;
  suggested_brand_voice: string | null;
  suggested_color_palette: string | null;
  suggested_positioning: string | null;
  suggested_target_audience: string | null;
  suggested_visual_style: string | null;
  suggested_ctas: string | null;
  suggested_restrictions: string | null;
  raw_ai_output_json: string | null;
  status: string;
  created_at: string;
}

export interface NormalizedBriefing {
  client: ClientProfile;
  assets: ClientAsset[];
  free_briefing: string;
  objective: string;
  offer: string;
  format: CampaignFormat;
  target_audience: string;
  brand_voice: string;
  color_palette: string;
  visual_references: string;
  restrictions: string;
  observations: string;
  differentiators: string;
  positioning: string;
  forbidden_colors: string;
  preferred_typography: string;
  approved_styles: string;
  forbidden_styles: string;
  approved_references: ClientAsset[];
  rejected_references: ClientAsset[];
  extracted_palette: string;
  visual_learnings: string;
  posting_patterns: string;
  preferred_ctas: string;
  segment_policies: string;
  strategic_notes: string;
  source_priority: string;
}

export interface StrategyOutput {
  angulo: string;
  publico: string;
  promessa: string;
  headline: string;
  texto_principal: string;
  cta: string;
  briefing_criativo: string;
}

export interface CreativeOutput {
  prompt_imagem: string;
  negative_prompt: string;
  direcao_visual_resumida: string;
}

export interface AgentRecord {
  id: number;
  name: string;
  key: AgentKey;
  description: string | null;
  role: string | null;
  model: string;
  temperature: number | null;
  max_tokens: number | null;
  system_prompt: string;
  prompt_template: string;
  output_schema_json: string;
  is_active: number;
  execution_order: number;
  created_at: string;
  updated_at: string;
}

export interface AgentVersionRecord {
  id: number;
  agent_id: number;
  version_number: number;
  name: string;
  system_prompt: string;
  prompt_template: string;
  output_schema_json: string;
  model: string;
  temperature: number | null;
  max_tokens: number | null;
  change_notes: string | null;
  created_at: string;
}

export interface AgentExecutionLog {
  id: number;
  agent_id: number;
  campaign_id: number | null;
  client_id: number | null;
  input_json: string;
  output_raw: string | null;
  output_parsed_json: string | null;
  status: string;
  error_message: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  latency_ms: number | null;
  created_at: string;
}

export interface CampaignRecord {
  id: number;
  client_id: number | null;
  brand_id: number | null;
  cliente?: string;
  segmento?: string;
  objetivo?: string;
  publico_alvo?: string;
  oferta?: string;
  formato?: CampaignFormat;
  tom_marca?: string;
  paleta_cores: string | null;
  referencias_visuais: string | null;
  restricoes: string | null;
  observacoes: string | null;
  reference_file_path: string | null;
  free_briefing: string | null;
  normalized_briefing_json: string | null;
  strategist_output_json: string | null;
  creative_output_json: string | null;
  final_image_url: string | null;
  strategist_agent_id: number | null;
  creative_agent_id: number | null;
  strategy_json: string;
  creative_json: string;
  image_path: string | null;
  image_url: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
