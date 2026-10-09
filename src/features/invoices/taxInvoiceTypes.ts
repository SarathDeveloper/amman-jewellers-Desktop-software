import type { BillPrintWatermark, PaymentMode } from "@shared/types";
import type { BillDiscountLine } from "./cashBillTypes";

export interface TaxInvoiceLine {
  particulars: string;
  qty: number;
  /** Tot Wgt — total / charged weight */
  totalWeight: number;
  /** Grs Wgt */
  grossWeight: number;
  /** Stn Wgt */
  stoneWeight: number;
  /** VA/MC (wastage % or making value as entered) */
  vamc: number;
  stoneRate: number;
  /** Gld/Slvr Rate */
  metalRate: number;
  amount: number;
  /** Kept for fallbacks / older preview data */
  netWeight: number;
  wastagePct: number;
  labour: number;
  otherAmount: number;
  hsnCode: string;
}

export interface TaxInvoiceData {
  billNo: string;
  billDateTime: string;
  customerName: string;
  customerGstin: string;
  customerPhone: string;
  customerAddressLines: string[];
  lines: TaxInvoiceLine[];
  itemCount: number;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  discount: number;
  discountBreakdown: BillDiscountLine[];
  total: number;
  oldGoldTotal: number;
  oldGoldLines: Array<{ particulars: string; weight: number; amount: number }>;
  schemeCreditTotal: number;
  schemeCreditLines: Array<{ particulars: string; weight: number; amount: number }>;
  roundOff: number;
  amountPayable: number;
  amountPaid: number;
  amountInWords: string;
  goldRate: number;
  silverRate: number;
  paymentMode: PaymentMode;
  balanceDue: number;
  payments: Array<{ date: string; mode: string; amount: number; note: string }>;
  /** Diagonal stamp on non-final prints; null for a real bill. */
  watermark: BillPrintWatermark | null;
}
