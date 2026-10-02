import { AlertTriangle, Award, BarChart3, BookOpen, IndianRupee, LayoutDashboard, Settings2, UserPlus, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const GOLD_SAVINGS_TABS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/gold-savings/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/gold-savings/schemes', label: 'Schemes', icon: Settings2 },
  { to: '/gold-savings/enroll', label: 'Enroll', icon: UserPlus },
  { to: '/gold-savings/accounts', label: 'Accounts', icon: Users },
  { to: '/gold-savings/collections', label: 'Collections', icon: IndianRupee },
  { to: '/gold-savings/ledger', label: 'Ledger', icon: BookOpen },
  { to: '/gold-savings/maturity', label: 'Maturity', icon: Award },
  { to: '/gold-savings/overdue', label: 'Overdue', icon: AlertTriangle },
  { to: '/gold-savings/reports', label: 'Reports', icon: BarChart3 },
]
