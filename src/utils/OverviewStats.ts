import { DailyChartItem, OverviewStat } from '../../generated/schema'
import { BigDecimal, BigInt, log } from '@graphprotocol/graph-ts'
import { USER_OVERVIEW_STATS_ID } from './constants'

export function getOrCreateOverviewStats(): OverviewStat {
  let overviewStats = OverviewStat.load(USER_OVERVIEW_STATS_ID)

  if (overviewStats == null) {
    overviewStats = new OverviewStat(USER_OVERVIEW_STATS_ID)
    overviewStats.totalStaked = BigDecimal.zero()
    overviewStats.totalPlnEarned = BigDecimal.zero()
    overviewStats.totalDelegated = BigDecimal.zero()
    overviewStats.assetManagers = []
    overviewStats.assetManagersCount = BigInt.zero()
    overviewStats.delegators = []
    overviewStats.delegatorsCount = BigInt.zero()
    overviewStats.save()
  }

  return overviewStats
}

export function updatePollenatorOverviewStats(
  stake: BigDecimal,
  assetManagerAddress: string,
  totalPlnEarned: BigDecimal,
  timestamp: BigInt
): void {
  let overviewStats = getOrCreateOverviewStats()

  overviewStats.totalStaked = overviewStats.totalStaked.plus(stake)

  let managers = overviewStats.assetManagers
  let isAssetManagerPresent = managers.includes(assetManagerAddress)
  if (!isAssetManagerPresent) {
    managers.push(assetManagerAddress)
    overviewStats.assetManagers = managers
    overviewStats.assetManagersCount = overviewStats.assetManagersCount.plus(
      BigInt.fromI32(1)
    )
    updateDailyChartItem(
      timestamp,
      'PortfolioManagers',
      overviewStats.assetManagersCount.toBigDecimal()
    )
  }

  overviewStats.totalPlnEarned = overviewStats.totalPlnEarned.plus(totalPlnEarned)
  overviewStats.save()

  updateDailyChartItem(timestamp, 'TotalProfitLoss', overviewStats.totalPlnEarned)
  updateDailyChartItem(timestamp, 'TotalStaked', overviewStats.totalStaked)
}

export function updateDelegatorOverviewStats(
  stake: BigDecimal,
  delegatorAddress: string,
  totalPlnEarned: BigDecimal,
  feesPaid: BigInt,
  timestamp: BigInt
): void {
  let overviewStats = getOrCreateOverviewStats()

  overviewStats.totalStaked = overviewStats.totalStaked.plus(stake)
  overviewStats.totalDelegated = overviewStats.totalDelegated.plus(stake)
  overviewStats.totalFeesPaid = overviewStats.totalFeesPaid.plus(feesPaid)

  let delegators = overviewStats.delegators
  let isDelegatorPresent = delegators.includes(delegatorAddress)
  if (!isDelegatorPresent) {
    delegators.push(delegatorAddress)
    overviewStats.delegators = delegators
    overviewStats.delegatorsCount = overviewStats.delegatorsCount.plus(BigInt.fromI32(1))
    updateDailyChartItem(
      timestamp,
      'Delegators',
      overviewStats.delegatorsCount.toBigDecimal()
    )
  }

  overviewStats.totalPlnEarned = overviewStats.totalPlnEarned.plus(totalPlnEarned)
  overviewStats.save()

  updateDailyChartItem(timestamp, 'TotalProfitLoss', overviewStats.totalPlnEarned)
  updateDailyChartItem(timestamp, 'TotalStaked', overviewStats.totalStaked)
}

export function updateDailyChartItem(
  timestamp: BigInt,
  type: string,
  value: BigDecimal
): void {
  let dayID = timestamp.toI32() / 86400
  let chartItem = DailyChartItem.load(dayID.toString() + '-' + type)
  if (chartItem == null) {
    chartItem = new DailyChartItem(dayID.toString() + '-' + type)
    chartItem.type = type
    chartItem.timestamp = timestamp
  }

  chartItem.value = value
  chartItem.save()
}
