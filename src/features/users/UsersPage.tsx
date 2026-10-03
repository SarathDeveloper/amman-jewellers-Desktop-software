import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  CircleUser,
  Eye,
  EyeOff,
  Filter,
  LayoutGrid,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Shield,
  UserRound,
  UserRoundMinus,
  UserRoundPlus,
  Users,
} from 'lucide-react'
import { FEATURE_KEYS, type FeatureKey, type User, type UserRole } from '@shared/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { TablePager } from '../../components/DataTable'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import { paginate } from '../../lib/format'
import { useToast } from '../../components/toastContext'

const PAGE_SIZE = 10

const FEATURE_LABELS: Record<FeatureKey, string> = {
  dashboard: 'Dashboard',
  billing: 'Billing',
  products: 'Products',
  stock: 'Gold & Silver',
  inward: 'Inward',
  customers: 'Customers',
  dues: 'Dues',
  reports: 'Reports',
  rates: 'Gold & Silver Rates',
  settings: 'Settings',
  gold_savings: 'Gold Savings',
}

function featureListLabel(features: FeatureKey[]): string {
  const labels = features.map((key) => FEATURE_LABELS[key]).filter(Boolean)
  return labels.length > 0 ? labels.join(', ') : 'None'
}

type UserFilter = 'all' | 'admin' | 'staff' | 'active' | 'inactive'

const FILTER_OPTIONS: { value: UserFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

function toggleFeature(list: FeatureKey[], key: FeatureKey): FeatureKey[] {
  return list.includes(key) ? list.filter((item) => item !== key) : [...list, key]
}

function FeatureChips({
  selected,
  onToggle,
}: {
  selected: FeatureKey[]
  onToggle: (key: FeatureKey) => void
}) {
  return (
    <div className="users-feature-chips">
      {FEATURE_KEYS.map((key) => {
        const checked = selected.includes(key)
        return (
          <button
            key={key}
            type="button"
            className={`users-feature-chip${checked ? ' is-selected' : ''}`}
            aria-pressed={checked}
            onClick={() => onToggle(key)}
          >
            <span>{FEATURE_LABELS[key]}</span>
            {checked ? (
              <span className="users-feature-check" aria-hidden>
                ✓
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export function UsersPage() {
  const { showToast } = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState<UserRole>('staff')
  const [features, setFeatures] = useState<FeatureKey[]>(['dashboard', 'billing'])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editFeatures, setEditFeatures] = useState<FeatureKey[]>([])
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<UserFilter>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [page, setPage] = useState(1)

  async function reload() {
    const list = await api.listUsers()
    setUsers(list)
  }

  useEffect(() => {
    void (async () => {
      try {
        await reload()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load users')
      }
    })()
  }, [])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return users.filter((user) => {
      if (query && !user.username.toLowerCase().includes(query)) return false
      if (filter === 'admin') return user.role === 'admin'
      if (filter === 'staff') return user.role === 'staff'
      if (filter === 'active') return user.active
      if (filter === 'inactive') return !user.active
      return true
    })
  }, [users, search, filter])

  const paged = useMemo(() => paginate(filtered, page, PAGE_SIZE), [filtered, page])
  const editingUser = users.find((user) => user.id === editingId) ?? null

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    try {
      await api.createUser({
        username: username.trim(),
        password,
        role,
        features: role === 'staff' ? features : undefined,
      })
      setUsername('')
      setPassword('')
      setShowPassword(false)
      setRole('staff')
      setFeatures(['dashboard', 'billing'])
      await reload()
      showToast('User created', 'success')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create user')
    }
  }

  async function savePermissions(userId: number) {
    try {
      await api.updateUserPermissions(userId, { features: editFeatures })
      setEditingId(null)
      await reload()
      showToast('Permissions updated', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update permissions')
    }
  }

  async function confirmReset() {
    if (!resetTarget) return
    if (resetPassword.length < 6) {
      setError('Temporary password must be at least 6 characters')
      return
    }
    try {
      await api.resetUserPassword(resetTarget.id, { newPassword: resetPassword })
      setResetTarget(null)
      setResetPassword('')
      await reload()
      showToast('Password reset', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password')
    }
  }

  async function confirmDeactivate() {
    if (!deactivateTarget) return
    try {
      await api.deleteUser(deactivateTarget.id)
      setDeactivateTarget(null)
      await reload()
      showToast('User deactivated', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not deactivate user')
    }
  }

  async function onRefresh() {
    try {
      await reload()
      setError(null)
      showToast('Users refreshed', 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    }
  }

  return (
    <div className="app-page users-page">
      <header className="users-header">
        <div className="users-header-left">
          <span className="users-header-icon" aria-hidden>
            <Users size={18} strokeWidth={1.75} />
          </span>
          <div>
            <h1>Users</h1>
            <p>Manage admin and staff accounts and feature access</p>
          </div>
        </div>
        <label className="users-search">
          <Search size={15} strokeWidth={1.75} aria-hidden />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Search users…"
            aria-label="Search users"
          />
        </label>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="users-card">
        <div className="users-card-head">
          <span className="users-avatar users-avatar-form" aria-hidden>
            <UserRoundPlus size={18} strokeWidth={1.75} />
          </span>
          <div>
            <h2>Add New User</h2>
            <p>Create a new admin or staff account and assign feature access</p>
          </div>
        </div>

        <form className="users-form" onSubmit={(event) => void onCreate(event)}>
          <div className="users-form-row">
            <label className="users-field">
              <span>
                Username <span className="req">*</span>
              </span>
              <span className="users-input-wrap">
                <UserRound size={15} strokeWidth={1.75} aria-hidden />
                <input
                  className="input"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Enter username"
                  required
                />
              </span>
            </label>
            <label className="users-field">
              <span>
                Temporary Password <span className="req">*</span>
              </span>
              <span className="users-input-wrap">
                <Lock size={15} strokeWidth={1.75} aria-hidden />
                <input
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter temporary password"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  className="users-input-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? (
                    <EyeOff size={15} strokeWidth={1.75} />
                  ) : (
                    <Eye size={15} strokeWidth={1.75} />
                  )}
                </button>
              </span>
            </label>
          </div>

          <label className="users-field">
            <span>
              Role <span className="req">*</span>
            </span>
              <span className="users-input-wrap">
              <Shield size={16} strokeWidth={2} aria-hidden />
              <select
                className="input"
                value={role}
                onChange={(event) => setRole(event.target.value as UserRole)}
              >
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </span>
          </label>

          {role === 'staff' ? (
            <div className="users-features">
              <div className="users-features-label">
                <LayoutGrid size={14} strokeWidth={1.75} aria-hidden />
                <span>Feature access</span>
              </div>
              <p>Select the features this user can access</p>
              <FeatureChips
                selected={features}
                onToggle={(key) => setFeatures((current) => toggleFeature(current, key))}
              />
            </div>
          ) : null}

          <button type="submit" className="btn users-create-btn">
            <Plus size={16} strokeWidth={2} aria-hidden />
            Create user
          </button>
        </form>
      </section>

      <section className="users-card users-directory">
        <div className="users-card-head users-directory-head">
          <h2>Users ({filtered.length})</h2>
          <div className="users-directory-tools">
            <div className="users-filter-wrap">
              <button
                type="button"
                className="users-tool-btn"
                aria-expanded={filterOpen}
                onClick={() => setFilterOpen((open) => !open)}
              >
                <Filter size={14} strokeWidth={1.75} aria-hidden />
                Filter
              </button>
              {filterOpen ? (
                <div className="users-filter-menu" role="listbox" aria-label="Filter users">
                  {FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={filter === option.value}
                      className={filter === option.value ? 'is-active' : undefined}
                      onClick={() => {
                        setFilter(option.value)
                        setPage(1)
                        setFilterOpen(false)
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="users-tool-btn users-tool-icon"
              aria-label="Refresh users"
              onClick={() => void onRefresh()}
            >
              <RefreshCw size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Features</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={5} className="users-empty">
                    No users match this search.
                  </td>
                </tr>
              ) : (
                paged.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="users-name-cell">
                        <span
                          className={`users-avatar users-avatar-${user.role}`}
                          aria-hidden
                        >
                          {user.username.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="users-username">{user.username}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`users-role-pill users-role-${user.role}`}>
                        {user.role === 'admin' ? 'Admin' : 'Staff'}
                      </span>
                    </td>
                    <td className="users-features-cell">
                      {user.role === 'admin' ? 'All' : featureListLabel(user.features)}
                    </td>
                    <td>
                      <span
                        className={`users-status${
                          !user.active
                            ? ' is-inactive'
                            : user.mustChangePassword
                              ? ' is-warning'
                              : ''
                        }`}
                      >
                        <span className="users-status-dot" aria-hidden />
                        {!user.active
                          ? 'Inactive'
                          : user.mustChangePassword
                            ? 'Must change password'
                            : 'Active'}
                      </span>
                    </td>
                    <td>
                      <div className="users-actions">
                        {user.role === 'staff' && user.active ? (
                          <button
                            type="button"
                            className="users-action-btn"
                            onClick={() => {
                              setEditingId(user.id)
                              setEditFeatures([...user.features])
                            }}
                          >
                            <CircleUser size={13} strokeWidth={1.75} aria-hidden />
                            Permissions
                          </button>
                        ) : null}
                        {user.active ? (
                          <>
                            <button
                              type="button"
                              className="users-action-btn"
                              onClick={() => {
                                setResetTarget(user)
                                setResetPassword('')
                              }}
                            >
                              <Lock size={13} strokeWidth={1.75} aria-hidden />
                              Reset password
                            </button>
                            <button
                              type="button"
                              className="users-action-btn"
                              onClick={() => setDeactivateTarget(user)}
                            >
                              <UserRoundMinus size={13} strokeWidth={1.75} aria-hidden />
                              Deactivate
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <TablePager
          page={page}
          pageSize={PAGE_SIZE}
          total={filtered.length}
          onPageChange={setPage}
          itemLabel="users"
        />
      </section>

      {editingUser ? (
        <Modal
          title={`Permissions for ${editingUser.username}`}
          onClose={() => setEditingId(null)}
          footer={
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setEditingId(null)}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={() => void savePermissions(editingUser.id)}>
                Save
              </button>
            </div>
          }
        >
          <p className="muted">Select the features this user can access.</p>
          <FeatureChips
            selected={editFeatures}
            onToggle={(key) => setEditFeatures((current) => toggleFeature(current, key))}
          />
        </Modal>
      ) : null}

      {resetTarget ? (
        <Modal
          title={`Reset password for ${resetTarget.username}`}
          onClose={() => setResetTarget(null)}
          footer={
            <div className="modal-actions">
              <button type="button" className="btn secondary" onClick={() => setResetTarget(null)}>
                Cancel
              </button>
              <button type="button" className="btn" onClick={() => void confirmReset()}>
                Reset
              </button>
            </div>
          }
        >
          <p className="muted">Enter a temporary password. The user must change it on next login.</p>
          <label>
            Temporary password
            <input
              className="input"
              type="password"
              value={resetPassword}
              onChange={(event) => setResetPassword(event.target.value)}
            />
          </label>
        </Modal>
      ) : null}

      {deactivateTarget ? (
        <ConfirmDialog
          title={`Deactivate ${deactivateTarget.username}?`}
          message="They will no longer be able to sign in."
          confirmLabel="Deactivate"
          onConfirm={() => void confirmDeactivate()}
          onCancel={() => setDeactivateTarget(null)}
        />
      ) : null}
    </div>
  )
}
