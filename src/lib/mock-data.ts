export type QuotationStatus = "draft" | "pending" | "sent" | "approved" | "rejected";

export interface Quotation {
  id: string;
  customer: string;
  company: string;
  date: string;
  status: QuotationStatus;
  amount: number;
  items: number;
  executive: string;
}

export interface Customer {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  city: string;
  quotations: number;
  totalValue: number;
}

export const quotations: Quotation[] = [
  { id: "QT-2041", customer: "Rahul Mehta", company: "Aster Industries", date: "2026-07-30", status: "sent", amount: 248500, items: 6, executive: "Priya Nair" },
  { id: "QT-2040", customer: "Sneha Kulkarni", company: "Vertex Logistics", date: "2026-07-30", status: "pending", amount: 91250, items: 3, executive: "Arjun Rao" },
  { id: "QT-2039", customer: "David Fernandes", company: "Northline Foods", date: "2026-07-29", status: "approved", amount: 412000, items: 11, executive: "Priya Nair" },
  { id: "QT-2038", customer: "Meera Iyer", company: "Zentro Systems", date: "2026-07-29", status: "draft", amount: 64800, items: 2, executive: "Kabir Shah" },
  { id: "QT-2037", customer: "Imran Sheikh", company: "Bluewave Marine", date: "2026-07-28", status: "sent", amount: 176400, items: 5, executive: "Arjun Rao" },
  { id: "QT-2036", customer: "Ananya Ghosh", company: "Helios Power", date: "2026-07-28", status: "rejected", amount: 58300, items: 4, executive: "Kabir Shah" },
  { id: "QT-2035", customer: "Vikram Desai", company: "Orbit Retail", date: "2026-07-27", status: "approved", amount: 305750, items: 9, executive: "Priya Nair" },
  { id: "QT-2034", customer: "Fatima Khan", company: "Craftline Interiors", date: "2026-07-27", status: "pending", amount: 122900, items: 7, executive: "Arjun Rao" },
  { id: "QT-2033", customer: "Joseph Mathew", company: "Silverpeak Pharma", date: "2026-07-26", status: "sent", amount: 289400, items: 8, executive: "Kabir Shah" },
  { id: "QT-2032", customer: "Nisha Verma", company: "Lumen Textiles", date: "2026-07-26", status: "approved", amount: 143200, items: 5, executive: "Priya Nair" },
  { id: "QT-2031", customer: "Rohit Bansal", company: "Trident Auto", date: "2026-07-25", status: "draft", amount: 76900, items: 3, executive: "Arjun Rao" },
  { id: "QT-2030", customer: "Kavya Reddy", company: "Nimbus Cloud", date: "2026-07-25", status: "sent", amount: 351000, items: 10, executive: "Kabir Shah" },
];

export const customers: Customer[] = [
  { id: "CU-101", name: "Rahul Mehta", company: "Aster Industries", phone: "+91 98200 41122", email: "rahul@aster.co", city: "Mumbai", quotations: 14, totalValue: 1840000 },
  { id: "CU-102", name: "Sneha Kulkarni", company: "Vertex Logistics", phone: "+91 98330 77219", email: "sneha@vertex.in", city: "Pune", quotations: 9, totalValue: 960500 },
  { id: "CU-103", name: "David Fernandes", company: "Northline Foods", phone: "+91 90045 12388", email: "david@northline.com", city: "Goa", quotations: 21, totalValue: 3120000 },
  { id: "CU-104", name: "Meera Iyer", company: "Zentro Systems", phone: "+91 99870 65540", email: "meera@zentro.io", city: "Bengaluru", quotations: 6, totalValue: 452000 },
  { id: "CU-105", name: "Imran Sheikh", company: "Bluewave Marine", phone: "+91 91760 22084", email: "imran@bluewave.co", city: "Kochi", quotations: 11, totalValue: 1276000 },
  { id: "CU-106", name: "Ananya Ghosh", company: "Helios Power", phone: "+91 98311 90876", email: "ananya@heliospower.in", city: "Kolkata", quotations: 4, totalValue: 288000 },
];

export const monthlyQuotations = [
  { month: "Feb", quotations: 62, revenue: 4.2, conversion: 41 },
  { month: "Mar", quotations: 74, revenue: 5.1, conversion: 44 },
  { month: "Apr", quotations: 81, revenue: 5.9, conversion: 47 },
  { month: "May", quotations: 95, revenue: 7.4, conversion: 52 },
  { month: "Jun", quotations: 112, revenue: 8.8, conversion: 56 },
  { month: "Jul", quotations: 134, revenue: 10.6, conversion: 61 },
];

export const topProducts = [
  { name: "Industrial Pump X2", value: 34 },
  { name: "Steel Fittings", value: 26 },
  { name: "Control Panel Pro", value: 18 },
  { name: "Conveyor Belt 40m", value: 12 },
  { name: "Safety Kit", value: 10 },
];

export const topExecutives = [
  { name: "Priya Nair", quotations: 48, revenue: 3820000, conversion: 64 },
  { name: "Arjun Rao", quotations: 41, revenue: 2940000, conversion: 57 },
  { name: "Kabir Shah", quotations: 37, revenue: 2410000, conversion: 51 },
];

export const recentActivity = [
  { id: 1, text: "Quotation QT-2041 sent to Aster Industries on WhatsApp", time: "4 min ago", type: "sent" },
  { id: 2, text: "AI extracted 6 line items from a 42s voice note", time: "12 min ago", type: "ai" },
  { id: 3, text: "Northline Foods approved QT-2039 (₹4,12,000)", time: "1 hr ago", type: "approved" },
  { id: 4, text: "New customer Zentro Systems added by Kabir Shah", time: "3 hrs ago", type: "customer" },
  { id: 5, text: "PDF regenerated for QT-2033 with revised GST", time: "5 hrs ago", type: "pdf" },
];

export const inr = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

export const statusLabels: Record<QuotationStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  sent: "Sent",
  approved: "Approved",
  rejected: "Rejected",
};
