import type {
  Agent,
  AgentExecutionLog,
  AgentTestResult,
  CampaignDetail,
  CampaignGenerationLog,
  CampaignPlan,
  CampaignQueueItem,
  CampaignSummary,
  ClientBrandAnalysis,
  ClientProfile,
  ClientSummary,
  CreativeHistoryItem
} from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, options);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.message ?? "Nao foi possivel falar com o servidor.");
  }

  return payload as T;
}

export function getCampaigns() {
  return request<CampaignSummary[]>("/campaigns");
}

export function getCampaign(id: string) {
  return request<CampaignDetail>(`/campaigns/${id}`);
}

export function getCreatives() {
  return request<CreativeHistoryItem[]>("/creatives");
}

export function createCampaign(formData: FormData) {
  return request<CampaignDetail>("/campaigns", {
    method: "POST",
    body: formData
  });
}

export function duplicateCampaign(id: number) {
  return request<Record<string, string | number | null>>(`/campaigns/${id}/duplicate`);
}

export function saveCampaignLearning(id: number, action: string, value?: string) {
  return request<ClientProfile>(`/campaigns/${id}/learning`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, value })
  });
}

export function updateCampaignStatus(id: number, status: "approved" | "rejected") {
  return request<CampaignDetail>(`/campaigns/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
}

export function getClients() {
  return request<ClientSummary[]>("/clients");
}

export function getClient(id: string) {
  return request<ClientProfile>(`/clients/${id}`);
}

export function createClient(payload: Record<string, string>) {
  return request<ClientProfile>("/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function updateClient(id: number, payload: Record<string, string>) {
  return request<ClientProfile>(`/clients/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function uploadClientAsset(id: number, formData: FormData) {
  return request(`/clients/${id}/assets`, {
    method: "POST",
    body: formData
  });
}

export function analyzeClientBrand(id: number, payload: Record<string, unknown>) {
  return request<{
    analysis: ClientBrandAnalysis;
    suggestions: Record<string, unknown>;
    comparison: Array<{ field: string; label: string; current: string | null; suggestion: string }>;
  }>(`/clients/${id}/brand-analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function applyBrandAnalysis(id: number, analysisId: number, fields: string[]) {
  return request<ClientProfile>(`/clients/${id}/brand-analysis/${analysisId}/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields })
  });
}

export function reanalyzeClientMaterials(id: number) {
  return request<{
    analysis: ClientBrandAnalysis;
    suggestions: Record<string, unknown>;
    comparison: Array<{ field: string; label: string; current: string | null; suggestion: string }>;
  }>(`/clients/${id}/brand-analysis/reanalyze-materials`, { method: "POST" });
}

export function getAgents() {
  return request<Agent[]>("/agents");
}

export function getAgent(id: number) {
  return request<Agent>(`/agents/${id}`);
}

export function saveAgent(id: number | null, payload: Record<string, unknown>) {
  return request<Agent>(id ? `/agents/${id}` : "/agents", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function duplicateAgent(id: number) {
  return request<Agent>(`/agents/${id}/duplicate`, { method: "POST" });
}

export function testAgent(id: number, payload: Record<string, unknown>) {
  return request<AgentTestResult>(`/agents/${id}/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function restoreAgentVersion(id: number, versionId: number) {
  return request<Agent>(`/agents/${id}/versions/${versionId}/restore`, { method: "POST" });
}

export function compareAgentVersion(id: number, versionId: number) {
  return request<{ changed_fields: string[]; current: Agent; version: unknown }>(`/agents/${id}/versions/${versionId}/compare`);
}

export function getAgentLogs(id: number) {
  return request<AgentExecutionLog[]>(`/agents/${id}/logs`);
}

export function getCampaignPlans() {
  return request<CampaignPlan[]>("/campaign-plans");
}

export function getCampaignPlan(id: string | number) {
  return request<CampaignPlan>(`/campaign-plans/${id}`);
}

export function saveCampaignPlan(id: number | null, payload: Record<string, unknown>) {
  return request<CampaignPlan>(id ? `/campaign-plans/${id}` : "/campaign-plans", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export function campaignPlanAction(id: number, action: string) {
  return request<CampaignPlan>(`/campaign-plans/${id}/${action}`, { method: "POST" });
}

export function getCampaignQueue(planId?: number) {
  return request<CampaignQueueItem[]>(`/campaign-generation-queue${planId ? `?plan_id=${planId}` : ""}`);
}

export function reprocessQueueItem(id: number) {
  return request<CampaignQueueItem>(`/campaign-generation-queue/${id}/reprocess`, { method: "POST" });
}

export function getCampaignGenerationLogs(planId?: number) {
  return request<CampaignGenerationLog[]>(`/campaign-generation-logs${planId ? `?plan_id=${planId}` : ""}`);
}
