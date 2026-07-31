import { z } from "zod";

export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .refine((v) => /^(\+91)?[6-9]\d{9}$/.test(v), {
    message: "Enter a valid 10-digit Indian mobile number",
  });

export const customerSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  phone: phoneSchema,
  email: z.string().trim().email("Invalid email").max(255).optional().or(z.literal("")),
  address: z.string().trim().max(400).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  aadhaar: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{12}$/.test(v.replace(/\s/g, "")), "Aadhaar must be 12 digits")
    .optional()
    .or(z.literal("")),
  occupation: z.string().trim().max(120).optional().or(z.literal("")),
  monthly_income: z.coerce.number().min(0).max(100000000).optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const vehicleSchema = z.object({
  brand: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(80),
  variant: z.string().trim().min(1).max(80),
  color: z.string().trim().min(1).max(60),
  category: z.string().trim().min(1).max(40),
  ex_showroom_price: z.coerce.number().min(1).max(10000000),
  insurance: z.coerce.number().min(0).max(1000000),
  rto: z.coerce.number().min(0).max(1000000),
  stock: z.coerce.number().int().min(0).max(10000),
  mileage: z.coerce.number().min(0).max(200).optional(),
  engine_cc: z.coerce.number().int().min(0).max(2000).optional(),
  image_url: z.string().trim().max(500).optional().or(z.literal("")),
});
export type VehicleInput = z.infer<typeof vehicleSchema>;

export const accessorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  price: z.coerce.number().min(0).max(1000000),
  category: z.string().trim().min(1).max(60),
});

export const offerSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(600).optional().or(z.literal("")),
  discount: z.coerce.number().min(0).max(1000000),
  discount_type: z.enum(["amount", "percent"]),
  start_date: z.string(),
  end_date: z.string(),
});

export const followUpSchema = z.object({
  lead_id: z.string().uuid(),
  follow_up_date: z.string(),
  remarks: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const signInSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

export const signUpSchema = signInSchema.extend({
  name: z.string().trim().min(2, "Name is required").max(120),
  phone: phoneSchema.optional().or(z.literal("")),
});

export const LEAD_STAGES = [
  "new",
  "interested",
  "test_ride",
  "loan_processing",
  "booked",
  "delivered",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  new: "New",
  interested: "Interested",
  test_ride: "Test Ride",
  loan_processing: "Loan Processing",
  booked: "Booked",
  delivered: "Delivered",
  lost: "Lost",
};

export const QUOTATION_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
  "converted",
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const APP_ROLES = [
  "admin",
  "dealer_owner",
  "sales_executive",
  "finance_executive",
  "inventory_manager",
] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  dealer_owner: "Dealer Owner",
  sales_executive: "Sales Executive",
  finance_executive: "Finance Executive",
  inventory_manager: "Inventory Manager",
};
