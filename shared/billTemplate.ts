export interface BillTemplateSettings {
  cashTitle: string;
  cashNoLabel: string;
  cashDateLabel: string;
  cashCustomerPrefix: string;
  cashCustomerSign: string;
  cashForPrefix: string;
  taxTitle: string;
  taxGstinLabel: string;
  taxPhoneLabel: string;
  taxMobileLabel: string;
  taxBillNoLabel: string;
  taxDateLabel: string;
  taxBillToLabel: string;
  taxColParticulars: string;
  taxColTotWgt: string;
  taxColGrsWgt: string;
  taxColStnWgt: string;
  taxColVamc: string;
  taxColStoneRate: string;
  taxColMetalRate: string;
  taxColAmount: string;
  taxItemCountLabel: string;
  taxCgstLabel: string;
  taxSgstLabel: string;
  taxLessDiscountLabel: string;
  taxThanks: string;
  taxCustomerSign: string;
  marketRatesLabel: string;
  goldRateLabel: string;
  silverRateLabel: string;
  amountInWordsLabel: string;
  discountBreakdownLabel: string;
  netAmountLabel: string;
  roundOffLabel: string;
  totalLabel: string;
  receivedLabel: string;
  goodsReceivedLabel: string;
  thanksLabel: string;
}

export const DEFAULT_BILL_TEMPLATE: BillTemplateSettings = {
  cashTitle: "QUOTATION",
  cashNoLabel: "No.",
  cashDateLabel: "Date :",
  cashCustomerPrefix: "Thiru",
  cashCustomerSign: "Customer's Signature",
  cashForPrefix: "For",
  taxTitle: "GST TAX INVOICE",
  taxGstinLabel: "GSTIN :",
  taxPhoneLabel: "Phone :",
  taxMobileLabel: "Mobile :",
  taxBillNoLabel: "Bill No :",
  taxDateLabel: "Date :",
  taxBillToLabel: "BILL TO",
  taxColParticulars: "Particulars",
  taxColTotWgt: "Tot Wgt",
  taxColGrsWgt: "Grs Wgt",
  taxColStnWgt: "Stn Wgt",
  taxColVamc: "VA/MC",
  taxColStoneRate: "Stone Rate",
  taxColMetalRate: "Gld/Slvr Rate",
  taxColAmount: "Amount",
  taxItemCountLabel: "No. of Items :",
  taxCgstLabel: "cgst@1.5%",
  taxSgstLabel: "sgst@1.5%",
  taxLessDiscountLabel: "Less (Total Discount)",
  taxThanks: "Thank you visit again",
  taxCustomerSign: "Customer Signature",
  marketRatesLabel: "Current Market Rates :",
  goldRateLabel: "Gold :",
  silverRateLabel: "Silver :",
  amountInWordsLabel: "Total in words :",
  discountBreakdownLabel: "Discount Breakdown",
  netAmountLabel: "Net Amount",
  roundOffLabel: "RoundOff",
  totalLabel: "Total",
  receivedLabel: "Received Total",
  goodsReceivedLabel: "Goods received in Good Condition",
  thanksLabel: "Thank You Visit Again",
};

export const BILL_TEMPLATE_FIELDS = Object.keys(
  DEFAULT_BILL_TEMPLATE,
) as (keyof BillTemplateSettings)[];

export function templateSettingKey(field: keyof BillTemplateSettings): string {
  return `tpl_${field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`;
}

export type TemplatePreset = "detailed" | "compact" | "thermal" | "custom";

export interface CashBillVisibility {
  showLogo: boolean;
  showTagline: boolean;
  showGstin: boolean;
  showBisLogo: boolean;
  showQrCode: boolean;
  showMarketRates: boolean;
  showCustomerAddress: boolean;
  showCustomerPhone: boolean;
  showWastageCol: boolean;
  showOtherCol: boolean;
  showDiscountBreakdown: boolean;
  showSignatures: boolean;
  showThankYou: boolean;
}

export interface TaxInvoiceVisibility {
  showLogo: boolean;
  showTagline: boolean;
  showBisLogo: boolean;
  showQrCode: boolean;
  showMarketRates: boolean;
  showCustomerAddress: boolean;
  showWastageCol: boolean;
  showOtherCol: boolean;
  showDiscountBreakdown: boolean;
  showSignatures: boolean;
}

export const DEFAULT_CASH_VISIBILITY: CashBillVisibility = {
  showLogo: true,
  showTagline: true,
  showGstin: true,
  showBisLogo: true,
  showQrCode: true,
  showMarketRates: true,
  showCustomerAddress: true,
  showCustomerPhone: true,
  showWastageCol: true,
  showOtherCol: true,
  showDiscountBreakdown: true,
  showSignatures: true,
  showThankYou: true,
};

export const DEFAULT_TAX_VISIBILITY: TaxInvoiceVisibility = {
  showLogo: true,
  showTagline: true,
  showBisLogo: true,
  showQrCode: true,
  showMarketRates: true,
  showCustomerAddress: true,
  showWastageCol: true,
  showOtherCol: true,
  showDiscountBreakdown: true,
  showSignatures: true,
};

export const PRESET_CASH_VISIBILITY: Record<
  TemplatePreset,
  CashBillVisibility
> = {
  detailed: { ...DEFAULT_CASH_VISIBILITY },
  compact: {
    showLogo: true,
    showTagline: true,
    showGstin: true,
    showBisLogo: false,
    showQrCode: false,
    showMarketRates: true,
    showCustomerAddress: false,
    showCustomerPhone: true,
    showWastageCol: false,
    showOtherCol: false,
    showDiscountBreakdown: false,
    showSignatures: true,
    showThankYou: true,
  },
  thermal: {
    showLogo: false,
    showTagline: false,
    showGstin: true,
    showBisLogo: false,
    showQrCode: true,
    showMarketRates: false,
    showCustomerAddress: false,
    showCustomerPhone: true,
    showWastageCol: false,
    showOtherCol: false,
    showDiscountBreakdown: false,
    showSignatures: false,
    showThankYou: true,
  },
  custom: { ...DEFAULT_CASH_VISIBILITY },
};

export const PRESET_TAX_VISIBILITY: Record<
  TemplatePreset,
  TaxInvoiceVisibility
> = {
  detailed: { ...DEFAULT_TAX_VISIBILITY },
  compact: {
    showLogo: true,
    showTagline: true,
    showBisLogo: false,
    showQrCode: false,
    showMarketRates: true,
    showCustomerAddress: true,
    showWastageCol: false,
    showOtherCol: false,
    showDiscountBreakdown: false,
    showSignatures: true,
  },
  thermal: {
    showLogo: false,
    showTagline: false,
    showBisLogo: false,
    showQrCode: true,
    showMarketRates: false,
    showCustomerAddress: false,
    showWastageCol: false,
    showOtherCol: false,
    showDiscountBreakdown: false,
    showSignatures: false,
  },
  custom: { ...DEFAULT_TAX_VISIBILITY },
};

export const CASH_VISIBILITY_FIELDS = Object.keys(
  DEFAULT_CASH_VISIBILITY,
) as (keyof CashBillVisibility)[];
export const TAX_VISIBILITY_FIELDS = Object.keys(
  DEFAULT_TAX_VISIBILITY,
) as (keyof TaxInvoiceVisibility)[];

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  "detailed",
  "compact",
  "thermal",
  "custom",
];

export function parseTemplatePreset(value: string | undefined): TemplatePreset {
  if (
    value === "compact" ||
    value === "thermal" ||
    value === "custom" ||
    value === "detailed"
  ) {
    return value;
  }
  return "detailed";
}

export function visibilitySettingKey(
  kind: "cash" | "tax",
  field: string,
): string {
  return `vis_${kind}_${field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`;
}
