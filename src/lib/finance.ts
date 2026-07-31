/**
 * Finance + quotation pricing engine.
 * Pure functions — shared by the UI (live recalculation) and the server.
 */

export interface EmiInput {
  vehiclePrice: number;
  downPayment: number;
  interestRate: number; // annual %
  tenureMonths: number;
}

export interface EmiResult {
  loanAmount: number;
  emi: number;
  totalInterest: number;
  totalPayable: number;
}

export function calculateEmi({
  vehiclePrice,
  downPayment,
  interestRate,
  tenureMonths,
}: EmiInput): EmiResult {
  const loanAmount = Math.max(0, round2(vehiclePrice - downPayment));
  if (loanAmount <= 0 || tenureMonths <= 0) {
    return { loanAmount, emi: 0, totalInterest: 0, totalPayable: loanAmount };
  }

  const monthlyRate = interestRate / 12 / 100;
  let emi: number;
  if (monthlyRate === 0) {
    emi = loanAmount / tenureMonths;
  } else {
    const factor = Math.pow(1 + monthlyRate, tenureMonths);
    emi = (loanAmount * monthlyRate * factor) / (factor - 1);
  }

  const totalPayable = emi * tenureMonths;
  return {
    loanAmount,
    emi: round2(emi),
    totalInterest: round2(totalPayable - loanAmount),
    totalPayable: round2(totalPayable),
  };
}

export interface QuotationPricingInput {
  exShowroom: number;
  insurance: number;
  rto: number;
  accessoriesTotal: number;
  discount: number;
  gstRate: number; // % applied on accessories (vehicle price is already GST inclusive ex-showroom)
}

export interface QuotationPricing {
  exShowroom: number;
  insurance: number;
  rto: number;
  accessoriesTotal: number;
  discount: number;
  gstRate: number;
  gstAmount: number;
  subtotal: number;
  totalAmount: number;
}

export function calculateQuotation(input: QuotationPricingInput): QuotationPricing {
  const exShowroom = safe(input.exShowroom);
  const insurance = safe(input.insurance);
  const rto = safe(input.rto);
  const accessoriesTotal = safe(input.accessoriesTotal);
  const discount = safe(input.discount);
  const gstRate = safe(input.gstRate);

  const subtotal = round2(exShowroom + insurance + rto + accessoriesTotal);
  const gstAmount = round2((accessoriesTotal * gstRate) / 100);
  const totalAmount = round2(Math.max(0, subtotal + gstAmount - discount));

  return {
    exShowroom,
    insurance,
    rto,
    accessoriesTotal,
    discount,
    gstRate,
    gstAmount,
    subtotal,
    totalAmount,
  };
}

/** Minimum sensible down payment for a given on-road price. */
export function minimumDownPayment(onRoadPrice: number, percent = 15) {
  return round2((onRoadPrice * percent) / 100);
}

export interface LoanValidationInput {
  onRoadPrice: number;
  downPayment: number;
  tenureMonths: number;
  interestRate: number;
  monthlyIncome?: number | null;
  emi: number;
}

/** Returns human-readable warnings; empty array means the loan structure is sound. */
export function validateLoan(input: LoanValidationInput): string[] {
  const warnings: string[] = [];
  if (input.downPayment < 0) warnings.push("Down payment cannot be negative.");
  if (input.downPayment > input.onRoadPrice)
    warnings.push("Down payment exceeds the on-road price.");
  if (input.downPayment < minimumDownPayment(input.onRoadPrice, 10) && input.onRoadPrice > 0)
    warnings.push("Down payment is below the usual 10% financier minimum.");
  if (input.tenureMonths < 6 || input.tenureMonths > 60)
    warnings.push("Tenure should be between 6 and 60 months.");
  if (input.interestRate < 5 || input.interestRate > 30)
    warnings.push("Interest rate looks unusual (expected 5%–30%).");
  if (input.monthlyIncome && input.monthlyIncome > 0 && input.emi > input.monthlyIncome * 0.4)
    warnings.push("EMI exceeds 40% of the customer's monthly income — approval risk.");
  return warnings;
}

/* ---------- Vehicle recommendation scoring ---------- */

export interface RecommendationVehicle {
  id: string;
  brand: string;
  model: string;
  variant: string;
  ex_showroom_price: number;
  insurance: number;
  rto: number;
  mileage: number | null;
  engine_cc: number | null;
  stock: number;
  category: string;
  color: string;
  image_url: string | null;
}

export interface RecommendationPreferences {
  budget?: number | null;
  preferredBrand?: string | null;
  mileagePreference?: number | null;
  downPayment?: number | null;
  monthlyIncome?: number | null;
  tenureMonths?: number | null;
  interestRate?: number | null;
  category?: string | null;
}

export interface ScoredRecommendation {
  vehicle: RecommendationVehicle;
  score: number;
  onRoadPrice: number;
  emi: number;
  reasons: string[];
}

export function onRoadPrice(v: RecommendationVehicle) {
  return round2(safe(v.ex_showroom_price) + safe(v.insurance) + safe(v.rto));
}

/**
 * Scores every vehicle 0–100 against the customer's stated preferences.
 * Budget fit is weighted highest, then affordability, mileage, brand and availability.
 */
export function recommendVehicles(
  vehicles: RecommendationVehicle[],
  prefs: RecommendationPreferences,
  limit = 3,
): ScoredRecommendation[] {
  const tenure = prefs.tenureMonths ?? 36;
  const rate = prefs.interestRate ?? 10.5;

  const scored = vehicles
    .filter((v) => v.stock > 0)
    .map((vehicle) => {
      const price = onRoadPrice(vehicle);
      const reasons: string[] = [];
      let score = 0;

      // Budget fit — 40 points
      if (prefs.budget && prefs.budget > 0) {
        const ratio = price / prefs.budget;
        if (ratio <= 1) {
          score += 40 - Math.min(15, (1 - ratio) * 40); // reward close-to-budget, not far under
          reasons.push("Fits within the stated budget");
        } else if (ratio <= 1.15) {
          score += 22;
          reasons.push("Slightly above budget but close");
        } else {
          score += Math.max(0, 20 - (ratio - 1) * 60);
        }
      } else {
        score += 20;
      }

      // Affordability — 25 points
      const { emi } = calculateEmi({
        vehiclePrice: price,
        downPayment: prefs.downPayment ?? minimumDownPayment(price),
        interestRate: rate,
        tenureMonths: tenure,
      });
      if (prefs.monthlyIncome && prefs.monthlyIncome > 0) {
        const burden = emi / prefs.monthlyIncome;
        if (burden <= 0.2) {
          score += 25;
          reasons.push("Comfortable EMI against income");
        } else if (burden <= 0.4) {
          score += 15;
          reasons.push("EMI within acceptable income range");
        } else {
          score += 4;
        }
      } else {
        score += 14;
      }

      // Mileage — 15 points
      if (prefs.mileagePreference && vehicle.mileage) {
        if (vehicle.mileage >= prefs.mileagePreference) {
          score += 15;
          reasons.push(`Delivers ${vehicle.mileage} kmpl`);
        } else {
          score += Math.max(0, 15 - (prefs.mileagePreference - vehicle.mileage));
        }
      } else if (vehicle.mileage) {
        score += Math.min(12, vehicle.mileage / 6);
        if (vehicle.mileage >= 60) reasons.push("High mileage model");
      }

      // Brand preference — 12 points
      if (prefs.preferredBrand) {
        if (vehicle.brand.toLowerCase() === prefs.preferredBrand.toLowerCase()) {
          score += 12;
          reasons.push(`Preferred brand ${vehicle.brand}`);
        }
      } else {
        score += 5;
      }

      // Category preference — 4 points
      if (prefs.category && vehicle.category.toLowerCase() === prefs.category.toLowerCase()) {
        score += 4;
        reasons.push(`Matches ${vehicle.category} preference`);
      }

      // Availability — 4 points
      if (vehicle.stock >= 5) {
        score += 4;
        reasons.push("Ready stock available");
      } else {
        score += 2;
        reasons.push(`Only ${vehicle.stock} in stock`);
      }

      return {
        vehicle,
        score: Math.round(Math.max(0, Math.min(100, score))),
        onRoadPrice: price,
        emi,
        reasons: reasons.slice(0, 3),
      };
    });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ---------- helpers ---------- */

function safe(n: number | null | undefined) {
  return Number.isFinite(Number(n)) ? Number(n) : 0;
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function inr(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}
