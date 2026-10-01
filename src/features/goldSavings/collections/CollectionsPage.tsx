import { useState } from 'react'
import { IndianRupee } from 'lucide-react'
import type { GoldSavingAccount } from '@shared/types'
import { PageHeader } from '../../../components/PageHeader'
import { StatCard } from '../../../components/StatCard'
import { formatCurrency, formatDisplayDate, formatWeight } from '../../../lib/format'
import { api } from '../../../lib/api'
import { PrintPreviewModal } from '../../print/PrintPreviewModal'
import { GsAccountSearch } from '../GsAccountSearch'
import { GsStatusBadge } from '../GsStatusBadge'
import { CollectPaymentModal } from './CollectPaymentModal'

export function CollectionsPage() {
  const [account, setAccount] = useState<GoldSavingAccount | null>(null)
  const [collectOpen, setCollectOpen] = useState(false)
  const [printPaymentId, setPrintPaymentId] = useState<number | null>(null)

  return (
    <div className="app-page">
      <PageHeader
        title="Monthly collections"
        subtitle="Search an account, review the summary, then collect the next installment"
        actions={
          account ? (
            <button type="button" className="btn" onClick={() => setCollectOpen(true)}>
              <IndianRupee size={18} strokeWidth={1.75} aria-hidden />
              Collect next installment
            </button>
          ) : null
        }
      />
      <section className="card padded">
        <GsAccountSearch selected={account} onSelect={setAccount} onClear={() => setAccount(null)} />
      </section>
      {account ? (
        <div className="stat-card-grid">
          <StatCard label="Monthly installment" value={formatCurrency(account.monthlyAmount)} />
          <StatCard label="Paid / total" value={`${account.paidInstallments} / ${account.durationMonths}`} />
          <StatCard label="Amount paid" value={formatCurrency(account.totalPaid)} tone="success" />
          <StatCard label="Gold accumulated" value={formatWeight(account.goldAccumulated, 3)} />
          <StatCard label="Next due" value={account.nextDueDate ? formatDisplayDate(account.nextDueDate) : '—'} />
          <StatCard label="Status" value={<GsStatusBadge status={account.status} />} />
        </div>
      ) : null}
      {collectOpen && account ? (
        <CollectPaymentModal
          accountId={account.id}
          onClose={() => setCollectOpen(false)}
          onCollected={(paymentId) => {
            setCollectOpen(false)
            setPrintPaymentId(paymentId)
            void api.getGsAccount(account.id).then((next) => setAccount(next.account))
          }}
        />
      ) : null}
      {printPaymentId ? (
        <PrintPreviewModal
          title="Collection receipt"
          path={`/print/gs-receipt/${printPaymentId}`}
          onClose={() => setPrintPaymentId(null)}
        />
      ) : null}
    </div>
  )
}
