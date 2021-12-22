import { OverviewStat } from '../../generated/schema'
import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { USER_OVERVIEW_STATS_ID } from './constants'

export function getOrCreateOverviewStats(): OverviewStat {
  let overviewStats = OverviewStat.load(USER_OVERVIEW_STATS_ID)

  if (overviewStats == null) {
    overviewStats = new OverviewStat(USER_OVERVIEW_STATS_ID)
    overviewStats.totalStaked = BigDecimal.zero()
    overviewStats.totalPlnEarned = BigDecimal.zero()
    overviewStats.assetManagers = []
    overviewStats.assetManagersCount = BigInt.zero()
    overviewStats.save()
  }

  return overviewStats
}

export function updateOverViewStats(
  stake: BigDecimal,
  assetManagerAddress: string,
  totalPlnEarned: BigDecimal
): void {
  let overviewStats = getOrCreateOverviewStats()

  overviewStats.totalStaked = overviewStats.totalStaked.plus(stake)

  let isAssetManagerPresent = overviewStats.assetManagers.includes(assetManagerAddress)

  if (!isAssetManagerPresent) {
    overviewStats.assetManagers.push(assetManagerAddress)
    overviewStats.assetManagersCount = overviewStats.assetManagersCount.plus(
      BigInt.fromI32(1)
    )
  }

  overviewStats.totalPlnEarned = overviewStats.totalPlnEarned.plus(totalPlnEarned)

  overviewStats.save()
}
