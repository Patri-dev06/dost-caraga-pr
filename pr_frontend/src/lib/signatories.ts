import { useQuery } from "@tanstack/react-query";
import { apiGetSignatories } from "@/lib/api";

/** Active accounts for a signatory picker — all of them, or only holders of `role` (e.g. "BAC Chairman"). */
export function useSignatories(role?: string) {
  return useQuery({
    queryKey: ["signatories", role ?? "all"],
    queryFn: () => apiGetSignatories(role),
    staleTime: 60_000,
  });
}
