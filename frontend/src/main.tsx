import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CampaignHistory } from "./pages/CampaignHistory";
import { CampaignResult } from "./pages/CampaignResult";
import { AgentCenter } from "./pages/AgentCenter";
import { ClientProfilePage } from "./pages/ClientProfilePage";
import { Clients } from "./pages/Clients";
import { CampaignPlanDetail } from "./pages/CampaignPlanDetail";
import { CampaignPlanner } from "./pages/CampaignPlanner";
import { CampaignPlannerLogs } from "./pages/CampaignPlannerLogs";
import { CampaignQueue } from "./pages/CampaignQueue";
import { AiCosts } from "./pages/AiCosts";
import { WhatsappSettings } from "./pages/WhatsappSettings";
import { NewCampaignPlan } from "./pages/NewCampaignPlan";
import { Dashboard } from "./pages/Dashboard";
import { NewCampaign } from "./pages/NewCampaign";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/clientes" element={<Clients />} />
            <Route path="/agentes" element={<AgentCenter />} />
            <Route path="/planejador" element={<CampaignPlanner />} />
            <Route path="/planejador/novo" element={<NewCampaignPlan />} />
            <Route path="/planejador/:id" element={<CampaignPlanDetail />} />
            <Route path="/fila-geracao" element={<CampaignQueue />} />
            <Route path="/execucoes-planejador" element={<CampaignPlannerLogs />} />
            <Route path="/custos-ia" element={<AiCosts />} />
            <Route path="/whatsapp" element={<WhatsappSettings />} />
            <Route path="/clientes/:id" element={<ClientProfilePage />} />
            <Route path="/nova-campanha" element={<NewCampaign />} />
            <Route path="/campanhas/:id" element={<CampaignResult />} />
            <Route path="/historico" element={<CampaignHistory />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
