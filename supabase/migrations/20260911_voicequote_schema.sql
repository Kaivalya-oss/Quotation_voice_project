-- VoiceQuote Schema Update
-- Adding quotation_items and updating quotation status enum if possible.

-- First, create the new table for quotation_items
CREATE TABLE public.quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  model_name_snapshot TEXT NOT NULL,
  variant_snapshot TEXT NOT NULL,
  ex_showroom NUMERIC(12,2) NOT NULL DEFAULT 0,
  rto NUMERIC(12,2) NOT NULL DEFAULT 0,
  insurance NUMERIC(12,2) NOT NULL DEFAULT 0,
  accessories NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_charges NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_items TO authenticated;
GRANT ALL ON public.quotation_items TO service_role;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotation_items read" ON public.quotation_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "quotation_items write" ON public.quotation_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "quotation_items update" ON public.quotation_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "quotation_items delete" ON public.quotation_items FOR DELETE TO authenticated USING (true);

-- Adding new status values if needed, but since it might be an ENUM, we can just alter it if it exists.
-- But standard postgres ENUMs are tricky to update. Let's just leave it as is if it's draft, sent, converted etc.
-- The user said: "support a status column (DRAFT, CONFIRMED, GENERATED, SENT, WHATSAPP_FAILED)."
-- Let's check the current enum values first or just use text if it's already text.
-- Actually, the easiest way to add an enum value:
ALTER TYPE public.quotation_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE public.quotation_status ADD VALUE IF NOT EXISTS 'confirmed';
ALTER TYPE public.quotation_status ADD VALUE IF NOT EXISTS 'generated';
ALTER TYPE public.quotation_status ADD VALUE IF NOT EXISTS 'sent';
ALTER TYPE public.quotation_status ADD VALUE IF NOT EXISTS 'whatsapp_failed';

