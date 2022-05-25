import { BigInt, Address, log, BigDecimal } from '@graphprotocol/graph-ts'

import {
  Portfolio as PortfolioContract,
  PortfolioCreated,
  PortfolioRebalanced,
  AssetAdded,
  AssetRemoved,
  Delegated,
  BenchmarkPortfolioCreated,
} from '../../generated/Portfolio/Portfolio'
import { Quoter } from '../../generated/Portfolio/Quoter'
import { ERC20 } from '../../generated/Portfolio/ERC20'

import {
  VirtualPortfolio,
  Asset,
  PortfolioAllocation,
  PortfolioEntry,
  Delegation,
  AssetProfitOrLoss,
  DelegateDeposit,
  PortfolioDeposit,
  PortfolioEvent,
  DelegationEvent,
} from '../../generated/schema'

import { getOrCreateUserStat } from '../utils/UserStat'
import { updatePollenatorOverviewStats } from '../utils/OverviewStats'

export function handlePortfolioCreated(event: PortfolioCreated): void {
  let userAddr = event.params.creator.toHexString()

  log.info('Handle portfolio created', [userAddr])

  updatePollenatorOverviewStats(
    event.params.amount.toBigDecimal(),
    event.params.creator.toHexString(),
    BigDecimal.fromString('0'),
    event.params.tokenType,
    event.block.timestamp
  )

  createPortfolio(
    event.address,
    event.params.creator,
    event.params.weights,
    event.params.amount,
    event.params.tokenType,
    event.block.timestamp
  )
}

export function handleBenchmarkCreated(event: BenchmarkPortfolioCreated): void {
  createPortfolio(
    event.address,
    event.params.creator,
    event.params.weights,
    BigInt.zero(),
    false,
    event.block.timestamp,
    true
  )
}

export function handlePortfolioRebalanced(event: PortfolioRebalanced): void {
  let userAddr = event.params.creator.toHexString()
  log.info('Rebalancing Portfolio, {}', [userAddr])
  let existingPortfolio = VirtualPortfolio.load(userAddr)

  if (event.params.amount.gt(BigInt.zero())) {
    let deposit = new PortfolioDeposit(userAddr + event.block.number.toString())
    deposit.amount = event.params.amount
    deposit.user = userAddr
    deposit.tokenType = event.params.tokenType ? 'vepln' : 'pln'
    deposit.timestamp = event.block.timestamp
    deposit.save()

    let depositEvent = new PortfolioEvent(
      'deposit-' + userAddr + event.block.timestamp.toString()
    )
    depositEvent.user = userAddr
    depositEvent.timestamp = event.block.timestamp
    depositEvent.type = 'portfolio_deposit'
    depositEvent.portfolioDeposit = deposit.id
    depositEvent.save()
  }

  if (existingPortfolio !== null) {
    if (event.params.tokenType) {
      existingPortfolio.vePlnStake = existingPortfolio.vePlnStake.plus(
        event.params.amount
      )
    } else {
      existingPortfolio.plnStake = existingPortfolio.plnStake.plus(event.params.amount)
    }

    if (existingPortfolio.currentEntry !== null) {
      let currentEntry = PortfolioEntry.load(existingPortfolio.currentEntry!)!
      for (let i = 0; i < currentEntry.allocations.length; i++) {
        let allocation = PortfolioAllocation.load(currentEntry.allocations[i])!
        let asset = Asset.load(allocation.asset)!
        updateAssetProfitLoss(existingPortfolio, allocation, event.address)

        asset.totalAllocation = asset.totalAllocation.minus(allocation.weight)
        asset.save()
      }
      currentEntry.plnStake = existingPortfolio.plnStake
      currentEntry.vePlnStake = existingPortfolio.vePlnStake
      currentEntry.closingValue = event.params.portfolioValue
      currentEntry.closedTimestamp = event.block.timestamp

      updateUserStatsAfterRebalance(currentEntry, userAddr, event.block.timestamp)

      currentEntry.save()
    }

    let newEntry = createPortfolioEntry(
      event.address,
      event.params.creator,
      event.params.weights,
      existingPortfolio.plnStake,
      existingPortfolio.vePlnStake,
      event.block.timestamp
    )

    if (newEntry) {
      let rebalances = existingPortfolio.rebalances
      rebalances.push(newEntry.id)
      existingPortfolio.rebalances = rebalances
      existingPortfolio.currentEntry = newEntry.id

      let rebalanceEvent = new PortfolioEvent(
        'rebalance-' + userAddr + event.block.timestamp.toString()
      )
      rebalanceEvent.user = userAddr
      rebalanceEvent.timestamp = event.block.timestamp
      rebalanceEvent.type = 'portfolio_rebalance'
      rebalanceEvent.portfolioRebalance = newEntry.id
      rebalanceEvent.save()
    }

    // Portfolio is considered closed when 100% USDT
    existingPortfolio.isClosed = event.params.weights[0].equals(BigInt.fromI32(100))

    existingPortfolio.updatedTimestamp = event.block.timestamp
    existingPortfolio.save()
  } else {
    log.error('Tried to rebalance a portfolio that does not exist', [userAddr])
  }
}

export function handleAssetAdded(event: AssetAdded): void {
  let assetToken = Asset.load(event.params.asset.toHexString())
  if (assetToken == null) {
    assetToken = new Asset(event.params.asset.toHexString())
  }

  let assetContract = ERC20.bind(Address.fromString(assetToken.id))

  assetToken.name = assetContract.name()
  assetToken.symbol = assetContract.symbol()
  assetToken.decimals = assetContract.decimals()
  assetToken.totalAllocation = BigInt.zero()
  assetToken.isRemoved = false
  assetToken.addedTimestamp = event.block.timestamp

  assetToken.save()
}

export function handleAssetRemoved(event: AssetRemoved): void {
  let assetToken = Asset.load(event.params.asset.toHexString())
  if (assetToken != null) {
    assetToken.isRemoved = true
    assetToken.totalAllocation = BigInt.zero()
    assetToken.save()
  }
}

export function handleDelegated(event: Delegated): void {
  let delegator = event.params.delegator.toHexString()
  let delegatee = event.params.delegatee.toHexString()

  log.info('handle delegated, {} {}', [delegator, delegatee])

  if (delegator == delegatee) {
    // Delegating to yourself just means increasing your current stake
    let portfolio = VirtualPortfolio.load(delegatee)
    if (portfolio) {
      let newStake = portfolio.plnStake.plus(event.params.amount)
      portfolio.plnStake = newStake
      portfolio.updatedTimestamp = event.block.timestamp
      let delegateeStat = getOrCreateUserStat(delegatee)
      delegateeStat.portfolioOpen = true
      delegateeStat.updatedTimestamp = event.block.timestamp
      delegateeStat.save()
      portfolio.save()
    }

    let deposit = new PortfolioDeposit(delegator + event.block.number.toString())
    deposit.amount = event.params.amount
    deposit.user = delegator
    deposit.tokenType = event.params.tokenType ? 'vepln' : 'pln'
    deposit.timestamp = event.block.timestamp
    deposit.save()

    let depositEvent = new PortfolioEvent(
      'deposit-' + delegator + event.block.timestamp.toString()
    )
    depositEvent.user = delegator
    depositEvent.timestamp = event.block.timestamp
    depositEvent.type = 'portfolio_deposit'
    depositEvent.portfolioDeposit = deposit.id
    depositEvent.save()
  } else {
    // Delegating to someone else
    let id = delegator + '-' + delegatee

    let delegation = Delegation.load(id)
    let delegateeStat = getOrCreateUserStat(delegatee)
    let delegatorStat = getOrCreateUserStat(delegator)

    let deposit = new DelegateDeposit(id + event.block.number.toString())
    deposit.amount = event.params.amount
    deposit.delegatee = delegatee
    deposit.delegator = delegator
    deposit.tokenType = event.params.tokenType ? 'vepln' : 'pln'
    deposit.timestamp = event.block.timestamp
    deposit.save()

    let depositEvent = new DelegationEvent(
      'deposit-' + id + event.block.number.toString()
    )
    depositEvent.delegatee = delegatee
    depositEvent.delegator = delegator
    depositEvent.timestamp = event.block.timestamp
    depositEvent.type = 'delegate_deposit'
    depositEvent.delegateDeposit = deposit.id
    depositEvent.save()

    if (delegation) {
      if (delegation.plnAmount.isZero() && delegation.vePlnAmount.isZero()) {
        // Starting again after returning to zero
        delegation.startTimestamp = event.block.timestamp
      }
      delegation.updatedTimestamp = event.block.timestamp
      if (event.params.tokenType) {
        delegation.vePlnAmount = delegation.vePlnAmount.plus(event.params.amount)
      } else {
        delegation.plnAmount = delegation.plnAmount.plus(event.params.amount)
      }
    } else {
      delegation = new Delegation(id)
      delegation.delegateeStats = delegateeStat.id
      delegation.delegatorStats = delegatorStat.id
      delegation.rewardsOrPenaltiesPln = BigDecimal.zero()
      delegation.rewardsOrPenaltiesVePln = BigDecimal.zero()
      delegation.delegatee = delegatee
      delegation.delegator = delegator
      if (event.params.tokenType) {
        delegation.vePlnAmount = event.params.amount
      } else {
        delegation.plnAmount = event.params.amount
      }
      delegation.startTimestamp = event.block.timestamp
      delegation.updatedTimestamp = event.block.timestamp
      delegateeStat.totalDelegators = delegateeStat.totalDelegators.plus(
        BigInt.fromString('1')
      )

      delegatorStat.totalDelegators = delegatorStat.totalDelegators.plus(
        BigInt.fromString('1')
      )
    }
    if (event.params.tokenType) {
      delegatorStat.totalVePlnDelegatedTo = delegatorStat.totalVePlnDelegatedTo.plus(
        event.params.amount
      )
      delegateeStat.totalVePlnDelegatedFrom = delegateeStat.totalVePlnDelegatedFrom.plus(
        event.params.amount
      )
    } else {
      delegatorStat.totalPlnDelegatedTo = delegatorStat.totalPlnDelegatedTo.plus(
        event.params.amount
      )
      delegateeStat.totalPlnDelegatedFrom = delegateeStat.totalPlnDelegatedFrom.plus(
        event.params.amount
      )
    }

    delegateeStat.updatedTimestamp = event.block.timestamp
    delegatorStat.updatedTimestamp = event.block.timestamp

    delegatorStat.save()
    delegateeStat.save()

    delegation.save()
  }
}

function mapAllocations(
  entryId: string,
  assets: Address[],
  weights: BigInt[],
  amounts: BigInt[],
  quoterContract: Quoter
): string[] {
  let allocations: string[] = []

  for (let i = 0; i < assets.length; i++) {
    if (assets[i] !== null) {
      let asset = Asset.load(assets[i].toHexString())
      let allocation = new PortfolioAllocation(assets[i].toHexString() + '-' + entryId)

      let price = quoterContract.quotePrice(0, Address.fromString(asset!.id))

      allocation.initialUsdPrice = price.value0
      allocation.asset = asset!.id
      allocation.weight = weights[i]
      allocation.amount = amounts[i]
      allocation.save()

      allocations.push(allocation.id)

      if (asset && weights[i]) {
        asset.totalAllocation = asset.totalAllocation.plus(weights[i])
        asset.save()
      }
    }
  }

  return allocations
}

function updateUserStatsAfterRebalance(
  portfolioEntry: PortfolioEntry,
  userAddr: string,
  timestamp: BigInt
): void {
  let userStat = getOrCreateUserStat(userAddr)

  if (portfolioEntry.closingValue! > portfolioEntry.initialValue) {
    let dif = portfolioEntry.closingValue!.minus(portfolioEntry.initialValue)
    let percent = dif.toBigDecimal().div(portfolioEntry.initialValue.toBigDecimal())

    let repIncrease = userStat.reputation.times(percent)

    userStat.reputation = userStat.reputation.plus(repIncrease)
  } else {
    let dif = portfolioEntry.initialValue.minus(portfolioEntry.closingValue!)
    let percent = dif.toBigDecimal().div(portfolioEntry.initialValue.toBigDecimal())

    let repDecrease = userStat.reputation.times(percent)
    userStat.reputation = userStat.reputation.minus(repDecrease)
  }
  userStat.totalRebalances = userStat.totalRebalances.plus(BigInt.fromI32(1))
  userStat.updatedTimestamp = timestamp
  userStat.portfolioOpen = true
  userStat.save()
}

function createPortfolioEntry(
  contractAddress: Address,
  creator: Address,
  weights: BigInt[],
  plnStake: BigInt,
  vePlnStake: BigInt,
  timestamp: BigInt
): PortfolioEntry | null {
  let contract = PortfolioContract.bind(contractAddress)
  let storedPortfolio = contract.try_getPortfolio(creator, creator)

  if (storedPortfolio.reverted) {
    log.error('Failed to fetch portfolio {}', [creator.toHexString()])
    return null
  } else {
    let entry = new PortfolioEntry(creator.toHexString() + '-' + timestamp.toHexString())

    let benchmarkValue = contract.try_getBenchMarkValue()
    if (benchmarkValue.reverted) {
      log.error('Failed to get benchmark value', [])
      entry.benchmarkValue = BigInt.zero()
    } else {
      entry.benchmarkValue = benchmarkValue.value
    }

    entry.createdTimestamp = timestamp
    entry.plnStake = plnStake
    entry.vePlnStake = vePlnStake

    let assetAmounts = storedPortfolio.value.value0
    let assets = contract.getAssets()
    entry.initialValue = getPortfolioValue(contractAddress, assetAmounts)

    let quoterContract = Quoter.bind(contractAddress)

    let allocations = mapAllocations(
      entry.id,
      assets,
      weights,
      assetAmounts,
      quoterContract
    )
    entry.allocations = allocations

    entry.save()
    return entry
  }
}

function createPortfolio(
  contractAddress: Address,
  creator: Address,
  weights: BigInt[],
  stake: BigInt,
  isVePln: bool,
  timestamp: BigInt,
  isBenchmark: boolean = false
): void {
  let contract = PortfolioContract.bind(contractAddress)
  let storedPortfolio = contract.try_getPortfolio(creator, creator)
  let userAddr = creator.toHexString()
  let userStat = getOrCreateUserStat(userAddr)

  if (storedPortfolio.reverted) {
    log.error('Failed to fetch portfolio {}', [creator.toHexString()])
  } else {
    let portfolio = VirtualPortfolio.load(userAddr)
    if (portfolio == null) {
      portfolio = new VirtualPortfolio(userAddr)
      portfolio.assetsProfitOrLoss = []
      portfolio.rewardsOrPenaltiesPln = BigDecimal.zero()
      portfolio.rewardsOrPenaltiesVePln = BigDecimal.zero()
      portfolio.owner = userAddr
      portfolio.updatedTimestamp = timestamp
      portfolio.openTimestamp = timestamp
      portfolio.ownerStats = userStat.id
      portfolio.rebalances = []
      portfolio.isBenchmark = isBenchmark

      if (isVePln) {
        portfolio.vePlnStake = stake
      } else {
        portfolio.plnStake = stake
      }
    }

    let entry = createPortfolioEntry(
      contractAddress,
      creator,
      weights,
      portfolio.vePlnStake,
      portfolio.plnStake,
      timestamp
    )

    if (entry) {
      portfolio.currentEntry = entry.id

      let rebalances = portfolio.rebalances
      rebalances.push(entry.id)
      portfolio.rebalances = rebalances

      let rebalanceEvent = new PortfolioEvent(
        'rebalance-' + userAddr + timestamp.toString()
      )
      rebalanceEvent.user = userAddr
      rebalanceEvent.timestamp = timestamp
      rebalanceEvent.type = 'portfolio_rebalance'
      rebalanceEvent.portfolioRebalance = entry.id
      rebalanceEvent.save()
    }
    portfolio.isClosed = false
    portfolio.save()

    userStat.portfolio = portfolio.id
    userStat.portfolioOpen = true
    userStat.updatedTimestamp = timestamp
    userStat.save()
  }
}

function getPortfolioValue(
  portfolioContractAddr: Address,
  assetAmounts: BigInt[]
): BigInt {
  let contract = PortfolioContract.bind(portfolioContractAddr)

  let assets = contract.getAssets()
  let prices = contract.getPrices(assetAmounts, assets)
  let portfolioValue = contract.try_getPortfolioValue(assetAmounts, prices)
  if (portfolioValue.reverted) {
    log.error('Failed to calculate portfolio value', [])
    return BigInt.zero()
  } else {
    return portfolioValue.value
  }
}

function updateAssetProfitLoss(
  portfolio: VirtualPortfolio,
  allocation: PortfolioAllocation,
  contractAddress: Address
): void {
  let profitLossId = portfolio.id + portfolio.openTimestamp.toString() + allocation.asset
  let assetProfitOrLoss = AssetProfitOrLoss.load(profitLossId)

  if (!assetProfitOrLoss) {
    assetProfitOrLoss = new AssetProfitOrLoss(profitLossId)
    assetProfitOrLoss.asset = allocation.asset
    let profitAndLosses = portfolio.assetsProfitOrLoss
    profitAndLosses.push(assetProfitOrLoss.id)
    portfolio.assetsProfitOrLoss = profitAndLosses
  }

  let startValue = allocation.initialUsdPrice.times(allocation.amount).toBigDecimal()

  let quoterContract = Quoter.bind(contractAddress)
  let price = quoterContract.quotePrice(0, Address.fromString(allocation.asset))
  let endValue = price.value0.times(allocation.amount).toBigDecimal()
  let diff = endValue.minus(startValue)

  assetProfitOrLoss.profitOrLoss.plus(diff)
  assetProfitOrLoss.save()
}
