import { DailyChartItem, OverviewStat } from '../../generated/schema'
import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { USER_OVERVIEW_STATS_ID } from './constants'

export function getOrCreateOverviewStats(): OverviewStat {
  let overviewStats = OverviewStat.load(USER_OVERVIEW_STATS_ID)

  if (overviewStats == null) {
    overviewStats = new OverviewStat(USER_OVERVIEW_STATS_ID)
    overviewStats.totalFeesPaid = BigInt.zero()
    overviewStats.totalPlnStaked = BigDecimal.zero()
    overviewStats.totalVePlnStaked = BigDecimal.zero()
    overviewStats.totalPlnEarnedBurned = BigDecimal.zero()
    overviewStats.totalVePlnEarnedBurned = BigDecimal.zero()
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
  rewardPenalty: BigDecimal,
  isVePln: bool,
  timestamp: BigInt
): void {
  let overviewStats = getOrCreateOverviewStats()

  if (isVePln) {
    overviewStats.totalVePlnStaked = overviewStats.totalVePlnStaked.plus(stake)
    updateDailyChartItem(timestamp, 'TotalVePlnStaked', overviewStats.totalPlnStaked)
  } else {
    overviewStats.totalPlnStaked = overviewStats.totalPlnStaked.plus(stake)
    updateDailyChartItem(timestamp, 'TotalPlnStaked', overviewStats.totalPlnStaked)
  }

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

  if (isVePln && rewardPenalty.lt(BigDecimal.zero())) {
    overviewStats.totalVePlnEarnedBurned = overviewStats.totalVePlnEarnedBurned.plus(
      rewardPenalty
    )
    updateDailyChartItem(
      timestamp,
      'TotalProfitLossVePln',
      overviewStats.totalVePlnEarnedBurned
    )
  } else {
    overviewStats.totalPlnEarnedBurned = overviewStats.totalPlnEarnedBurned.plus(
      rewardPenalty
    )
    updateDailyChartItem(
      timestamp,
      'TotalProfitLossPln',
      overviewStats.totalPlnEarnedBurned
    )
  }

  overviewStats.save()
}

export function updateDelegatorOverviewStats(
  stake: BigDecimal,
  delegatorAddress: string,
  rewardPenalty: BigDecimal,
  feesPaid: BigInt,
  timestamp: BigInt,
  isVePln: bool
): void {
  let overviewStats = getOrCreateOverviewStats()

  if (isVePln) {
    overviewStats.totalVePlnStaked = overviewStats.totalVePlnStaked.plus(stake)
  } else {
    overviewStats.totalPlnStaked = overviewStats.totalPlnStaked.plus(stake)
  }

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

  if (isVePln && rewardPenalty.lt(BigDecimal.zero())) {
    overviewStats.totalVePlnEarnedBurned = overviewStats.totalVePlnEarnedBurned.plus(
      rewardPenalty
    )
    updateDailyChartItem(
      timestamp,
      'TotalProfitLossVePln',
      overviewStats.totalVePlnEarnedBurned
    )
  } else {
    overviewStats.totalPlnEarnedBurned = overviewStats.totalPlnEarnedBurned.plus(
      rewardPenalty
    )
    updateDailyChartItem(
      timestamp,
      'TotalProfitLossPln',
      overviewStats.totalPlnEarnedBurned
    )
  }

  updateDailyChartItem(
    timestamp,
    'TotalDelegationFeesPaid',
    overviewStats.totalFeesPaid.toBigDecimal()
  )

  overviewStats.save()
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
