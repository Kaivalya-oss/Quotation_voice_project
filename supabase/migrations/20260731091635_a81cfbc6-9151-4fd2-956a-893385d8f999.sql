-- ===== ENUMS =====
CREATE TYPE public.app_role AS ENUM ('admin','dealer_owner','sales_executive','finance_executive','inventory_manager');
CREATE TYPE public.lead_stage AS ENUM ('new','interested','test_ride','loan_processing','booked','delivered','lost');
CREATE TYPE public.quotation_status AS ENUM ('draft','sent','accepted','rejected','expired','converted');
CREATE TYPE public.followup_status AS ENUM ('pending','done','missed');

-- ===== SHARED =====
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

-- ===== PROFILES =====
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ===== ROLES =====
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_manager(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','dealer_owner'));
$$;

CREATE OR REPLACE FUNCTION public.can_manage_inventory(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','dealer_owner','inventory_manager'));
$$;

CREATE POLICY "profiles readable by staff" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_manager(auth.uid())) WITH CHECK (id = auth.uid() OR public.is_manager(auth.uid()));
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "roles readable by staff" ON public.user_roles FOR SELECT TO authenticated USING (true);

-- new user -> profile + default role
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), COALESCE(NEW.email,''), NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'sales_executive'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== CUSTOMERS =====
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  city TEXT,
  aadhaar TEXT,
  occupation TEXT,
  monthly_income NUMERIC(12,2),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customers_phone_key ON public.customers (phone);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers read" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "customers insert" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "customers update" ON public.customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "customers delete" ON public.customers FOR DELETE TO authenticated USING (public.is_manager(auth.uid()));
CREATE TRIGGER customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== VEHICLES =====
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT 'Standard',
  color TEXT NOT NULL DEFAULT 'Black',
  category TEXT NOT NULL DEFAULT 'motorcycle',
  ex_showroom_price NUMERIC(12,2) NOT NULL,
  insurance NUMERIC(12,2) NOT NULL DEFAULT 0,
  rto NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  mileage NUMERIC(6,2),
  engine_cc INTEGER,
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  stock_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicles read" ON public.vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "vehicles write" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (public.can_manage_inventory(auth.uid()));
CREATE POLICY "vehicles update" ON public.vehicles FOR UPDATE TO authenticated USING (public.can_manage_inventory(auth.uid())) WITH CHECK (public.can_manage_inventory(auth.uid()));
CREATE POLICY "vehicles delete" ON public.vehicles FOR DELETE TO authenticated USING (public.is_manager(auth.uid()));
CREATE TRIGGER vehicles_updated BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== ACCESSORIES =====
CREATE TABLE public.accessories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'general',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accessories TO authenticated;
GRANT ALL ON public.accessories TO service_role;
ALTER TABLE public.accessories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "accessories read" ON public.accessories FOR SELECT TO authenticated USING (true);
CREATE POLICY "accessories write" ON public.accessories FOR INSERT TO authenticated WITH CHECK (public.can_manage_inventory(auth.uid()));
CREATE POLICY "accessories update" ON public.accessories FOR UPDATE TO authenticated USING (public.can_manage_inventory(auth.uid())) WITH CHECK (public.can_manage_inventory(auth.uid()));
CREATE POLICY "accessories delete" ON public.accessories FOR DELETE TO authenticated USING (public.is_manager(auth.uid()));

-- ===== OFFERS =====
CREATE TABLE public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'amount',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offers TO authenticated;
GRANT ALL ON public.offers TO service_role;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offers read" ON public.offers FOR SELECT TO authenticated USING (true);
CREATE POLICY "offers write" ON public.offers FOR INSERT TO authenticated WITH CHECK (public.can_manage_inventory(auth.uid()));
CREATE POLICY "offers update" ON public.offers FOR UPDATE TO authenticated USING (public.can_manage_inventory(auth.uid())) WITH CHECK (public.can_manage_inventory(auth.uid()));
CREATE POLICY "offers delete" ON public.offers FOR DELETE TO authenticated USING (public.is_manager(auth.uid()));

-- ===== QUOTATIONS =====
CREATE SEQUENCE public.quotation_seq START 1001;
CREATE TABLE public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_number TEXT NOT NULL UNIQUE DEFAULT ('QT-' || nextval('public.quotation_seq')),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  accessories JSONB NOT NULL DEFAULT '[]'::jsonb,
  ex_showroom NUMERIC(12,2) NOT NULL DEFAULT 0,
  accessories_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  insurance NUMERIC(12,2) NOT NULL DEFAULT 0,
  rto NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  gst_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  down_payment NUMERIC(12,2) NOT NULL DEFAULT 0,
  loan_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  interest_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  tenure_months INTEGER NOT NULL DEFAULT 0,
  emi NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_interest NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  transcript TEXT,
  pdf_url TEXT,
  status public.quotation_status NOT NULL DEFAULT 'draft',
  valid_until DATE NOT NULL DEFAULT (CURRENT_DATE + 15),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated;
GRANT ALL ON public.quotations TO service_role;
GRANT USAGE ON SEQUENCE public.quotation_seq TO authenticated, service_role;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotations read" ON public.quotations FOR SELECT TO authenticated USING (true);
CREATE POLICY "quotations insert" ON public.quotations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "quotations update" ON public.quotations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "quotations delete" ON public.quotations FOR DELETE TO authenticated USING (public.is_manager(auth.uid()));
CREATE TRIGGER quotations_updated BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== LEADS =====
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
  stage public.lead_stage NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'voice_quotation',
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  expected_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  lost_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads read" ON public.leads FOR SELECT TO authenticated USING (true);
CREATE POLICY "leads insert" ON public.leads FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "leads update" ON public.leads FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "leads delete" ON public.leads FOR DELETE TO authenticated USING (public.is_manager(auth.uid()));
CREATE TRIGGER leads_updated BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== FOLLOW UPS =====
CREATE TABLE public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  follow_up_date DATE NOT NULL DEFAULT CURRENT_DATE,
  remarks TEXT,
  status public.followup_status NOT NULL DEFAULT 'pending',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_ups TO authenticated;
GRANT ALL ON public.follow_ups TO service_role;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "followups read" ON public.follow_ups FOR SELECT TO authenticated USING (true);
CREATE POLICY "followups insert" ON public.follow_ups FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "followups update" ON public.follow_ups FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "followups delete" ON public.follow_ups FOR DELETE TO authenticated USING (public.is_manager(auth.uid()));
CREATE TRIGGER followups_updated BEFORE UPDATE ON public.follow_ups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== NOTIFICATIONS =====
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT NOT NULL DEFAULT 'info',
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON public.notifications FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ===== AUDIT LOGS =====
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit read managers" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));
CREATE POLICY "audit insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- ===== SETTINGS =====
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings read" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings write" ON public.settings FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()));
CREATE POLICY "settings update" ON public.settings FOR UPDATE TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- ===== SEED =====
INSERT INTO public.vehicles (brand, model, variant, color, category, ex_showroom_price, insurance, rto, stock, mileage, engine_cc) VALUES
('Honda','Shine','Drum','Black','motorcycle',82000,6200,7400,14,55.00,124),
('Honda','SP 125','Disc','Matte Grey','motorcycle',94500,6800,8500,9,60.00,124),
('Honda','Activa 6G','Standard','Pearl White','scooter',80500,6100,7200,18,47.00,110),
('TVS','Raider 125','SmartXonnect','Red','motorcycle',96500,6900,8700,11,67.00,125),
('TVS','Jupiter 110','ZX','Titanium Grey','scooter',83500,6200,7500,13,62.00,113),
('TVS','Apache RTR 160','Race Edition','Blue','motorcycle',124000,8400,11200,6,45.00,159),
('Hero','Splendor Plus','Self','Black Grey','motorcycle',78500,5900,7000,21,70.00,97),
('Hero','Glamour 125','Disc','Sports Red','motorcycle',89500,6500,8100,10,55.00,124),
('Hero','Xtreme 125R','ABS','Blue','motorcycle',101000,7100,9100,7,58.00,124),
('Bajaj','Pulsar N125','Standard','Ebony Black','motorcycle',95000,6800,8600,8,57.00,124),
('Bajaj','Platina 110','ABS','Black Blue','motorcycle',73500,5600,6600,16,70.00,115),
('Suzuki','Access 125','Ride Connect','Metallic Silver','scooter',89000,6500,8000,12,52.00,124);

INSERT INTO public.accessories (name, price, category) VALUES
('ISI Helmet', 1450, 'safety'),
('Seat Cover (Premium)', 950, 'comfort'),
('Leg Guard', 1200, 'protection'),
('Saree Guard', 650, 'protection'),
('Mobile Charger Mount', 850, 'electronics'),
('Body Cover', 700, 'care'),
('Alloy Wheel Kit', 4500, 'styling'),
('Anti-theft Alarm', 2200, 'security'),
('Crash Guard (Heavy)', 1800, 'protection'),
('Extended Warranty (2 yr)', 3400, 'service');

INSERT INTO public.offers (title, description, discount, discount_type, start_date, end_date) VALUES
('Monsoon Cash Discount','Flat cash benefit on all 125cc motorcycles', 4000, 'amount', CURRENT_DATE - 10, CURRENT_DATE + 45),
('Scooter Exchange Bonus','Additional exchange bonus on scooters', 3500, 'amount', CURRENT_DATE - 5, CURRENT_DATE + 25);

INSERT INTO public.settings (key, value) VALUES
('dealership','{"name":"VoiceQuote Motors","gstin":"27AABCV1234F1Z5","address":"Plot 14, MIDC Road, Pune 411019","phone":"+91 98200 41122","email":"sales@voicequote.in","logo_url":null}'::jsonb),
('finance','{"default_interest_rate":10.5,"default_tenure_months":36,"min_down_payment_percent":15,"gst_rate":5}'::jsonb),
('quotation','{"validity_days":15,"terms":"Prices are subject to change without prior notice. Delivery subject to stock availability."}'::jsonb);