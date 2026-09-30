import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getMigrationsDir } from '../lib/appPaths'

function loadMigrationSql(filename: string): string {
  return readFileSync(join(getMigrationsDir(), filename), 'utf-8')
}

export function getMigrations(): { version: number; sql: string }[] {
  return [
    { version: 1, sql: loadMigrationSql('001_initial.sql') },
    { version: 2, sql: loadMigrationSql('002_item_stock.sql') },
    { version: 3, sql: loadMigrationSql('003_dues.sql') },
    { version: 4, sql: loadMigrationSql('004_invoice_dues.sql') },
    { version: 5, sql: loadMigrationSql('005_billing_improvements.sql') },
    { version: 6, sql: loadMigrationSql('006_due_payments.sql') },
    { version: 7, sql: loadMigrationSql('007_invoice_item_snapshot.sql') },
    { version: 8, sql: loadMigrationSql('008_historical_bills.sql') },
    { version: 9, sql: loadMigrationSql('009_stock_categories.sql') },
    { version: 10, sql: loadMigrationSql('010_day_closings.sql') },
    { version: 11, sql: loadMigrationSql('011_stock_movements.sql') },
    { version: 12, sql: loadMigrationSql('012_drop_stock_movements.sql') },
    { version: 13, sql: loadMigrationSql('013_product_image.sql') },
    { version: 14, sql: loadMigrationSql('014_tax_paper_a4.sql') },
    { version: 15, sql: loadMigrationSql('015_users_permissions.sql') },
    { version: 16, sql: loadMigrationSql('016_pledges.sql') },
    { version: 17, sql: loadMigrationSql('017_billing_pos.sql') },
    { version: 18, sql: loadMigrationSql('018_adagu_template_fields.sql') },
    { version: 19, sql: loadMigrationSql('019_inward.sql') },
    { version: 20, sql: loadMigrationSql('020_metal_day_closings.sql') },
    { version: 21, sql: loadMigrationSql('021_customer_aadhaar_pan.sql') },
    { version: 22, sql: loadMigrationSql('022_drop_product_sku.sql') },
    { version: 23, sql: loadMigrationSql('023_stock_sync_hardening.sql') },
    { version: 24, sql: loadMigrationSql('024_unified_ledger_adjustments_stocktake.sql') },
    { version: 25, sql: loadMigrationSql('025_drop_exchange_stock_tracking.sql') },
    { version: 26, sql: loadMigrationSql('026_pledge_dues.sql') },
    { version: 27, sql: loadMigrationSql('027_invoice_old_gold_round_off.sql') },
    { version: 28, sql: loadMigrationSql('028_bis_qr_logos.sql') },
    { version: 29, sql: loadMigrationSql('029_avr_template_defaults.sql') },
    { version: 30, sql: loadMigrationSql('030_product_variants.sql') },
    { version: 31, sql: loadMigrationSql('031_remove_walk_in.sql') },
    { version: 32, sql: loadMigrationSql('032_delete_walk_in_customer.sql') },
    { version: 33, sql: loadMigrationSql('033_old_gold_purchases.sql') },
    { version: 34, sql: loadMigrationSql('034_pledge_draft_status.sql') },
    { version: 35, sql: loadMigrationSql('035_pledge_topups.sql') },
    { version: 36, sql: loadMigrationSql('036_metal_rate_purities.sql') },
    { version: 37, sql: loadMigrationSql('037_invoice_item_other_charges.sql') },
    { version: 38, sql: loadMigrationSql('038_purchase_invoice.sql') },
    { version: 39, sql: loadMigrationSql('039_amman_jewellers_shop.sql') },
    { version: 40, sql: loadMigrationSql('040_strip_customer_epoch_suffix.sql') },
  ]
}
