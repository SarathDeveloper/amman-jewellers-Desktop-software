import { amountInWords } from "@shared/billing/amountInWords";
import type { Customer, Invoice, MetalRates } from "@shared/types";
import { formatDisplayDate } from "../../lib/format";
import type { BillDiscountLine } from "./cashBillTypes";
import { oldGoldPrintLines } from "./oldGoldPrintLines";
import type { TaxInvoiceData } from "./taxInvoiceTypes";

function formatBillDateTime(invoiceDate: string, createdAt: string): string {
  const datePart = formatDisplayDate(invoiceDate);
  const timeMatch = /T(\d{2}):(\d{2})/.exec(createdAt);
  if (timeMatch) {
    const hour = Number.parseInt(timeMatch[1], 10);
    const minute = timeMatch[2];
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${datePart} ${hour12}:${minute} ${ampm}`;
  }

  return datePart;
}

function splitAddress(address: string): string[] {
  const trimmed = address.trim();
  if (!trimmed) {
    return [];
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function discountBreakdown(invoice: Invoice): BillDiscountLine[] {
  if (invoice.discount <= 0) return [];
  return [{ label: "Discount", amount: invoice.discount }];
}

export function buildTaxInvoiceData(
  invoice: Invoice,
  customer: Customer,
  rates?: MetalRates | null,
): TaxInvoiceData {
  const sourceItems =
    invoice.items.filter((item) => item.lineKind !== "exchange").length > 0
      ? invoice.items.filter((item) => item.lineKind !== "exchange")
      : invoice.items.length > 0
        ? invoice.items
        : [
            {
              productName: "Old bill",
              qty: 1,
              netWeight: invoice.summaryGoldG + invoice.summarySilverG,
              grossWeight: invoice.summaryGoldG + invoice.summarySilverG,
              stoneWeight: 0,
              makingCharges: invoice.summaryMaking,
              wastagePct: 0,
              stoneRate: 0,
              otherCharges: 0,
              metalRate: 0,
              lineTotal: invoice.subtotal,
              hsnCode: "7113",
              lineKind: "sale" as const,
              description: "",
            },
          ];

  const lines = sourceItems.map((item) => {
    const name = item.productName;
    const qty = item.qty || 1;
    const netWeight = item.netWeight * qty;
    const stoneWeight = (item.stoneWeight || 0) * qty;
    const grossWeight = (item.grossWeight || item.netWeight) * qty;
    const otherFromField = (item.otherCharges ?? 0) * qty;
    const otherFromStone = stoneWeight * (item.stoneRate || 0);
    const wastagePct = item.wastagePct || 0;
    const labour = item.makingCharges * qty;
    return {
      particulars: qty > 1 ? `${name} × ${qty}` : name,
      qty,
      // Tot Wgt on form is net (priced metal) weight; keep print in sync.
      totalWeight: netWeight > 0 ? netWeight : grossWeight > 0 ? grossWeight : netWeight + stoneWeight,
      grossWeight,
      stoneWeight,
      vamc: wastagePct > 0 ? wastagePct : labour,
      stoneRate: item.stoneRate || 0,
      metalRate: item.metalRate || 0,
      amount: item.lineTotal,
      netWeight,
      wastagePct,
      labour,
      otherAmount: otherFromField || otherFromStone,
      hsnCode: item.hsnCode,
    };
  });

  const oldGoldSource = oldGoldPrintLines(invoice);

  const itemCount = sourceItems.reduce((sum, item) => sum + item.qty, 0);
  const oldGoldTotal = oldGoldSource.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const amountPayable = invoice.amountPayable ?? invoice.total;

  return {
    billNo: invoice.invoiceNo,
    billDateTime: formatBillDateTime(invoice.invoiceDate, invoice.createdAt),
    customerName: customer.name,
    customerGstin: customer.gstin ?? "",
    customerPhone: customer.phone ?? invoice.customerPhone ?? "",
    customerAddressLines: splitAddress(customer.address),
    lines,
    itemCount,
    subtotal: invoice.subtotal,
    cgst: invoice.cgst,
    sgst: invoice.sgst,
    igst: invoice.igst,
    discount: invoice.discount,
    discountBreakdown: discountBreakdown(invoice),
    total: invoice.total,
    oldGoldTotal,
    oldGoldLines: oldGoldSource,
    roundOff: invoice.roundOff ?? 0,
    amountPayable,
    amountPaid: invoice.amountPaid,
    amountInWords: amountInWords(amountPayable),
    goldRate: rates?.gold22k ?? 0,
    silverRate: rates?.silverFine ?? 0,
    paymentMode: invoice.paymentMode,
    balanceDue: invoice.balanceDue,
    payments: (invoice.payments ?? []).map((payment) => ({
      date: payment.date,
      mode: payment.mode,
      amount: payment.amount,
      note: payment.note,
    })),
  };
}
