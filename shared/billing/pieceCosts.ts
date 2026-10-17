import { roundMoney } from './pricing'

/**
 * Cost of each piece on one purchase line.
 *
 * A piece's base cost is `net * rate + making`, and the purchase-level discount
 * is spread across the pieces in proportion to that base. GST is excluded: it is
 * input tax, not inventory cost. Every value is rounded like money, so the
 * stored costs are reproducible from the line alone.
 */
export function allocatePieceCosts(input: {
  netWeights: number[]
  rate: number
  makingCharges: number
  lineDiscount: number
}): number[] {
  if (input.netWeights.length === 0) return []
  const bases = input.netWeights.map((net) =>
    roundMoney(Math.max(0, net) * input.rate + input.makingCharges),
  )
  const totalBase = bases.reduce((sum, value) => sum + value, 0)
  const lineDiscount = Math.max(0, input.lineDiscount)
  return bases.map((base, index) =>
    roundMoney(
      Math.max(
        0,
        base - lineDiscount * (totalBase > 0 ? base / totalBase : 1 / input.netWeights.length),
      ),
    ),
  )
}
