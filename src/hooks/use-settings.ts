import { useQuery } from "@tanstack/react-query";
import { listSettings } from "@/services/repository";

export interface DealershipSettings {
  name: string;
  gstin?: string;
  address?: string;
  phone?: string;
  email?: string;
  logo_url?: string | null;
}

export interface FinanceSettings {
  gst_rate: number;
  default_interest_rate: number;
  default_tenure_months: number;
  min_down_payment_percent: number;
}

export interface QuotationSettings {
  validity_days: number;
  terms: string;
}

const DEFAULTS = {
  dealership: { name: "VoiceQuote Motors" } as DealershipSettings,
  finance: {
    gst_rate: 5,
    default_interest_rate: 10.5,
    default_tenure_months: 36,
    min_down_payment_percent: 15,
  } as FinanceSettings,
  quotation: {
    validity_days: 15,
    terms: "Prices are subject to change without prior notice.",
  } as QuotationSettings,
};

export const settingsQueryKey = ["settings"] as const;

export function useSettings() {
  const { data, isLoading } = useQuery({
    queryKey: settingsQueryKey,
    queryFn: listSettings,
    staleTime: 5 * 60_000,
  });

  const map = new Map((data ?? []).map((row) => [row.key, row.value as unknown]));

  return {
    isLoading,
    dealership: { ...DEFAULTS.dealership, ...((map.get("dealership") as object) ?? {}) },
    finance: { ...DEFAULTS.finance, ...((map.get("finance") as object) ?? {}) },
    quotation: { ...DEFAULTS.quotation, ...((map.get("quotation") as object) ?? {}) },
  };
}
