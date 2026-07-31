CREATE POLICY "Staff can read quotation pdfs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'quotations');

CREATE POLICY "Staff can upload quotation pdfs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'quotations');

CREATE POLICY "Staff can update quotation pdfs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'quotations')
WITH CHECK (bucket_id = 'quotations');

CREATE POLICY "Managers can delete quotation pdfs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'quotations'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'dealer_owner'))
);