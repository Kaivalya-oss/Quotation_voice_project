CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested public.app_role;
BEGIN
  INSERT INTO public.profiles (id, name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    COALESCE(NEW.email,''),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;

  BEGIN
    requested := (NEW.raw_user_meta_data->>'requested_role')::public.app_role;
  EXCEPTION WHEN others THEN
    requested := NULL;
  END;

  -- Privileged roles can never be self-assigned at sign-up.
  IF requested IS NULL OR requested IN ('admin', 'dealer_owner') THEN
    requested := 'sales_executive';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, requested)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;