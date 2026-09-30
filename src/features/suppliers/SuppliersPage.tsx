import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { Supplier } from '@shared/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DataTable, TablePager } from '../../components/DataTable'
import { EmptyState } from '../../components/EmptyState'
import { LoadingState } from '../../components/LoadingState'
import { PageHeader } from '../../components/PageHeader'
import { SearchBar } from '../../components/SearchBar'
import { useToast } from '../../components/toastContext'
import { api } from '../../lib/api'
import { paginate, TABLE_PAGE_SIZE } from '../../lib/format'
import { SupplierFormModal } from './SupplierFormModal'

export function SuppliersPage() {
  const { showToast } = useToast()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [open, setOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [page, setPage] = useState(1)

  async function load() {
    try {
      setError(null)
      setSuppliers(await api.listSuppliers(search))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load suppliers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    void load()
  }, [search])

  const paged = useMemo(() => paginate(suppliers, page, TABLE_PAGE_SIZE), [suppliers, page])

  async function remove(id: number) {
    try {
      await api.deleteSupplier(id)
      setDeleteId(null)
      showToast('Supplier deleted', 'success')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete supplier')
    }
  }

  return (
    <div className="app-page app-page-fill">
      <PageHeader
        title="Suppliers"
        subtitle="Vendors used for purchases"
        actions={
          <>
            <SearchBar
              value={search}
              onChange={(value) => {
                setSearch(value)
                setPage(1)
              }}
              placeholder="Search name or phone..."
            />
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              <Plus size={18} aria-hidden />
              Add supplier
            </button>
          </>
        }
      />

      {error ? <div className="error-banner">{error}</div> : null}
      {loading ? (
        <LoadingState />
      ) : suppliers.length === 0 ? (
        <EmptyState title="No suppliers yet" description="Add a supplier before creating a purchase." />
      ) : (
        <DataTable footer={<TablePager page={page} total={suppliers.length} onPageChange={setPage} />}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>GSTIN</th>
                <th>Address</th>
                <th>Notes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((supplier) => (
                <tr key={supplier.id}>
                  <td>{supplier.name}</td>
                  <td>{supplier.phone || '—'}</td>
                  <td>{supplier.gstin || '—'}</td>
                  <td>{supplier.address || '—'}</td>
                  <td>{supplier.notes || '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn ghost icon-btn"
                        aria-label={`Edit ${supplier.name}`}
                        onClick={() => {
                          setEditing(supplier)
                          setOpen(true)
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn ghost icon-btn"
                        aria-label={`Delete ${supplier.name}`}
                        onClick={() => setDeleteId(supplier.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}

      <SupplierFormModal
        open={open}
        editing={editing}
        onClose={() => setOpen(false)}
        onSaved={async () => {
          showToast(editing ? 'Supplier updated' : 'Supplier added', 'success')
          await load()
        }}
        onError={(message) => setError(message)}
      />

      {deleteId != null ? (
        <ConfirmDialog
          title="Delete supplier?"
          message="This cannot be undone if the supplier has no inwards."
          confirmLabel="Delete"
          onCancel={() => setDeleteId(null)}
          onConfirm={() => {
            void remove(deleteId)
          }}
        />
      ) : null}
    </div>
  )
}
