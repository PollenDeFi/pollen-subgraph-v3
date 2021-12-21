import { OverviewStat, User } from '../../generated/schema'
import { BigDecimal } from '@graphprotocol/graph-ts'
import { USER_OVERVIEW_STATS_ID } from './constants'

export function getOrCreateOverviewStats(): OverviewStat {
  let overviewStats = OverviewStat.load(USER_OVERVIEW_STATS_ID)

  if (overviewStats == null) {
    overviewStats = new OverviewStat(USER_OVERVIEW_STATS_ID)
    overviewStats.totalStaked = BigDecimal.zero()
    overviewStats.totalPlnEarned = BigDecimal.zero()
    overviewStats.assetManagers = []
    overviewStats.save()
  }

  return overviewStats
}

export function updateOverViewStats(
  stake?: BigDecimal,
  assetManagerAddress?: string,
  totalPlnEarned?: BigDecimal
) {
  let overviewStats = getOrCreateOverviewStats()

  if (stake) {
    overviewStats.totalStaked = overviewStats.totalStaked.plus(stake)
  }

  if (assetManagerAddress) {
    let isAssetManagerPresent = overviewStats.assetManagers.includes(assetManagerAddress)
    if (!isAssetManagerPresent) overviewStats.assetManagers.push(assetManagerAddress)
  }

  if (totalPlnEarned) {
    overviewStats.totalPlnEarned = overviewStats.totalPlnEarned.plus(totalPlnEarned)
  }

  overviewStats.save()
}
