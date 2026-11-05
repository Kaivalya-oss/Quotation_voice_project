import { inr } from "@/lib/finance";
import type { PaymentMode, QuotationResponse } from "@/lib/quotation-types";

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  CASH: "Cash",
  FINANCE: "Finance",
};

/** Prices to show for a quotation: one for a single vehicle, each alternative for a comparison. */
export function quotationPrices(q: QuotationResponse): number[] {
  const options = (q.items ?? []).filter((it) => it.item_type === "VEHICLE_OPTION");
  return options.length >= 2 ? options.map((o) => Number(o.total_price)) : [Number(q.final_price)];
}

/** "₹1,20,000" or "₹1,20,000 vs ₹95,000" — a comparison's prices are alternatives, never a total. */
export function quotationPriceLabel(q: QuotationResponse): string {
  return quotationPrices(q)
    .map((p) => inr(p))
    .join(" vs ");
}
