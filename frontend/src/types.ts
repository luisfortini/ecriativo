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

export interface ClientSummary {
  id: number;
  name: string;
  segment: string | null;
  brand_voice: string | null;
  color_palette: string | null;
  updated_at: string;
  created_at: string;
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

export interface ClientProfile extends ClientSummary {
  business_description: string | null;
  target_audience: string | null;
  differentiators: string | null;
  positioning: string | null;
  forbidden_colors: string | null;
  preferred_typography: string | null;
  visual_references: string | null;
  approved_styles: string | null;
  forbidden_styles: string | null;
  communication_restrictions: string | null;
  preferred_ctas: string | null;
  segment_policies: string | null;
  strategic_notes: string | null;
  brand_memory_summary: string | null;
  site_url: string | null;
  instagram_url: string | null;
  assets: ClientAsset[];
  brand_analyses: ClientBrandAnalysis[];
  campaigns: CampaignSummary[];
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

export interface CampaignSummary {
  id: number;
  client_id: number | null;
  cliente: string;
  segmento: string | null;
  objetivo: string | null;
  formato: CampaignFormat | null;
  image_url: string | null;
  status: string;
  created_at: string;
}

export interface Strategy {
  angulo: string;
  publico: string;
  promessa: string;
  headline: string;
  texto_principal: string;
  cta: string;
  briefing_criativo:
    | string
    | {
        conceito: string;
        emocao: string;
        composicao: string;
        paleta: string[];
        elementos_visuais: string[];
        hierarquia: string;
        evitar: string[];
      };
}

export interface Creative {
  prompt_imagem: string;
  negative_prompt: string;
  direcao_visual_resumida: string;
}

export interface NormalizedBriefing {
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
}

export interface CampaignDetail extends CampaignSummary {
  free_briefing: string | null;
  publico_alvo: string | null;
  oferta: string | null;
  tom_marca: string | null;
  paleta_cores: string | null;
  referencias_visuais: string | null;
  restricoes: string | null;
  observacoes: string | null;
  strategy: Strategy;
  creative: Creative;
  normalized_briefing: NormalizedBriefing | null;
}

export interface CreativeHistoryItem {
  id: number;
  client_id: number | null;
  cliente: string;
  formato: CampaignFormat;
  image_url: string | null;
  creative: Creative;
  strategy: Strategy;
  created_at: string;
}

export interface Agent {
  id: number;
  name: string;
  key: string;
  description: string | null;
  role: string | null;
  model: string;
  temperature: number | null;
  max_tokens: number | null;
  system_prompt: string;
  prompt_template: string;
  output_schema_json: string;
  is_active: boolean;
  execution_order: number;
  created_at: string;
  updated_at: string;
  versions?: AgentVersion[];
  logs?: AgentExecutionLog[];
}

export interface AgentVersion {
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
  total_tokens: number | null;
  context_chars: number | null;
  tamanho_contexto_caracteres: number | null;
  agent_key: string | null;
  context_warning: string | null;
  latency_ms: number | null;
  created_at: string;
}

export interface AgentTestResult {
  input: { system_prompt: string; prompt: string; context: unknown };
  outputRaw: string;
  parsed: unknown;
  schema_errors: string[];
}

export interface CampaignPlan {
  id: number;
  name: string;
  theme: string;
  strategic_description: string | null;
  objective: string;
  start_date: string;
  end_date: string;
  recurrence_type: string;
  recurrence_days_json: string | null;
  preferred_time: string | null;
  ads_per_client: number;
  ad_format: CampaignFormat;
  max_ads_per_day: number;
  max_ads_per_hour: number;
  min_interval_minutes: number;
  approval_mode: "draft" | "waiting_review" | "approved";
  variation_mode: string;
  status: "draft" | "active" | "paused" | "completed";
  clients_count?: number;
  queue_count?: number;
  completed_count?: number;
  created_at: string;
  updated_at: string;
  clients?: Array<{ id: number; campaign_plan_id: number; client_id: number; ads_quantity: number; status: string; name: string; segment: string | null }>;
  queue?: CampaignQueueItem[];
  logs?: CampaignGenerationLog[];
}

export interface CampaignQueueItem {
  id: number;
  campaign_plan_id: number;
  client_id: number;
  client_name: string;
  plan_name: string;
  theme: string;
  scheduled_at: string;
  started_at: string | null;
  finished_at: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  priority: number;
  attempt_count: number;
  max_attempts: number;
  error_message: string | null;
  generated_campaign_id: number | null;
  variation_type: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignGenerationLog {
  id: number;
  queue_id: number | null;
  campaign_plan_id: number | null;
  client_id: number | null;
  status: string;
  message: string;
  metadata_json: string | null;
  created_at: string;
}

export interface AiCostDashboard {
  summary: Record<string, any>;
  groups: Record<string, Array<Record<string, any>>>;
  rankings: Record<string, Array<Record<string, any>>>;
  insights: string[];
  alerts: string[];
  logs: Array<Record<string, any>>;
}

export interface AiModelPrice {
  id: number;
  model: string;
  input_price_per_1m_tokens: number;
  output_price_per_1m_tokens: number;
  image_price: number;
  currency: string;
  active: number;
  created_at: string;
  updated_at: string;
}
