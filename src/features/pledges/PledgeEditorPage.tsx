import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Calculator,
  Calendar,
  Check,
  Eye,
  FileDown,
  Gem,
  IndianRupee,
  MapPin,
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
import { localTodayIso } from "@shared/localDate";
import type { Customer, Pledge, PledgeItemInput } from "@shared/types";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DateInput } from "../../components/DateInput";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/toastContext";
import { api } from "../../lib/api";
import { formatCurrency, formatDisplayDate } from "../../lib/format";
import {
  numericFieldToNumber,
  parseNumericField,
  type NumericField,
} from "../../lib/numericField";
import { BillCustomerSearch } from "../invoices/BillCustomerSearch";
import { setBillingType } from "../invoices/billingType";
import { PledgePreviewModal } from "./PledgePreviewModal";

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
  const [assessedValue, setAssessedValue] = useState<NumericField>(0);
  const [loanAmount, setLoanAmount] = useState<NumericField>(0);
  const [charges, setCharges] = useState<NumericField>(0);
  const [interestPct, setInterestPct] =
    useState<NumericField>(DEFAULT_INTEREST_PCT);
  const [items, setItems] = useState<EditorItem[]>([newItem()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [forfeitOpen, setForfeitOpen] = useState(false);
  const [sanctionOpen, setSanctionOpen] = useState(false);
  const [afterSanction, setAfterSanction] = useState<"preview" | "pdf" | null>(
    null,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTargetId, setPreviewTargetId] = useState(0);
  const [redeemDate, setRedeemDate] = useState(todayIso());
  const [amountCollected, setAmountCollected] = useState<NumericField>(0);
  const [redeeming, setRedeeming] = useState(false);
  const [forfeiting, setForfeiting] = useState(false);
  const [previewReceiptNo, setPreviewReceiptNo] = useState("");

  const isDraft = !pledge || pledge.status === "draft";
  const isActiveLoan = pledge?.status === "active";
  const canEdit = isDraft || isActiveLoan;
  const busy = saving || redeeming || forfeiting;
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
    if (isNew || !id) return;
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
        setAssessedValue(data.assessedValue);
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
      }
    })();
    return () => {
      active = false;
    };
  }, [isNew, id]);

  const netPaid = useMemo(
    () =>
      netPaidAmount(
        numericFieldToNumber(loanAmount),
        numericFieldToNumber(charges),
      ),
    [loanAmount, charges],
  );

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
  }

  function clearBorrower() {
    setCustomerId(0);
    setCustomerName("");
    setCustomerPhone("");
    setGuardianName("");
    setCustomerAddress("");
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
        aadhaar: existing.aadhaar ?? "",
        pan: existing.pan ?? "",
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
      aadhaar: "",
      pan: "",
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
      assessedValue: numericFieldToNumber(assessedValue),
      loanAmount: numericFieldToNumber(loanAmount),
      charges: numericFieldToNumber(charges),
      interestPct: numericFieldToNumber(interestPct),
      repaymentDueDate,
      notes: "",
      items: list.map(({ key: _key, ...item }) => ({
        ...item,
        metal: item.metal || "Gold",
        identification: item.identification ?? "",
        grossWeight: Number(item.grossWeight) || 0,
        stoneWeight: Number(item.stoneWeight) || 0,
        netWeight: Number(item.netWeight) || 0,
        pieces: Number(item.pieces) || 1,
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

  function openPrintPreview(targetId: number) {
    setPreviewTargetId(targetId);
    setPreviewOpen(true);
  }

  async function sanctionLoan() {
    setSanctionOpen(false);
    const pending = afterSanction;
    setAfterSanction(null);
    const saved = await persistDraft();
    if (!saved) return;
    let result = saved;
    if (saved.status === "draft") {
      try {
        setSaving(true);
        setError(null);
        result = await api.sanctionPledge(saved.id);
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
    if (pending === "pdf") openPrintPreview(result.id);
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
      const saved = await persistDraft();
      if (!saved) return;
      openPrintPreview(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open PDF");
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

  async function forfeitPledge() {
    try {
      setForfeiting(true);
      setError(null);
      const targetId = pledge?.id ?? Number(id);
      if (!targetId) throw new Error("Sanction the loan before forfeiting");
      const updated = await api.forfeitPledge({
        id: targetId,
        forfeitedDate: todayIso(),
      });
      setPledge(updated);
      setForfeitOpen(false);
      showToast("Pledge forfeited / closed", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to forfeit pledge");
    } finally {
      setForfeiting(false);
    }
  }

  const statusLabel =
    pledge?.status === "redeemed"
      ? "Redeemed"
      : pledge?.status === "forfeited"
        ? "Forfeited"
        : pledge?.status === "active"
          ? "Active"
          : "Draft";

  return (
    <div className="adagu-editor-container sale-bill-editor">
      <header className="adagu-page-header sale-bill-toolbar">
        <div className="adagu-header-left">
          <div className="adagu-header-icon">
            <Gem size={18} strokeWidth={1.75} />
          </div>
          <div className="adagu-header-titles">
            <h1>Adagu Bill</h1>
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
            <FileDown size={16} strokeWidth={1.75} aria-hidden /> PDF
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
            </>
          ) : null}
          {isActiveLoan ? (
            <>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => {
                  setAfterSanction(null);
                  setSanctionOpen(true);
                }}
              >
                <Save size={16} strokeWidth={1.75} aria-hidden />
                {saving ? "Saving…" : "Update Loan"}
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
                {saving ? "Generating…" : "Update & Generate"}
              </button>
            </>
          ) : null}
          {isActiveLoan ? (
            <>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => setForfeitOpen(true)}
              >
                Close / Forfeit
              </button>
              <button
                type="button"
                className="btn btn-accent"
                disabled={busy}
                onClick={() => {
                  setAmountCollected(
                    duePreview.remaining || numericFieldToNumber(loanAmount),
                  );
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
                      <tr>
                        <td className="adagu-col-index">{index + 1}</td>
                        <td className="adagu-col-metal">
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
                        <td className="adagu-col-purity">
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
                        <td className="adagu-col-weight">
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
                        <td className="adagu-col-weight">
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
                        <td className="adagu-col-weight">
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
                        <td colSpan={7} className="adagu-item-description-cell">
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
                  <strong>{totalGrossWeight.toFixed(3)} g</strong>
                </div>
              </div>
              <div className="sale-bill-summary-stat">
                <div className="sale-bill-summary-stat-icon" aria-hidden>
                  <MinusCircle size={16} strokeWidth={1.75} />
                </div>
                <div>
                  <span>Deductions</span>
                  <strong>{totalStoneWeight.toFixed(3)} g</strong>
                </div>
              </div>
              <div className="sale-bill-summary-stat">
                <div className="sale-bill-summary-stat-icon" aria-hidden>
                  <ShoppingBag size={16} strokeWidth={1.75} />
                </div>
                <div>
                  <span>Net Weight</span>
                  <strong>{totalNetWeight.toFixed(3)} g</strong>
                </div>
              </div>
            </div>
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
                    {totalNetWeight.toFixed(3)} gms
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
          <p className="muted">
            Principal {formatCurrency(numericFieldToNumber(loanAmount))} +
            interest {formatCurrency(duePreview.interest)} − collected{" "}
            {formatCurrency(pledge?.amountCollected ?? 0)} ={" "}
            <strong>{formatCurrency(duePreview.remaining)}</strong> remaining.
          </p>
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
              Amount
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
          </div>
          <button
            type="button"
            className="btn ghost"
            style={{ marginTop: "0.5rem" }}
            onClick={() => setAmountCollected(duePreview.remaining)}
          >
            Fill remaining due
          </button>
        </Modal>
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

      {forfeitOpen ? (
        <ConfirmDialog
          title="Close / forfeit pledge"
          message="Mark this pledge as forfeited? It cannot be edited afterward."
          confirmLabel="Forfeit"
          danger
          onCancel={() => setForfeitOpen(false)}
          onConfirm={() => void forfeitPledge()}
        />
      ) : null}

      {previewOpen && previewTargetId > 0 ? (
        <PledgePreviewModal
          pledgeId={previewTargetId}
          onClose={() => {
            setPreviewOpen(false);
            setPreviewTargetId(0);
          }}
        />
      ) : null}
    </div>
  );
}
