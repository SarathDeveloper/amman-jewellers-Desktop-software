-- Phase 1 of the purchase redesign: the supplier's own invoice number, a
-- purchase-level discount, and whether the purchase carries GST. GST is 3% on
-- jewellery (HSN 7113), split as CGST + SGST for an intra-state supplier or as
-- IGST for an inter-state supplier. 'none' keeps the old, untaxed behaviour.
ALTER TABLE inwards ADD COLUMN supplier_invoice_no TEXT NOT NULL DEFAULT '';
ALTER TABLE inwards ADD COLUMN discount REAL NOT NULL DEFAULT 0;
ALTER TABLE inwards ADD COLUMN gst_mode TEXT NOT NULL DEFAULT 'none';

CREATE INDEX IF NOT EXISTS idx_inwards_supplier_invoice
  ON inwards(supplier_id, supplier_invoice_no);
