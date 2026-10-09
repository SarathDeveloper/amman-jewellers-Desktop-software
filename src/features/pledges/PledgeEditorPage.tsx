import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calculator,
  Calendar,
  Check,
  Eye,
  FileDown,
  Gavel,
  Gem,
  IdCard,
  IndianRupee,
  MapPin,
  Megaphone,
  MinusCircle,
  Percent,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Scale,
  ShoppingBag,
  Trash2,
  User,
  Users,
} from "lucide-react";
import {
  maxRepaymentDueDate,
  monthlyPledgeInterestAmount,
  netPaidAmount,
  pledgeAmountDueWithTopups,
  totalPayableAfterOneYear,
} from "@shared/billing/pledgeMath";
import {
  isAboveLtv,
  itemValue,
  maxLoanForValue,
  ratePerGram,
} from "@shared/billing/pledgeValuation";
import { localTodayIso } from "@shared/localDate";
import type {
  Customer,
  MetalRates,
  Pledge,
  PledgeAuctionInput,
  PledgeItemInput,
  PledgePaymentMode,
  PledgePayoff,
  PledgePhoto,
} from "@shared/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DateInput } from "../../components/DateInput";
import { LoadingState } from "../../components/LoadingState";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/toastContext";
import { api } from "../../lib/api";
import { formatCurrency, formatDisplayDate, formatWeight } from "../../lib/format";
import {
  numericFieldToNumber,
  parseNumericField,
  type NumericField,
} from "../../lib/numericField";
import { BillCustomerSearch } from "../invoices/BillCustomerSearch";
import { setBillingType } from "../invoices/billingType";
import { PledgePreviewModal } from "./PledgePreviewModal";
import { printPreviewPaths } from "../print/printPreviewPaths";
import { downloadPrintPdf } from "../print/downloadPrintPdf";
import { PLEDGE_PAYMENT_MODES } from "../dues/pledgePaymentModes";
import { RenewModal } from "../dues/RenewModal";
import { AuctionModal } from "../dues/AuctionModal";
import { PledgePhotosStrip } from "./PledgePhotosStrip";

type EditorItem = PledgeItemInput & { key: string };

const DEFAULT_PLEDGE_TYPE = "GOLD JEWELLERY";
const DEFAULT_INTEREST_PCT = 2.1;
const GOLD_PURITIES = ["24K", "22K", "18K", "14K"] as const;
const SILVER_PURITIES = ["999", "925", "900"] as const;

function todayIso(): string {
  return localTodayIso();
}

function roundWeight(value: number): number {
  return Math.round(Math.max(0, value) * 1000) / 1000;
}

function weightInputValue(weight: number | NumericField): number | "" {
  return weight === 0 ? "" : weight;
}

function newItem(): EditorItem {
  return {
    key: crypto.randomUUID(),
    description: "",
    identification: "",
    metal: "Gold",
    purity: "22K",
    grossWeight: 0,
    stoneWeight: 0,
    netWeight: 0,
    pieces: 1,
  };
}

function defaultPurityForMetal(metal: string): string {
  return metal === "Silver" ? "999" : "22K";
}

export function PledgeEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const { showToast } = useToast();

  const [pledge, setPledge] = useState<Pledge | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [pledgeDate, setPledgeDate] = useState(todayIso());
  const [pledgeType, setPledgeType] = useState(DEFAULT_PLEDGE_TYPE);
  const [guardianName, setGuardianName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [idProofType, setIdProofType] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [pan, setPan] = useState("");
  const [requireKyc, setRequireKyc] = useState(false);
  const [photos, setPhotos] = useState<PledgePhoto[]>([]);
  const [assessedValue, setAssessedValue] = useState<NumericField>(0);
  const [assessedOverridden, setAssessedOverridden] = useState(false);
  const [metalRates, setMetalRates] = useState<MetalRates | null>(null);
  const [ltvPct, setLtvPct] = useState(75);
  const [allowAboveLtv, setAllowAboveLtv] = useState(false);
  const [loanAmount, setLoanAmount] = useState<NumericField>(0);
  const [charges, setCharges] = useState<NumericField>(0);
  const [interestPct, setInterestPct] =
    useState<NumericField>(DEFAULT_INTEREST_PCT);
  const [items, setItems] = useState<EditorItem[]>([newItem()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [renewLoanOpen, setRenewLoanOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [auctionOpen, setAuctionOpen] = useState(false);
  const [auctionMode, setAuctionMode] = useState<"notice" | "auction">("notice");
  const [sanctionOpen, setSanctionOpen] = useState(false);
  const [afterSanction, setAfterSanction] = useState<"preview" | "pdf" | null>(
    null,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTargetId, setPreviewTargetId] = useState(0);
  const [savingPdf, setSavingPdf] = useState(false);
  const [redeemDate, setRedeemDate] = useState(todayIso());
  const [amountCollected, setAmountCollected] = useState<NumericField>(0);
  const [redeemDiscount, setRedeemDiscount] = useState<NumericField>(0);
  const [redeemMode, setRedeemMode] = useState<PledgePaymentMode>("cash");
  const [payoff, setPayoff] = useState<PledgePayoff | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [auctioning, setAuctioning] = useState(false);
  const [previewReceiptNo, setPreviewReceiptNo] = useState("");
  const [pledgeLoading, setPledgeLoading] = useState(!isNew);

  const isDraft = !pledge || pledge.status === "draft";
  const isActiveLoan = pledge?.status === "active";
  const canEdit = isDraft;
  const busy = saving || redeeming || auctioning || savingPdf || deleting;
  const jewelleryItems = items.length > 0 ? items : [newItem()];
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const totalGrossWeight = jewelleryItems.reduce(
    (sum, item) => sum + Number(item.grossWeight || 0),
    0,
  );
  const totalStoneWeight = jewelleryItems.reduce(
    (sum, item) => sum + Number(item.stoneWeight || 0),
    0,
  );
  const totalNetWeight = jewelleryItems.reduce(
    (sum, item) => sum + Number(item.netWeight || 0),
    0,
  );
  const repaymentDueDate = useMemo(
    () => maxRepaymentDueDate(pledgeDate || todayIso()),
    [pledgeDate],
  );
  const displayInterestPct = numericFieldToNumber(interestPct);
  const displayBillNo = pledge?.receiptNo || previewReceiptNo || "…";

  useEffect(() => {
    setBillingType("adagu");
  }, []);

  useEffect(() => {
    if (!isNew || pledge?.receiptNo) return;
    let active = true;
    void (async () => {
      try {
        const next = await api.getNextPledgeReceiptNo();
        if (active) setPreviewReceiptNo(next.receiptNo);
      } catch {
        if (active) setPreviewReceiptNo("");
      }
    })();
    return () => {
      active = false;
    };
  }, [isNew, pledge?.receiptNo]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [list, shop] = await Promise.all([
          api.listCustomers(),
          api.getShopSettings(),
        ]);
        if (!active) return;
        setCustomers(list);
        if (isNew) {
          setInterestPct(shop.adaguInterestPct);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load customers",
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [isNew]);

  useEffect(() => {
    if (isNew || !id) {
      setPledgeLoading(false);
      return;
    }
    setPledgeLoading(true);
    let active = true;
    void (async () => {
      try {
        const data = await api.getPledge(Number(id));
        if (!active) return;
        setPledge(data);
        setCustomerId(data.customerId);
        setCustomerName(data.customerName ?? "");
        setCustomerPhone(data.customerPhone ?? "");
        setPledgeDate(data.pledgeDate);
        setPledgeType(data.pledgeType || DEFAULT_PLEDGE_TYPE);
        setGuardianName(data.guardianName ?? "");
        setCustomerAddress(data.customerAddress ?? "");
        setPhotos(data.photos ?? []);
        setAssessedValue(data.assessedValue);
        setAssessedOverridden(true);
        setLoanAmount(data.loanAmount);
        setCharges(data.charges ?? 0);
        setInterestPct(data.interestPct);
        setAmountCollected(data.amountCollected || data.loanAmount);
        setItems(
          data.items.length > 0
            ? data.items.map((item) => ({
                key: String(item.id),
                description: item.description,
                identification: item.identification ?? "",
                metal: item.metal || "Gold",
                purity: item.purity,
                grossWeight: item.grossWeight,
                stoneWeight: item.stoneWeight ?? 0,
                netWeight: item.netWeight,
                pieces: item.pieces,
              }))
            : [newItem()],
        );
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load pledge",
          );
        }
      } finally {
        if (active) setPledgeLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [isNew, id]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [rates, shop] = await Promise.all([
          api.getLatestMetalRates(),
          api.getShopSettings(),
        ]);
        if (!active) return;
        setMetalRates(rates);
        setLtvPct(shop.pledgeLtvPct);
        setRequireKyc(shop.adaguRequireKyc);
      } catch {
        // Rates are optional; the loan can still be saved manually.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const netPaid = useMemo(
    () =>
      netPaidAmount(
        numericFieldToNumber(loanAmount),
        numericFieldToNumber(charges),
      ),
    [loanAmount, charges],
  );

  // KYC lives on the customer; keep the borrower card in step with the selection.
  useEffect(() => {
    if (!customerId) return;
    const customer = customers.find((row) => row.id === customerId);
    if (!customer) return;
    setIdProofType(customer.idProofType ?? "");
    setAadhaar(customer.aadhaar ?? "");
    setPan(customer.pan ?? "");
  }, [customerId, customers]);

  useEffect(() => {
    if (!redeemOpen || isNew || !id) return;
    let active = true;
    void (async () => {
      try {
        const data = await api.getPledgePayoff(Number(id), redeemDate || todayIso());
        if (active) setPayoff(data);
      } catch {
        if (active) setPayoff(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [redeemOpen, isNew, id, redeemDate]);

  const duePreview = useMemo(() => {
    const principal = numericFieldToNumber(loanAmount);
    const rate = numericFieldToNumber(interestPct);
    const collected = pledge?.amountCollected ?? 0;
    const topups = (pledge?.topups ?? []).map((topup) => ({
      amount: topup.amount,
      topupDate: topup.topupDate,
      interestPct: topup.interestPct,
    }));
    return pledgeAmountDueWithTopups(
      principal,
      topups,
      rate,
      pledgeDate,
      redeemDate || todayIso(),
      collected,
    );
  }, [
    loanAmount,
    interestPct,
    pledgeDate,
    redeemDate,
    pledge?.amountCollected,
    pledge?.topups,
  ]);

  const itemValuations = useMemo(
    () =>
      jewelleryItems.map((item) => ({
        rate: ratePerGram(metalRates, item.metal, item.purity),
        value: itemValue(
          metalRates,
          item.metal,
          item.purity,
          Number(item.netWeight || 0),
        ),
      })),
    [jewelleryItems, metalRates],
  );

  const computedAssessedValue = useMemo(
    () =>
      Math.round(
        itemValuations.reduce((sum, row) => sum + row.value, 0) * 100,
      ) / 100,
    [itemValuations],
  );

  const effectiveAssessedValue = assessedOverridden
    ? numericFieldToNumber(assessedValue)
    : computedAssessedValue;

  const hasRates = metalRates != null && (metalRates.gold24k > 0 || metalRates.silverFine > 0);
  const maxLoan = maxLoanForValue(effectiveAssessedValue, ltvPct);
  const aboveLtv = isAboveLtv(
    numericFieldToNumber(loanAmount),
    effectiveAssessedValue,
    ltvPct,
  );

  const loanSummaryPreview = useMemo(() => {
    const principal = numericFieldToNumber(loanAmount);
    const rate = numericFieldToNumber(interestPct);
    const billDate = pledgeDate || todayIso();
    const monthlyInterest = monthlyPledgeInterestAmount(principal, rate);
    const totalPayable = totalPayableAfterOneYear(principal, rate, billDate);
    return { monthlyInterest, totalPayable };
  }, [loanAmount, interestPct, pledgeDate]);

  function applyCustomerBorrower(customer: Customer) {
    setCustomerId(customer.id);
    setCustomerName(customer.name ?? "");
    setCustomerPhone(customer.phone ?? "");
    setGuardianName(customer.guardianName ?? "");
    setCustomerAddress(customer.address ?? "");
    setIdProofType(customer.idProofType ?? "");
    setAadhaar(customer.aadhaar ?? "");
    setPan(customer.pan ?? "");
  }

  function clearBorrower() {
    setCustomerId(0);
    setCustomerName("");
    setCustomerPhone("");
    setGuardianName("");
    setCustomerAddress("");
    setIdProofType("");
    setAadhaar("");
    setPan("");
  }

  function setPaidAmount(value: number) {
    const loan = numericFieldToNumber(loanAmount);
    setCharges(
      Math.max(0, Math.round((loan - Math.max(0, value)) * 100) / 100),
    );
  }

  function updateItem(itemKey: string, patch: Partial<EditorItem>) {
    setItems((current) => {
      const list = current.length > 0 ? current : [newItem()];
      return list.map((item) => {
        if (item.key !== itemKey) return item;
        const next = { ...item, ...patch };
        if ("grossWeight" in patch || "stoneWeight" in patch) {
          if (!("netWeight" in patch)) {
            next.netWeight = roundWeight(
              Number(next.grossWeight) - Number(next.stoneWeight || 0),
            );
          }
        }
        return next;
      });
    });
  }

  function selectMetal(item: EditorItem, nextMetal: "Gold" | "Silver") {
    const nextPurity =
      nextMetal === "Silver"
        ? SILVER_PURITIES.includes(
            item.purity as (typeof SILVER_PURITIES)[number],
          )
          ? item.purity
          : defaultPurityForMetal("Silver")
        : GOLD_PURITIES.includes(item.purity as (typeof GOLD_PURITIES)[number])
          ? item.purity
          : defaultPurityForMetal("Gold");
    updateItem(item.key, { metal: nextMetal, purity: nextPurity });
  }

  function addItem() {
    setItems((current) => [...(current.length > 0 ? current : [newItem()]), newItem()]);
  }

  function removeItem(itemKey: string) {
    setItems((current) => {
      const next = current.filter((item) => item.key !== itemKey);
      return next.length > 0 ? next : [newItem()];
    });
  }

  async function ensureCustomerId(): Promise<number> {
    const name = customerName.trim();
    if (!name) throw new Error("Enter customer name");

    const existing = selectedCustomer;
    if (existing) {
      const updated = await api.updateCustomer(existing.id, {
        name,
        phone: customerPhone.replace(/\D/g, "").slice(0, 10),
        address: customerAddress.trim(),
        guardianName: guardianName.trim(),
        notes: "",
        gstin: existing.gstin ?? "",
        aadhaar: aadhaar.replace(/\D/g, "").slice(0, 12),
        pan: pan.trim().toUpperCase(),
        idProofType: idProofType.trim(),
      });
      setCustomers((current) =>
        current.map((row) => (row.id === updated.id ? updated : row)),
      );
      setCustomerId(updated.id);
      return updated.id;
    }

    const created = await api.createCustomer({
      name,
      phone: customerPhone.replace(/\D/g, "").slice(0, 10),
      address: customerAddress.trim(),
      guardianName: guardianName.trim(),
      notes: "",
      gstin: "",
      aadhaar: aadhaar.replace(/\D/g, "").slice(0, 12),
      pan: pan.trim().toUpperCase(),
      idProofType: idProofType.trim(),
    });
    setCustomers((current) => [created, ...current]);
    setCustomerId(created.id);
    return created.id;
  }

  function buildPayload(resolvedCustomerId: number) {
    const list = items.length > 0 ? items : [newItem()];
    return {
      customerId: resolvedCustomerId,
      pledgeDate,
      pledgeType: pledgeType.trim() || DEFAULT_PLEDGE_TYPE,
      guardianName: guardianName.trim(),
      customerAddress: customerAddress.trim(),
      assessedValue: effectiveAssessedValue,
      loanAmount: numericFieldToNumber(loanAmount),
      charges: numericFieldToNumber(charges),
      interestPct: numericFieldToNumber(interestPct),
      repaymentDueDate,
      notes: "",
      allowAboveLtv: aboveLtv ? allowAboveLtv : false,
      items: list.map((item) => ({
        description: item.description,
        identification: item.identification ?? "",
        metal: item.metal || "Gold",
        purity: item.purity,
        grossWeight: Number(item.grossWeight) || 0,
        stoneWeight: Number(item.stoneWeight) || 0,
        netWeight: Number(item.netWeight) || 0,
        pieces: Number(item.pieces) || 1,
        ratePerGram: ratePerGram(metalRates, item.metal, item.purity),
        itemValue: itemValue(
          metalRates,
          item.metal,
          item.purity,
          Number(item.netWeight) || 0,
        ),
      })),
    };
  }

  function validatePayload(payload: ReturnType<typeof buildPayload>) {
    if (!payload.customerId) throw new Error("Enter customer name");
    if (payload.items.some((item) => !item.description.trim())) {
      throw new Error("Enter description of jewells");
    }
    if (payload.loanAmount <= 0) throw new Error("Enter loan amount");
    return payload;
  }

  async function persistDraft(): Promise<Pledge | null> {
    try {
      setSaving(true);
      setError(null);
      const resolvedCustomerId = await ensureCustomerId();
      const payload = validatePayload(buildPayload(resolvedCustomerId));
      if (isNew && !pledge?.id) {
        const created = await api.createPledge(payload);
        setPledge(created);
        navigate(`/billing/adagu/${created.id}`, { replace: true });
        return created;
      }
      const targetId = pledge?.id ?? Number(id);
      const updated = await api.updatePledge({ id: targetId, ...payload });
      setPledge(updated);
      return updated;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save pledge");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    const saved = await persistDraft();
    if (saved) showToast("Draft saved", "success");
  }

  async function sanctionLoan() {
    setSanctionOpen(false);
    const pending = afterSanction;
    setAfterSanction(null);
    if (requireKyc && !aadhaar.trim() && !pan.trim()) {
      setError(
        "KYC is required: enter the borrower Aadhaar or PAN before sanctioning",
      );
      return;
    }
    const saved = await persistDraft();
    if (!saved) return;
    let result = saved;
    if (saved.status === "draft") {
      try {
        setSaving(true);
        setError(null);
        result = await api.sanctionPledge(saved.id, {
          allowAboveLtv: aboveLtv ? allowAboveLtv : false,
        });
        setPledge(result);
        showToast("Loan sanctioned", "success");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to sanction loan");
        return;
      } finally {
        setSaving(false);
      }
    } else {
      showToast("Adagu bill updated", "success");
    }
    if (pending === "preview") {
      setPreviewTargetId(result.id);
      setPreviewOpen(true);
    }
    if (pending === "pdf") {
      try {
        setSavingPdf(true);
        await downloadPrintPdf(
          printPreviewPaths.pledge(result.id),
          `${result.receiptNo}.pdf`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to download PDF");
      } finally {
        setSavingPdf(false);
      }
      return;
    }
  }

  async function openPreview() {
    try {
      setError(null);
      const saved = await persistDraft();
      if (!saved) return;
      setPreviewTargetId(saved.id);
      setPreviewOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open preview");
    }
  }

  async function downloadPdf() {
    try {
      setError(null);
      setSavingPdf(true);
      const saved = await persistDraft();
      if (!saved) return;
      await downloadPrintPdf(
        printPreviewPaths.pledge(saved.id),
        `${saved.receiptNo}.pdf`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download PDF");
    } finally {
      setSavingPdf(false);
    }
  }

  async function redeemFull() {
    try {
      setRedeeming(true);
      setError(null);
      const targetId = pledge?.id ?? Number(id);
      if (!targetId) throw new Error("Sanction the loan before redeeming");
      const updated = await api.redeemPledge({
        id: targetId,
        redeemedDate: redeemDate,
        amountCollected: numericFieldToNumber(amountCollected),
        discount: numericFieldToNumber(redeemDiscount),
        mode: redeemMode,
      });
      setPledge(updated);
      setRedeemOpen(false);
      showToast("Pledge redeemed", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to redeem pledge");
    } finally {
      setRedeeming(false);
    }
  }

  async function collectPartial() {
    try {
      setRedeeming(true);
      setError(null);
      const targetId = pledge?.id ?? Number(id);
      if (!targetId) throw new Error("Sanction the loan before collecting");
      const updated = await api.collectPledge({
        id: targetId,
        collectedDate: redeemDate,
        amount: numericFieldToNumber(amountCollected),
        mode: redeemMode,
      });
      setPledge(updated);
      setRedeemOpen(false);
      showToast(
        updated.status === "redeemed"
          ? "Pledge fully redeemed"
          : "Partial collection recorded",
        "success",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to collect payment",
      );
    } finally {
      setRedeeming(false);
    }
  }

  async function sendAuctionNotice(input: { noticeDate: string }) {
    try {
      setAuctioning(true);
      setError(null);
      const targetId = pledge?.id ?? Number(id);
      if (!targetId) throw new Error("Sanction the loan before sending a notice");
      await api.sendPledgeAuctionNotice({
        id: targetId,
        noticeDate: input.noticeDate,
      });
      setAuctionOpen(false);
      showToast("Auction notice saved", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save auction notice");
    } finally {
      setAuctioning(false);
    }
  }

  async function recordAuction(input: Omit<PledgeAuctionInput, "id">) {
    try {
      setAuctioning(true);
      setError(null);
      const targetId = pledge?.id ?? Number(id);
      if (!targetId) throw new Error("Sanction the loan before recording an auction");
      const updated = await api.recordPledgeAuction({ id: targetId, ...input });
      setPledge(updated);
      setAuctionOpen(false);
      showToast("Auction recorded", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record auction");
    } finally {
      setAuctioning(false);
    }
  }

  async function renewLoan(input: {
    renewDate: string;
    mode: PledgePaymentMode;
    newLoanAmount: number;
    note: string;
  }) {
    try {
      setRedeeming(true);
      setError(null);
      const targetId = pledge?.id ?? Number(id);
      if (!targetId) throw new Error("Sanction the loan before renewing");
      const created = await api.renewPledge({
        id: targetId,
        renewDate: input.renewDate,
        mode: input.mode,
        newLoanAmount: input.newLoanAmount,
        note: input.note,
      });
      setRenewLoanOpen(false);
      showToast(`Loan renewed as ${created.receiptNo}`, "success");
      setPreviewTargetId(created.id);
      setPreviewOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to renew loan");
    } finally {
      setRedeeming(false);
    }
  }

  async function deleteDraft() {
    try {
      setDeleting(true);
      setError(null);
      const targetId = pledge?.id ?? Number(id);
      if (!targetId) throw new Error("Nothing to delete");
      await api.deletePledge(targetId);
      setDeleteOpen(false);
      showToast("Draft deleted", "success");
      navigate("/billing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete draft");
    } finally {
      setDeleting(false);
    }
  }

  const statusLabel =
    pledge?.status === "redeemed"
      ? "Redeemed"
      : pledge?.status === "forfeited"
        ? "Forfeited"
        : pledge?.status === "renewed"
          ? "Renewed"
          : pledge?.status === "active"
            ? "Active"
            : "Draft";

  if (pledgeLoading) {
    return (
      <div className="adagu-editor-container sale-bill-editor">
        <div className="adagu-page-header sale-bill-toolbar">
          <div className="adagu-header-titles">
            <h1>Loading pledge…</h1>
          </div>
        </div>
        <LoadingState rows={6} />
      </div>
    );
  }

  return (
    <div className="adagu-editor-container sale-bill-editor">
      <header className="adagu-page-header sale-bill-toolbar">
        <div className="adagu-header-left">
          <div className="adagu-header-icon">
            <Gem size={18} strokeWidth={1.75} />
          </div>
          <div className="adagu-header-titles">
            <h1>Adagu Bill</h1>
            {pledge?.renewedFromId ? (
              <Link
                className="adagu-header-renew-link"
                to={`/billing/adagu/${pledge.renewedFromId}`}
              >
                Renewed from {pledge.renewedFromReceiptNo || `ADG #${pledge.renewedFromId}`}
              </Link>
            ) : null}
            {pledge?.renewedToId ? (
              <Link
                className="adagu-header-renew-link"
                to={`/billing/adagu/${pledge.renewedToId}`}
              >
                Renewed to {pledge.renewedToReceiptNo || `ADG #${pledge.renewedToId}`}
              </Link>
            ) : null}
          </div>
          <div className="sale-bill-meta">
            <label className="sale-bill-meta-field">
              <span>Bill Date</span>
              <DateInput
                disabled={!canEdit || busy}
                value={pledgeDate}
                ariaLabel="Bill Date"
                onChange={(value) => {
                  setPledgeDate(value || todayIso());
                }}
              />
            </label>
            <div className="sale-bill-meta-field">
              <span>Bill No.</span>
              <input type="text" value={displayBillNo} disabled />
            </div>
            <div className="sale-bill-meta-field">
              <span>Status</span>
              <span
                className={`adagu-status-dot${isActiveLoan ? " active" : ""}`}
                aria-hidden
              />
              <strong className="sale-bill-meta-status">{statusLabel}</strong>
            </div>
          </div>
        </div>
        <div className="adagu-header-actions">
          <span className="sale-bill-mobile-total">
            <span>Loan</span>
            <strong>{formatCurrency(numericFieldToNumber(loanAmount))}</strong>
          </span>
          <Link to="/billing" className="btn ghost">
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden /> Back
          </Link>
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => window.location.reload()}
          >
            <RotateCcw size={16} /> Reset
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => void openPreview()}
          >
            <Eye size={16} strokeWidth={1.75} aria-hidden /> Preview
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() => void downloadPdf()}
          >
            <FileDown size={16} strokeWidth={1.75} aria-hidden /> {savingPdf ? "Saving…" : "PDF"}
          </button>
          {isDraft ? (
            <>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => void saveDraft()}
              >
                <Save size={16} strokeWidth={1.75} aria-hidden />
                {saving ? "Saving…" : "Save draft"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => {
                  setAfterSanction("pdf");
                  setSanctionOpen(true);
                }}
              >
                <FileDown size={16} strokeWidth={1.75} aria-hidden />
                {saving ? "Generating…" : "Generate"}
              </button>
              {!isNew ? (
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 size={16} strokeWidth={1.75} aria-hidden /> Delete
                </button>
              ) : null}
            </>
          ) : null}
          {isActiveLoan ? (
            <>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => setRenewLoanOpen(true)}
              >
                <RotateCcw size={16} strokeWidth={1.75} aria-hidden />
                Renew
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => {
                  setAuctionMode("notice");
                  setAuctionOpen(true);
                }}
              >
                <Megaphone size={16} strokeWidth={1.75} aria-hidden />
                Auction notice
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => {
                  setAuctionMode("auction");
                  setAuctionOpen(true);
                }}
              >
                <Gavel size={16} strokeWidth={1.75} aria-hidden />
                Record auction
              </button>
              <button
                type="button"
                className="btn btn-accent"
                disabled={busy}
                onClick={() => {
                  setAmountCollected(
                    duePreview.remaining || numericFieldToNumber(loanAmount),
                  );
                  setRedeemDiscount(0);
                  setRedeemMode("cash");
                  setRedeemDate(todayIso());
                  setRedeemOpen(true);
                }}
              >
                <Check size={16} strokeWidth={2} aria-hidden /> Collect / Redeem
              </button>
            </>
          ) : null}
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="sale-bill-grid">
        <div className="adagu-grid-col sale-bill-main">
          <div className="adagu-design-card adagu-design-card--has-search">
            <div className="adagu-card-header sale-bill-customer-header">
              <div className="adagu-card-title-group">
                <div className="adagu-card-icon">
                  <User size={16} strokeWidth={1.75} />
                </div>
                <div className="adagu-card-titles">
                  <h2>Borrower Details</h2>
                </div>
              </div>
              <div className="sale-bill-customer-search-wrap">
                <BillCustomerSearch
                  customers={customers}
                  customerId={customerId}
                  disabled={!canEdit || busy}
                  hideLabel
                  hideSelectedMeta
                  keepSearchEmpty
                  addButtonLabel="New"
                  onSelect={(customer) => applyCustomerBorrower(customer)}
                  onClear={clearBorrower}
                  onCustomerCreated={(customer) => {
                    setCustomers((current) => [customer, ...current]);
                    applyCustomerBorrower(customer);
                  }}
                  onError={setError}
                />
              </div>
            </div>

            <div className="adagu-form-fields two-col">
              <div className="adagu-field">
                <label>
                  Customer Name <span className="req">*</span>
                </label>
                <div className="adagu-input-with-icon">
                  <User size={16} className="input-icon" />
                  <input
                    disabled={!canEdit || busy}
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="sarath"
                  />
                  {customerName && (
                    <button
                      type="button"
                      className="btn ghost"
                      style={{
                        padding: 0,
                        width: "auto",
                        height: "auto",
                        minHeight: 0,
                      }}
                      onClick={() => clearBorrower()}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="adagu-field">
                <label>
                  Mobile Number <span className="req">*</span>
                </label>
                <div className="adagu-input-with-icon">
                  <Phone size={16} className="input-icon" />
                  <input
                    disabled={!canEdit || busy}
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                    placeholder="Mobile number"
                  />
                </div>
              </div>
              <div className="adagu-field" style={{ gridColumn: "1 / -1" }}>
                <label>Father / Mother / Husband Name</label>
                <div className="adagu-input-with-icon">
                  <Users size={16} className="input-icon" />
                  <input
                    disabled={!canEdit || busy}
                    value={guardianName}
                    onChange={(event) => setGuardianName(event.target.value)}
                    placeholder="Father / Mother / Husband"
                  />
                </div>
              </div>
              <div className="adagu-field" style={{ gridColumn: "1 / -1" }}>
                <label>Address</label>
                <div className="adagu-input-with-icon">
                  <MapPin size={16} className="input-icon" />
                  <textarea
                    rows={1}
                    disabled={!canEdit || busy}
                    value={customerAddress}
                    onChange={(event) => setCustomerAddress(event.target.value)}
                    placeholder="Address"
                  />
                </div>
              </div>
              <div className="adagu-field">
                <label>ID Proof Type</label>
                <div className="adagu-input-with-icon">
                  <IdCard size={16} className="input-icon" />
                  <select
                    className="adagu-purity-select"
                    disabled={!canEdit || busy}
                    value={idProofType}
                    onChange={(event) => setIdProofType(event.target.value)}
                  >
                    <option value="">Not recorded</option>
                    <option value="Aadhaar">Aadhaar</option>
                    <option value="PAN">PAN</option>
                    <option value="Voter ID">Voter ID</option>
                    <option value="Driving Licence">Driving Licence</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div className="adagu-field">
                <label>Aadhaar</label>
                <div className="adagu-input-with-icon">
                  <IdCard size={16} className="input-icon" />
                  <input
                    disabled={!canEdit || busy}
                    inputMode="numeric"
                    maxLength={12}
                    value={aadhaar}
                    onChange={(event) =>
                      setAadhaar(event.target.value.replace(/\D/g, "").slice(0, 12))
                    }
                    placeholder="12 digits"
                  />
                </div>
              </div>
              <div className="adagu-field">
                <label>PAN</label>
                <div className="adagu-input-with-icon">
                  <IdCard size={16} className="input-icon" />
                  <input
                    disabled={!canEdit || busy}
                    maxLength={10}
                    value={pan}
                    onChange={(event) =>
                      setPan(
                        event.target.value
                          .replace(/[^a-zA-Z0-9]/g, "")
                          .toUpperCase()
                          .slice(0, 10),
                      )
                    }
                    placeholder="AAAAA9999A"
                  />
                </div>
              </div>
            </div>

            {requireKyc && !aadhaar.trim() && !pan.trim() ? (
              <div className="adagu-banner adagu-banner--warning">
                KYC is required by settings. Enter the borrower Aadhaar or PAN before sanctioning.
              </div>
            ) : null}

            <div className="adagu-borrower-photos">
              <PledgePhotosStrip
                pledgeId={pledge?.id ?? 0}
                photos={photos}
                kind="customer"
                label="Borrower photo"
                editable={canEdit}
                busy={busy}
                onChanged={setPhotos}
                onError={setError}
              />
              <PledgePhotosStrip
                pledgeId={pledge?.id ?? 0}
                photos={photos}
                kind="id_proof"
                label="ID proof photo"
                editable={canEdit}
                busy={busy}
                onChanged={setPhotos}
                onError={setError}
              />
            </div>
          </div>

          <div className="adagu-design-card adagu-design-card--items-panel">
            <div className="adagu-card-header sale-bill-items-header">
              <div className="adagu-card-title-group">
                <div className="adagu-card-icon">
                  <Gem size={16} strokeWidth={1.75} />
                </div>
                <div className="adagu-card-titles">
                  <h2>Jewellery Details</h2>
                </div>
              </div>
              <button
                type="button"
                className="adagu-btn-add-item"
                disabled={!canEdit || busy}
                onClick={addItem}
              >
                <Plus size={14} /> Add Item
              </button>
            </div>

            <div className="adagu-jewellery-table-wrap sale-bill-items-wrap">
            <table className="adagu-jewellery-table adagu-jewellery-table--pledge">
              <thead>
                <tr>
                  <th className="adagu-col-index">#</th>
                  <th className="adagu-col-metal">Metal</th>
                  <th className="adagu-col-purity">Purity</th>
                  <th className="adagu-col-weight">Gross Wt. (gms)</th>
                  <th className="adagu-col-weight">Deductions (gms)</th>
                  <th className="adagu-col-weight">Net Wt. (gms)</th>
                  <th className="adagu-col-weight">Rate / gm</th>
                  <th className="adagu-col-weight">Value</th>
                  <th className="adagu-col-action">
                    <span className="adagu-sr-only">Remove item</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {jewelleryItems.map((item, index) => {
                  const rowMetal = item.metal === "Silver" ? "Silver" : "Gold";
                  const rowPurityOptions =
                    rowMetal === "Silver" ? SILVER_PURITIES : GOLD_PURITIES;
                  return (
                    <Fragment key={item.key}>
                      <tr data-item={index + 1}>
                        <td className="adagu-col-index">{index + 1}</td>
                        <td className="adagu-col-metal" data-label="Metal">
                          <div className="adagu-metal-switch">
                            <button
                              type="button"
                              className={`adagu-metal-btn${rowMetal === "Gold" ? " active gold" : ""}`}
                              disabled={!canEdit || busy}
                              onClick={() => selectMetal(item, "Gold")}
                            >
                              Gold
                            </button>
                            <button
                              type="button"
                              className={`adagu-metal-btn${rowMetal === "Silver" ? " active silver" : ""}`}
                              disabled={!canEdit || busy}
                              onClick={() => selectMetal(item, "Silver")}
                            >
                              Silver
                            </button>
                          </div>
                        </td>
                        <td className="adagu-col-purity" data-label="Purity">
                          <div className="adagu-input-with-icon adagu-purity-wrap">
                            <select
                              className="adagu-purity-select"
                              disabled={!canEdit || busy}
                              value={item.purity}
                              onChange={(e) =>
                                updateItem(item.key, { purity: e.target.value })
                              }
                            >
                              {rowPurityOptions.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="adagu-col-weight" data-label="Gross Wt. (gms)">
                          <div className="adagu-input-with-icon">
                            <input
                              type="number"
                              step="0.001"
                              disabled={!canEdit || busy}
                              value={weightInputValue(item.grossWeight)}
                              onChange={(event) =>
                                updateItem(item.key, {
                                  grossWeight: Number(event.target.value) || 0,
                                })
                              }
                            />
                          </div>
                        </td>
                        <td className="adagu-col-weight" data-label="Deductions (gms)">
                          <div className="adagu-input-with-icon">
                            <input
                              type="number"
                              step="0.001"
                              disabled={!canEdit || busy}
                              value={weightInputValue(item.stoneWeight ?? 0)}
                              onChange={(event) =>
                                updateItem(item.key, {
                                  stoneWeight: Number(event.target.value) || 0,
                                })
                              }
                            />
                          </div>
                        </td>
                        <td className="adagu-col-weight" data-label="Net Wt. (gms)">
                          <div className="adagu-input-with-icon adagu-net-weight-input">
                            <input
                              type="number"
                              step="0.001"
                              disabled={!canEdit || busy}
                              value={weightInputValue(item.netWeight)}
                              onChange={(event) =>
                                updateItem(item.key, {
                                  netWeight: Number(event.target.value) || 0,
                                })
                              }
                            />
                          </div>
                        </td>
                        <td className="adagu-col-value" data-label="Rate / gm">
                          <span className="adagu-item-rate">
                            {formatCurrency(itemValuations[index]?.rate ?? 0)}
                          </span>
                        </td>
                        <td className="adagu-col-value" data-label="Value">
                          <span className="adagu-item-value">
                            {formatCurrency(itemValuations[index]?.value ?? 0)}
                          </span>
                        </td>
                        <td className="adagu-col-action">
                          <button
                            type="button"
                            className="adagu-action-btn-red"
                            disabled={!canEdit || busy || jewelleryItems.length <= 1}
                            onClick={() => removeItem(item.key)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={9} className="adagu-item-description-cell">
                          <div className="adagu-input-with-icon adagu-item-description">
                            <textarea
                              rows={1}
                              disabled={!canEdit || busy}
                              value={item.description}
                              onChange={(event) =>
                                updateItem(item.key, {
                                  description: event.target.value,
                                })
                              }
                              placeholder="Description (Optional)"
                            />
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>

            <div className="sale-bill-summary-stats sale-bill-summary-stats--weights">
              <div className="sale-bill-summary-stat">
                <div className="sale-bill-summary-stat-icon" aria-hidden>
                  <Scale size={16} strokeWidth={1.75} />
                </div>
                <div>
                  <span>Gross Weight</span>
                  <strong>{formatWeight(totalGrossWeight, 3)}</strong>
                </div>
              </div>
              <div className="sale-bill-summary-stat">
                <div className="sale-bill-summary-stat-icon" aria-hidden>
                  <MinusCircle size={16} strokeWidth={1.75} />
                </div>
                <div>
                  <span>Deductions</span>
                  <strong>{formatWeight(totalStoneWeight, 3)}</strong>
                </div>
              </div>
              <div className="sale-bill-summary-stat">
                <div className="sale-bill-summary-stat-icon" aria-hidden>
                  <ShoppingBag size={16} strokeWidth={1.75} />
                </div>
                <div>
                  <span>Net Weight</span>
                  <strong>{formatWeight(totalNetWeight, 3)}</strong>
                </div>
              </div>
            </div>

            <PledgePhotosStrip
              pledgeId={pledge?.id ?? 0}
              photos={photos}
              kind="item"
              label="Item photos"
              editable={canEdit}
              busy={busy}
              onChanged={setPhotos}
              onError={setError}
            />
          </div>
        </div>

        <div className="adagu-grid-col sale-bill-rail">
          <div className="adagu-design-card">
            <div className="adagu-card-header">
              <div className="adagu-card-title-group">
                <div
                  className="adagu-card-icon"
                  style={{
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                  }}
                >
                  <IndianRupee size={14} strokeWidth={1.75} />
                </div>
                <div className="adagu-card-titles">
                  <h2>Loan Details</h2>
                </div>
              </div>
            </div>

            <div className="adagu-form-fields two-col">
              <div className="adagu-field">
                <label>
                  Loan Amount <span className="req">*</span>
                </label>
                <div className="adagu-input-with-icon">
                  <IndianRupee size={14} className="input-icon" />
                  <input
                    type="number"
                    step="0.01"
                    disabled={!canEdit || busy}
                    value={weightInputValue(loanAmount)}
                    onChange={(event) =>
                      setLoanAmount(parseNumericField(event.target.value))
                    }
                  />
                </div>
              </div>
              <div className="adagu-field">
                <label>Paid Amount</label>
                <div className="adagu-input-with-icon">
                  <IndianRupee size={14} className="input-icon" />
                  <input
                    type="number"
                    step="0.01"
                    disabled={!canEdit || busy}
                    value={weightInputValue(netPaid)}
                    onChange={(event) =>
                      setPaidAmount(Number(event.target.value) || 0)
                    }
                  />
                </div>
              </div>
              <div className="adagu-field">
                <label>
                  Interest Rate (%) <span className="req">*</span>
                </label>
                <div className="adagu-input-with-icon">
                  <Percent size={14} className="input-icon" />
                  <input
                    type="number"
                    step="0.01"
                    disabled
                    readOnly
                    value={weightInputValue(interestPct)}
                  />
                </div>
                <span className="adagu-field-hint">
                  Set in Settings → Billing POS
                </span>
              </div>
              <div className="adagu-field">
                <label>Deduction</label>
                <div className="adagu-input-with-icon">
                  <IndianRupee size={14} className="input-icon" />
                  <input
                    type="number"
                    step="0.01"
                    disabled={!canEdit || busy}
                    value={weightInputValue(charges)}
                    onChange={(event) =>
                      setCharges(parseNumericField(event.target.value))
                    }
                  />
                </div>
              </div>
              <div className="adagu-field">
                <label>Assessed Value</label>
                <div className="adagu-input-with-icon">
                  <IndianRupee size={14} className="input-icon" />
                  <input
                    type="number"
                    step="0.01"
                    disabled={!canEdit || busy}
                    value={weightInputValue(assessedValue)}
                    onChange={(event) => {
                      setAssessedOverridden(true);
                      setAssessedValue(parseNumericField(event.target.value));
                    }}
                  />
                </div>
                {assessedOverridden ? (
                  <button
                    type="button"
                    className="adagu-link-button"
                    disabled={!canEdit || busy}
                    onClick={() => {
                      setAssessedOverridden(false);
                      setAssessedValue(0);
                    }}
                  >
                    <RotateCcw size={12} /> Auto from items (
                    {formatCurrency(computedAssessedValue)})
                  </button>
                ) : (
                  <span className="adagu-field-hint">
                    Auto-summed from item rates
                  </span>
                )}
              </div>
              <div className="adagu-field" style={{ gridColumn: "1 / -1" }}>
                <span className="adagu-ltv-line">
                  Max loan ({ltvPct}% LTV):{" "}
                  <strong>{formatCurrency(maxLoan)}</strong>
                  <button
                    type="button"
                    className="adagu-link-button"
                    disabled={!canEdit || busy || maxLoan <= 0}
                    onClick={() => setLoanAmount(maxLoan)}
                  >
                    Use max
                  </button>
                </span>
                {!hasRates ? (
                  <div className="adagu-banner adagu-banner--warning">
                    No metal rates for today.{" "}
                    <Link to="/rates">Update Rates</Link> to assess value
                    automatically.
                  </div>
                ) : null}
                {aboveLtv ? (
                  <div className="adagu-banner adagu-banner--warning">
                    Loan is above the {ltvPct}% LTV limit.
                    <label className="adagu-banner-check">
                      <input
                        type="checkbox"
                        checked={allowAboveLtv}
                        disabled={!canEdit || busy}
                        onChange={(event) =>
                          setAllowAboveLtv(event.target.checked)
                        }
                      />
                      Admin override (allow above LTV)
                    </label>
                  </div>
                ) : null}
              </div>
              <div className="adagu-field" style={{ gridColumn: "1 / -1" }}>
                <label>
                  Due Date <span className="req">*</span>
                </label>
                <span className="adagu-due-range">
                  <Calendar size={14} aria-hidden />
                  {formatDisplayDate(pledgeDate || todayIso())} –{" "}
                  {formatDisplayDate(repaymentDueDate)}
                </span>
              </div>
            </div>
          </div>

          <div className="adagu-design-card">
            <div className="adagu-card-header">
              <div className="adagu-card-title-group">
                <div
                  className="adagu-card-icon"
                  style={{
                    background: "var(--surface-muted)",
                    color: "var(--text)",
                  }}
                >
                  <Calculator size={16} strokeWidth={1.75} />
                </div>
                <div className="adagu-card-titles">
                  <h2>Calculated Summary</h2>
                </div>
              </div>
            </div>

            <div className="adagu-calculated-summary">
              <div className="adagu-calculated-list">
                <div className="adagu-calculated-row">
                  <span className="label">
                    <ShoppingBag size={14} /> Net Weight
                  </span>
                  <span className="value">
                    {formatWeight(totalNetWeight, 3)}
                  </span>
                </div>
                <div className="adagu-calculated-row">
                  <span className="label">
                    <Percent size={14} /> Interest Rate
                  </span>
                  <span className="value">{displayInterestPct}% per month</span>
                </div>
                <div className="adagu-calculated-row">
                  <span className="label">
                    <Percent size={14} /> Monthly Interest
                  </span>
                  <span className="value">
                    {formatCurrency(loanSummaryPreview.monthlyInterest)}
                  </span>
                </div>
                <div className="adagu-calculated-row">
                  <span className="label">
                    <IndianRupee size={14} /> Loan Amount
                  </span>
                  <span className="value">
                    {formatCurrency(numericFieldToNumber(loanAmount))}
                  </span>
                </div>
                <div className="adagu-calculated-row">
                  <span className="label">
                    <IndianRupee size={14} /> Total Payable (with interest)
                  </span>
                  <span className="value">
                    {formatCurrency(loanSummaryPreview.totalPayable)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {redeemOpen ? (
        <Modal
          title="Collect / Redeem"
          onClose={() => setRedeemOpen(false)}
          footer={
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() => setRedeemOpen(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => void collectPartial()}
              >
                Record collection
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void redeemFull()}
              >
                Full redeem
              </button>
            </div>
          }
        >
          <dl className="dues-detail-totals">
            <div>
              <dt>Principal outstanding</dt>
              <dd className="num">
                {formatCurrency(payoff?.principalOutstanding ?? numericFieldToNumber(loanAmount))}
              </dd>
            </div>
            <div>
              <dt>Interest due</dt>
              <dd className="num">
                {formatCurrency(payoff?.interestDue ?? duePreview.interest)}
              </dd>
            </div>
            <div>
              <dt>Interest paid up to</dt>
              <dd>
                {payoff?.interestPaidUpto
                  ? formatDisplayDate(payoff.interestPaidUpto)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Payoff</dt>
              <dd className="num">
                <strong>
                  {formatCurrency(payoff?.payoff ?? duePreview.remaining)}
                </strong>
              </dd>
            </div>
          </dl>
          <div className="form-grid">
            <label>
              Date
              <DateInput
                className="input"
                value={redeemDate}
                onChange={(value) => setRedeemDate(value || todayIso())}
              />
            </label>
            <label>
              Amount collected
              <input
                className="input"
                type="number"
                step="0.01"
                value={amountCollected}
                onChange={(event) =>
                  setAmountCollected(parseNumericField(event.target.value))
                }
              />
            </label>
            <label>
              Discount
              <input
                className="input"
                type="number"
                step="0.01"
                value={redeemDiscount}
                onChange={(event) => {
                  const discount = numericFieldToNumber(
                    parseNumericField(event.target.value),
                  );
                  setRedeemDiscount(parseNumericField(event.target.value));
                  const total = payoff?.payoff ?? duePreview.remaining;
                  setAmountCollected(Math.max(0, total - discount));
                }}
              />
            </label>
            <label>
              Mode
              <select
                className="input"
                value={redeemMode}
                onChange={(event) =>
                  setRedeemMode(event.target.value as PledgePaymentMode)
                }
              >
                {PLEDGE_PAYMENT_MODES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted">
            Collect {formatCurrency(numericFieldToNumber(amountCollected))} and write
            off {formatCurrency(numericFieldToNumber(redeemDiscount))} to close.
            Discount applies to full redeem only.
          </p>
          <button
            type="button"
            className="btn ghost"
            style={{ marginTop: "0.5rem" }}
            onClick={() => {
              setRedeemDiscount(0);
              setAmountCollected(payoff?.payoff ?? duePreview.remaining);
            }}
          >
            Fill payoff
          </button>
        </Modal>
      ) : null}

      {renewLoanOpen ? (
        <RenewModal
          summary={{
            receiptNo: displayBillNo,
            interestDue: payoff?.interestDue ?? duePreview.interest,
            principalOutstanding:
              payoff?.principalOutstanding ?? numericFieldToNumber(loanAmount),
            interestPaidUpto: payoff?.interestPaidUpto ?? pledgeDate,
            remaining: payoff?.payoff ?? duePreview.remaining,
          }}
          busy={busy}
          onClose={() => setRenewLoanOpen(false)}
          onSubmit={(input) => void renewLoan(input)}
        />
      ) : null}

      {deleteOpen ? (
        <ConfirmDialog
          title="Delete draft"
          message={`Delete draft ${displayBillNo}? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => void deleteDraft()}
        />
      ) : null}

      {sanctionOpen ? (
        <ConfirmDialog
          title={isActiveLoan ? "Update loan" : "Sanction loan"}
          message={`Sanction loan ${displayBillNo} for ${formatCurrency(netPaid)} net paid?`}
          confirmLabel={isActiveLoan ? "Update" : "Sanction loan"}
          danger={false}
          onCancel={() => {
            setSanctionOpen(false);
            setAfterSanction(null);
          }}
          onConfirm={() => void sanctionLoan()}
        />
      ) : null}

      {auctionOpen && pledge ? (
        <AuctionModal
          summary={{
            pledgeId: pledge.id,
            receiptNo: pledge.receiptNo,
            customerName: pledge.customerName,
            remaining: payoff?.payoff ?? duePreview.remaining,
          }}
          mode={auctionMode}
          busy={busy}
          onClose={() => setAuctionOpen(false)}
          onNotice={(input) => void sendAuctionNotice(input)}
          onAuction={(input) => void recordAuction(input)}
        />
      ) : null}

      {previewOpen && previewTargetId > 0 ? (
        <PledgePreviewModal
          pledgeId={previewTargetId}
          pdfFilename={pledge?.receiptNo ? `${pledge.receiptNo}.pdf` : "pledge.pdf"}
          onClose={() => {
            setPreviewOpen(false);
            setPreviewTargetId(0);
          }}
        />
      ) : null}
    </div>
  );
}
