import { inr } from "@/lib/finance";

export interface WhatsAppMessageInput {
  customerName: string;
  quotationNumber: string;
  vehicle: string;
  onRoadPrice: number;
  emi: number;
  tenureMonths: number;
  pdfUrl?: string | null;
  dealershipName: string;
  validUntil: string;
}

export function buildWhatsAppMessage(input: WhatsAppMessageInput) {
  const lines = [
    `Hello ${input.customerName},`,
    "",
    `Thank you for visiting ${input.dealershipName}. Here is your quotation *${input.quotationNumber}*.`,
    "",
    `*Vehicle:* ${input.vehicle}`,
    `*On-road price:* ${inr(input.onRoadPrice)}`,
  ];
  if (input.emi > 0) {
    lines.push(`*EMI:* ${inr(input.emi)}/month for ${input.tenureMonths} months`);
  }
  lines.push(`*Valid until:* ${new Date(input.validUntil).toLocaleDateString("en-IN")}`);
  if (input.pdfUrl) {
    lines.push("", `Detailed quotation PDF: ${input.pdfUrl}`);
  }
  lines.push("", "Reply here to book a test ride or confirm your booking.");
  return lines.join("\n");
}

/**
 * Opens WhatsApp with the pre-filled quotation message.
 * Swap this for a Business Cloud API call when the dealership's WABA is ready —
 * the message body above is already API-ready.
 */
export function sendWhatsApp(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  const url = `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank", "noopener,noreferrer");
  return url;
}
