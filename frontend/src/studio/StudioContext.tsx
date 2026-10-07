import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { getClients } from "../services/api";
import type { ClientSummary } from "../types";

interface StudioValue {
  clients: ClientSummary[]; brand: ClientSummary | null; loading: boolean; error: string;
  isCompany: boolean; canManage: boolean; selectBrand: (id: number) => void; reloadBrands: (selectedId?: number) => Promise<void>;
}
const StudioContext = createContext<StudioValue | null>(null);
export function StudioProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [brandId, setBrandId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const isCompany = user?.organization.accountType === "company";
  const storageKey = `studio-brand:${user?.id}:${user?.organization.id}`;
  const reloadBrands = useCallback(async (selectedId?: number) => {
    try {
      const data = await getClients(); setClients(data); setError("");setReady(true);
      setBrandId(current => selectedId && data.some(item => Number(item.id)===selectedId) ? selectedId : data.some(item => Number(item.id) === current) ? current : Number(data[0]?.id) || null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar suas marcas."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    try { setBrandId(Number(localStorage.getItem(storageKey)) || null); } catch { /* Storage may be unavailable. */ }
    void reloadBrands();
  }, [reloadBrands, storageKey]);
  const selectBrand = (id: number) => {
    if (!clients.some(item => Number(item.id) === id)) return;
    setBrandId(id);
    try { localStorage.setItem(storageKey, String(id)); } catch { /* Selection still works for this session. */ }
  };
  const brand = clients.find(item => Number(item.id) === brandId) || clients[0] || null;
  useEffect(() => {
    if(!ready||!brand)return;
    try{localStorage.setItem(storageKey,String(brand.id));}catch{/* Optional storage. */}
  },[ready,brand?.id,storageKey]);
  return <StudioContext.Provider value={{ clients, brand, loading, error, isCompany,
    canManage: user?.organizationRole === "owner" || user?.organizationRole === "admin", selectBrand, reloadBrands }}>{children}</StudioContext.Provider>;
}
export function useStudio() {
  const value = useContext(StudioContext);
  if (!value) throw new Error("O estúdio precisa de uma conta ativa.");
  return value;
}
