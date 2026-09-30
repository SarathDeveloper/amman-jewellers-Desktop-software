import { formatWeight } from '../lib/format'

export function WeightDisplay({ weight }: { weight: number }) {
  return <span className="num">{formatWeight(weight)}</span>
}
