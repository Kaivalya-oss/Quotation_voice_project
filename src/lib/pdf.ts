import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { inr } from "@/lib/finance";
import type { QuotationAccessory } from "@/services/repository";

export interface QuotationPdfInput {
  quotationNumber: string;
  createdAt: string;
  validUntil: string;
  dealership: {
    name: string;
    gstin?: string;
    address?: string;
    phone?: string;
    email?: string;
    logo_url?: string | null;
  };
  customer: { name: string; phone: string; city?: string | null; address?: string | null };
  vehicle: { brand: string; model: string; variant: string; color: string } | null;
  accessories: QuotationAccessory[];
  pricing: {
    exShowroom: number;
    insurance: number;
    rto: number;
    accessoriesTotal: number;
    gstAmount: number;
    discount: number;
    totalAmount: number;
  };
  finance: {
    downPayment: number;
    loanAmount: number;
    interestRate: number;
    tenureMonths: number;
    emi: number;
    totalInterest: number;
  };
  executive: string;
  terms: string;
  bookingLink: string;
}

const PRIMARY: [number, number, number] = [29, 78, 216];
const MUTED: [number, number, number] = [110, 118, 133];

export async function buildQuotationPdf(input: QuotationPdfInput): Promise<Blob> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 46;

  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, width, 8, "F");

  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(20, 24, 34);
  doc.text(input.dealership.name, margin, y);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  y += 14;
  if (input.dealership.address) doc.text(input.dealership.address, margin, y), (y += 12);
  const contact = [input.dealership.phone, input.dealership.email].filter(Boolean).join("  |  ");
  if (contact) doc.text(contact, margin, y), (y += 12);
  if (input.dealership.gstin) doc.text(`GSTIN: ${input.dealership.gstin}`, margin, y), (y += 12);

  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...PRIMARY);
  doc.text("QUOTATION", width - margin, 46, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  doc.text(input.quotationNumber, width - margin, 62, { align: "right" });
  doc.text(`Date: ${formatDate(input.createdAt)}`, width - margin, 76, { align: "right" });
  doc.text(`Valid till: ${formatDate(input.validUntil)}`, width - margin, 90, { align: "right" });

  y = Math.max(y, 104);
  line(doc, margin, y, width - margin);
  y += 22;

  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(20, 24, 34);
  doc.text("Customer", margin, y);
  doc.setFont("helvetica", "normal").setFontSize(10);
  doc.text(input.customer.name, margin, y + 16);
  doc.setTextColor(...MUTED).setFontSize(9);
  doc.text(input.customer.phone, margin, y + 30);
  if (input.customer.city) doc.text(input.customer.city, margin, y + 43);

  if (input.vehicle) {
    doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(20, 24, 34);
    doc.text("Vehicle", width / 2, y);
    doc.setFont("helvetica", "normal").setFontSize(10);
    doc.text(`${input.vehicle.brand} ${input.vehicle.model}`, width / 2, y + 16);
    doc.setTextColor(...MUTED).setFontSize(9);
    doc.text(`${input.vehicle.variant} · ${input.vehicle.color}`, width / 2, y + 30);
  }

  y += 66;
  line(doc, margin, y, width - margin);
  y += 24;

  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(20, 24, 34);
  doc.text("Price breakdown", margin, y);
  y += 16;

  const rows: [string, number][] = [
    ["Ex-showroom price", input.pricing.exShowroom],
    ["Insurance", input.pricing.insurance],
    ["Registration & Road Tax (RTO)", input.pricing.rto],
  ];
  for (const acc of input.accessories) {
    rows.push([`${acc.name}${acc.quantity > 1 ? ` x${acc.quantity}` : ""}`, acc.price * acc.quantity]);
  }
  if (input.pricing.gstAmount > 0) rows.push(["GST on accessories", input.pricing.gstAmount]);
  if (input.pricing.discount > 0) rows.push(["Discount", -input.pricing.discount]);

  doc.setFont("helvetica", "normal").setFontSize(9.5);
  for (const [label, value] of rows) {
    doc.setTextColor(...MUTED);
    doc.text(label, margin, y);
    doc.setTextColor(20, 24, 34);
    doc.text(inr(value), width - margin, y, { align: "right" });
    y += 16;
  }

  y += 4;
  line(doc, margin, y, width - margin);
  y += 20;
  doc.setFont("helvetica", "bold").setFontSize(12).setTextColor(...PRIMARY);
  doc.text("Total on-road price", margin, y);
  doc.text(inr(input.pricing.totalAmount), width - margin, y, { align: "right" });

  y += 30;
  doc.setFillColor(240, 245, 255);
  doc.roundedRect(margin, y, width - margin * 2, 78, 8, 8, "F");
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(20, 24, 34);
  doc.text("Finance summary", margin + 16, y + 20);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  const finance: [string, string][] = [
    ["Down payment", inr(input.finance.downPayment)],
    ["Loan amount", inr(input.finance.loanAmount)],
    ["Interest rate", `${input.finance.interestRate}% p.a.`],
    ["Tenure", `${input.finance.tenureMonths} months`],
    ["Monthly EMI", inr(input.finance.emi)],
    ["Total interest", inr(input.finance.totalInterest)],
  ];
  finance.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = margin + 16 + col * ((width - margin * 2 - 32) / 3);
    doc.setTextColor(...MUTED);
    doc.text(label, x, y + 40 + row * 24);
    doc.setFont("helvetica", "bold").setTextColor(20, 24, 34);
    doc.text(value, x, y + 52 + row * 24);
    doc.setFont("helvetica", "normal");
  });

  y += 100;

  try {
    const qr = await QRCode.toDataURL(input.bookingLink, { margin: 0, width: 220 });
    doc.addImage(qr, "PNG", width - margin - 78, y, 78, 78);
    doc.setFontSize(7.5).setTextColor(...MUTED);
    doc.text("Scan to book", width - margin - 39, y + 90, { align: "center" });
  } catch {
    /* QR is decorative — never block the PDF */
  }

  doc.setFont("helvetica", "bold").setFontSize(9.5).setTextColor(20, 24, 34);
  doc.text("Terms & conditions", margin, y + 4);
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...MUTED);
  doc.text(doc.splitTextToSize(input.terms, width - margin * 2 - 110) as string[], margin, y + 18);

  doc.setFontSize(8.5);
  doc.text(`Prepared by: ${input.executive}`, margin, y + 74);
  doc.text(
    "This quotation is computer generated and valid until the date mentioned above.",
    margin,
    y + 88,
  );

  return doc.output("blob");
}

function line(doc: jsPDF, x1: number, y: number, x2: number) {
  doc.setDrawColor(226, 232, 240).setLineWidth(0.8).line(x1, y, x2, y);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Stores the PDF in cloud storage and returns a long-lived signed URL. */
export async function uploadQuotationPdf(quotationNumber: string, blob: Blob) {
  const path = `${quotationNumber}-${Date.now()}.pdf`;
  const { error } = await supabase.storage
    .from("quotations")
    .upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(error.message);

  const { data, error: signError } = await supabase.storage
    .from("quotations")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signError || !data) throw new Error(signError?.message ?? "Could not create PDF link.");
  return { path, url: data.signedUrl };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
