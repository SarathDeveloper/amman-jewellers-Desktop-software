import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { eligibleBonusGoldWeight, rateForPurity, roundGoldGrams } from '@shared/goldSavings/math'
import { localTodayIso } from '@shared/localDate'
import type { GoldSavingAccount, GoldSavingAccountDetail, GoldSavingRedemptionKind, MetalRates } from '@shared/types'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { DateInput } from '../../../components/DateInput'
import { PageHeader } from '../../../components/PageHeader'
import { StatCard } from '../../../components/StatCard'
import { useToast } from '../../../components/toastContext'
import { formatCurrency, formatWeight } from '../../../lib/format'
import { api } from '../../../lib/api'
import { GsAccountSearch } from '../GsAccountSearch'
import { salePathForFormat } from '../../invoices/billingType'

type PlainRedemptionKind = Extract<GoldSavingRedemptionKind, 'gold' | 'jewellery'>

export function MaturityPage() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const presetId = Number(params.get('accountId') ?? 0)
  const [account, setAccount] = useState<GoldSavingAccount | null>(null)
  const [detail, setDetail] = useState<GoldSavingAccountDetail | null>(null)
  const [rates, setRates] = useState<MetalRates | null>(null)
  const [kind, setKind] = useState<PlainRedemptionKind>('jewellery')
  const [date, setDate] = useState(localTodayIso())
  const [goldWeight, setGoldWeight] = useState('')
  const [confirm, setConfirm] = useState(false)

  useEffect(() => {
    if (!presetId) return
    void api
      .listGsAccounts()
      .then((rows) => {
        const found = (rows ?? []).find((row) => row.id === presetId)
        if (found) setAccount(found)
      })
      .catch(() => undefined)
  }, [presetId])

  useEffect(() => {
    if (!account) return
    void Promise.all([api.getGsAccount(account.id), api.getLatestMetalRates()])
      .then(([next, latest]) => {
        setDetail(next)
        setRates(latest)
      })
      .catch(() => undefined)
  }, [account])

  async function redeem() {
    if (!account) return
    try {
      await api.processGsRedemption({
        accountId: account.id,
        redemptionDate: date,
        redemptionKind: kind,
        goldWeight: goldWeight ? Number(goldWeight) : undefined,
      })
      showToast('Redemption recorded', 'success')
      const next = await api.getGsAccount(account.id)
      setDetail(next)
      setAccount(next.account)
      setGoldWeight('')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Redemption failed', 'error')
    } finally {
      setConfirm(false)
    }
  }

  const scheme = detail?.scheme
  const accumulated = detail?.account.goldAccumulated ?? 0
  const paid = detail?.account.paidInstallments ?? 0
  const duration = detail?.account.durationMonths ?? 0
  const rate = scheme && rates && detail ? rateForPurity(rates, detail.account.purity) : 0
  const bonusAlreadyCredited = Boolean(detail?.ledger.some((entry) => entry.entryType === 'bonus'))
  const bonusGold =
    scheme && !bonusAlreadyCredited
      ? eligibleBonusGoldWeight({
          bonusType: scheme.bonusType,
          bonusValue: scheme.bonusValue,
          accumulatedGrams: accumulated,
          paidInstallments: paid,
          durationMonths: duration,
          ratePerGram: rate,
        })
      : 0
  const eligibleGold = roundGoldGrams(accumulated + bonusGold)

  return (
    <div className="app-page">
      <PageHeader
        title="Maturity & redemption"
        subtitle="Redeem scheme gold as plain gold or jewellery. To redeem against a sale, apply the scheme on the sale bill."
      />
      <section className="card padded card--search">
        <GsAccountSearch
          selected={account}
          onSelect={setAccount}
          onClear={() => {
            setAccount(null)
            setDetail(null)
          }}
        />
      </section>
      {detail ? (
        <>
          <div className="stat-card-grid">
            <StatCard label="Amount paid" value={formatCurrency(detail.account.totalPaid)} />
            <StatCard label="Accumulated gold" value={formatWeight(accumulated, 3)} />
            <StatCard
              label="Applicable bonus"
              value={bonusGold > 0 ? formatWeight(bonusGold, 3) : scheme && scheme.bonusType !== 'none' ? 'Not yet eligible' : 'None'}
            />
            <StatCard label="Total eligible gold" value={formatWeight(eligibleGold, 3)} tone="brand" />
          </div>
          <section className="card padded">
            <h2 className="settings-section-title">Redeem on a sale bill</h2>
            <p className="muted">
              The customer’s scheme balance is credited against the bill, at the bill’s gold rate, and the redemption is
              created when the bill is finalized.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={() =>
                  navigate(`${salePathForFormat('cash_bill')}?customerId=${detail.account.customerId}`)
                }
              >
                Redeem on a sale bill
              </button>
            </div>
          </section>
          <section className="card padded">
            <h2 className="settings-section-title">Process plain redemption</h2>
            <p className="muted">
              Accumulated gold is the customer’s credited weight from the ledger. Bonus gold, if any, is applied only
              when the configured eligibility is met. This does not add or deduct stock.
            </p>
            <div className="form-grid">
              <label>
                <span className="field-label">Redemption date</span>
                <DateInput className="input" value={date} onChange={setDate} showIcon />
              </label>
              <label>
                <span className="field-label">Option</span>
                <select
                  className="input"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as PlainRedemptionKind)}
                >
                  <option value="gold">Redeem gold weight</option>
                  <option value="jewellery">Redeem as jewellery</option>
                </select>
              </label>
              <label>
                <span className="field-label">Gold weight (blank = full eligible)</span>
                <input className="input" value={goldWeight} onChange={(e) => setGoldWeight(e.target.value)} />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setConfirm(true)}>
                Process redemption
              </button>
            </div>
          </section>
        </>
      ) : null}
      {confirm ? (
        <ConfirmDialog
          title="Confirm redemption"
          message="Record this redemption against the scheme ledger? Physical inventory will not change."
          confirmLabel="Redeem"
          danger={false}
          onConfirm={() => void redeem()}
          onCancel={() => setConfirm(false)}
        />
      ) : null}
    </div>
  )
}
