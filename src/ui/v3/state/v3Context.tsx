import { createContext, useContext } from "react";
import type { Competition, CompetitionPatch } from "../../../lib/types";
import type { YMD } from "../../../lib/date";

export type CompetitionsSource = "api" | "unavailable";

export type V3AppContextValue = {
  todayISO: YMD;
  competitions: Competition[];
  competitionsSource: CompetitionsSource;
  competitionsById: Map<string, Competition>;
  saveCompetition: (id: string, patch: CompetitionPatch) => Promise<void>;
  currentUser: string;
  users: string[];
  setCurrentUser: (name: string) => void;
  addUser: (name: string) => Promise<{ ok: boolean; reason?: string }>;

  openId: string | null;
  openCompetition: (id: string) => void;
  closeDrawer: () => void;
};

const V3AppContext = createContext<V3AppContextValue | null>(null);

export function V3AppProvider(props: { value: V3AppContextValue; children: React.ReactNode }) {
  return <V3AppContext.Provider value={props.value}>{props.children}</V3AppContext.Provider>;
}

export function useV3App(): V3AppContextValue {
  const ctx = useContext(V3AppContext);
  if (!ctx) throw new Error("useV3App must be used under <V3AppProvider />");
  return ctx;
}
