import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listCompetitions, patchCompetition } from "../../../lib/api";
import type { Competition, CompetitionPatch } from "../../../lib/types";
import { clearOfflinePatch, listOfflinePatches } from "../../../lib/offline";

export type LoadResult = { competitions: Competition[]; source: "api" | "unavailable" };

export function useCompetitionsData() {
  const queryClient = useQueryClient();

  const competitionsQ = useQuery({
    queryKey: ["competitions"],
    queryFn: listCompetitions,
    refetchInterval: 15_000,
  });

  const competitions = competitionsQ.data || [];
  const competitionsSource: LoadResult["source"] = competitionsQ.isError ? "unavailable" : "api";

  const competitionsById = useMemo(() => new Map(competitions.map((c) => [c.id, c] as const)), [competitions]);

  const saveCompetition = async (id: string, patch: CompetitionPatch) => {
    if (competitionsQ.isError) {
      throw new Error("后端数据源不可用，无法保存。请使用 Cloudflare Pages Functions / Wrangler Pages Dev 运行项目。");
    }
    const updated = await patchCompetition(id, patch);
    queryClient.setQueryData(["competitions"], (cur: Competition[] | undefined) => {
      if (!cur) return cur;
      return cur.map((c) => (c.id === id ? updated : c));
    });
    // Backend (D1) writes audit logs; refresh UI views that rely on them.
    queryClient.invalidateQueries({ queryKey: ["auditLogs"] });

    // If this competition had legacy local patches from v2/v3 fallback mode, clear them now.
    const localPatches = listOfflinePatches();
    if (localPatches[id]) clearOfflinePatch(id);
  };

  return { competitionsQ, competitions, competitionsSource, competitionsById, saveCompetition };
}
