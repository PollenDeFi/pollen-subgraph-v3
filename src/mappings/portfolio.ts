import { BigInt, Address, log, BigDecimal } from '@graphprotocol/graph-ts'

import {
  Portfolio as PortfolioContract,
  PortfolioCreated,
  PortfolioClosed,
  PortfolioRebalanced,
  AssetAdded,
  AssetRemoved,
} from '../../generated/Portfolio/Portfolio'
import { PAI as ERC20 } from '../../generated/Portfolio/PAI'
import { Quoter } from '../../generated/Portfolio/Quoter'

import {
  VirtualPortfolio,
  Asset,
  PortfolioAllocation,
  Module,
  PortfolioEntry,
  User,
} from '../../generated/schema'

import { getOrCreateUser, getOrCreateUserStat } from '../utils/User'
import { updateOverViewStats } from '../utils/OverviewStats'

export function handlePortfolioCreated(event: PortfolioCreated): void {
  log.info('Handle portfolio created', [event.params.portfolioId.toString()])

  let portfolioId = event.params.portfolioId.toString()

  updateOverViewStats(
    event.params.amount.toBigDecimal(),
    event.params.creator.toHexString(),
    BigDecimal.fromString('0')
  )

  createPortfolio(
    event.address,
    event.params.creator,
    portfolioId,
    event.params.amount,
    event.block.timestamp
  )
}

export function handlePortfolioRebalanced(event: PortfolioRebalanced): void {
  let userAddr = event.params.creator.toHexString()
  let user = getOrCreateUser(userAddr)
  log.info('Rebalancing Portfolio, {}, {}', [
    event.params.portfolioId.toString(),
    userAddr,
  ])
  let existingPortfolio = VirtualPortfolio.load(event.params.portfolioId.toString())
  if (existingPortfolio !== null) {
    if (existingPortfolio.currentEntry !== null) {
      let currentEntry = PortfolioEntry.load(existingPortfolio.currentEntry!)!

      for (let i = 0; i < currentEntry.allocations.length; i++) {
        let allocation = PortfolioAllocation.load(currentEntry.allocations[i])!
        let asset = Asset.load(allocation.asset)!

        asset.totalAllocation = asset.totalAllocation - allocation.weight
        asset.save()
      }

      currentEntry.closingValue = event.params.closingValue
      currentEntry.stakeGainOrLoss = event.params.gainOrLossAmount
      currentEntry.closedTimestamp = event.block.timestamp
      let gainOrLossAmount = event.params.gainOrLossAmount

      updateUserStatsAfterRebalance(
        currentEntry,
        user,
        event.params.newAmount,
        gainOrLossAmount
      )

      currentEntry.save()
    }

    let newEntry = createPortfolioEntry(
      event.address,
      event.params.creator,
      existingPortfolio.id,
      event.params.newAmount,
      event.block.timestamp
    )

    if (newEntry) {
      let rebalances = existingPortfolio.rebalances
      rebalances.push(existingPortfolio.currentEntry!)
      existingPortfolio.rebalances = rebalances
      existingPortfolio.currentEntry = newEntry.id
    }
    user.currentPortfolio = existingPortfolio.id
    existingPortfolio.save()
    user.save()
  } else {
    log.error('Tried to rebalance a portfolio that does not exist', [
      event.params.portfolioId.toString(),
    ])
  }
}

export function handlePortfolioClosed(event: PortfolioClosed): void {
  let userAddr = event.params.creator.toHexString()
  let user = getOrCreateUser(userAddr)
  let id = event.params.portfolioId.toString()
  let portfolio = VirtualPortfolio.load(id)!

  log.info('Closing portfolio, {}', [portfolio.id])

  if (portfolio && portfolio.currentEntry) {
    let currentEntry = PortfolioEntry.load(portfolio.currentEntry!)!

    for (let i = 0; i < currentEntry.allocations.length; i++) {
      let allocation = PortfolioAllocation.load(currentEntry.allocations[i])!
      let asset = Asset.load(allocation.asset)!

      asset.totalAllocation = asset.totalAllocation - allocation.weight
      asset.save()
    }

    currentEntry.closingValue = event.params.closingValue
    portfolio.closedTimestamp = event.block.timestamp
    currentEntry.closedTimestamp = event.block.timestamp
    currentEntry.stakeGainOrLoss = event.params.gainOrLossAmount
    portfolio.currentEntry = null

    let gainOrLossAmount = event.params.gainOrLossAmount

    updateUserStatsAfterRebalance(currentEntry, user, BigInt.fromI32(0), gainOrLossAmount)

    portfolio.save()
    currentEntry.save()
  } else {
    log.error('no portfolio found when closing, {}', [id])
  }

  user.currentPortfolio = null
  user.save()
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
  assetToken.totalAllocation = 0
  assetToken.isRemoved = false
  assetToken.addedTimestamp = event.block.timestamp

  assetToken.save()
}

export function handleAssetRemoved(event: AssetRemoved): void {
  let assetToken = Asset.load(event.params.asset.toHexString())
  if (assetToken != null) {
    assetToken.isRemoved = true
    assetToken.totalAllocation = 0
    assetToken.save()
  }
}

function mapAllocations(
  portfolioId: string,
  assets: Address[],
  weights: i32[],
  amounts: BigInt[],
  quoterContract: Quoter
): string[] {
  let allocations: string[] = []

  let quoterModule = Address.fromString(Module.load('QUOTER')!.address)

  for (let i = 0; i < assets.length; i++) {
    if (assets[i] !== null) {
      let asset = Asset.load(assets[i].toHexString())
      let allocation = new PortfolioAllocation(
        assets[i].toHexString() + '-' + portfolioId
      )

      let price = quoterContract.quotePrice(
        quoterModule,
        0,
        Address.fromString(asset!.id)
      )

      allocation.initialUsdPrice = price.value0
      allocation.asset = asset!.id
      allocation.weight = weights[i]
      allocation.amount = amounts[i]
      allocation.save()

      allocations.push(allocation.id)

      if (asset && weights[i]) {
        asset.totalAllocation = asset.totalAllocation + weights[i]
        asset.save()
      }
    }
  }

  return allocations
}

function updateUserStatsAfterRebalance(
  portfolioEntry: PortfolioEntry,
  user: User,
  newStake: BigInt,
  gainOrLoss: BigInt
): void {
  let userStat = getOrCreateUserStat(user.id)

  let newStakeDecimal = newStake.toBigDecimal()
  let oldStakeDecimal = portfolioEntry.pollenStake.toBigDecimal()

  let stakeDif = newStakeDecimal.minus(oldStakeDecimal)

  if (portfolioEntry.closingValue! > portfolioEntry.initialValue) {
    let dif = portfolioEntry.closingValue!.minus(portfolioEntry.initialValue)
    let percent = dif.toBigDecimal().div(portfolioEntry.initialValue.toBigDecimal())

    let repIncrease = userStat.reputation.times(percent)

    userStat.reputation = userStat.reputation.plus(repIncrease)
    userStat.pollenPnl = userStat.pollenPnl.plus(gainOrLoss.toBigDecimal())

    updateOverViewStats(stakeDif, user.id, gainOrLoss.toBigDecimal())
  } else {
    let dif = portfolioEntry.initialValue.minus(portfolioEntry.closingValue!)
    let percent = dif.toBigDecimal().div(portfolioEntry.initialValue.toBigDecimal())

    let repDecrease = userStat.reputation.times(percent)
    userStat.reputation = userStat.reputation.minus(repDecrease)
    userStat.pollenPnl = userStat.pollenPnl.minus(gainOrLoss.toBigDecimal())
    updateOverViewStats(stakeDif, user.id, gainOrLoss.toBigDecimal().neg())
  }
  userStat.totalRebalances = userStat.totalRebalances.plus(BigInt.fromI32(1))
  userStat.save()
}

function createPortfolioEntry(
  contractAddress: Address,
  creator: Address,
  portfolioId: string,
  stake: BigInt,
  timestamp: BigInt
): PortfolioEntry | null {
  let moduleAddress = Address.fromString(Module.load('PORTFOLIO')!.address)

  let contract = PortfolioContract.bind(contractAddress)
  let storedPortfolio = contract.try_getPortfolio(
    moduleAddress,
    creator,
    BigInt.fromString(portfolioId)
  )

  if (storedPortfolio.reverted) {
    log.error('Failed to fetch portfolio {}', [portfolioId])
    return null
  } else {
    let entry = new PortfolioEntry(portfolioId + '-' + timestamp.toString())

    entry.pollenStake = stake
    entry.createdTimestamp = timestamp

    entry.initialValue = storedPortfolio.value.initialValue
    let assets = contract.getAssets(moduleAddress)
    let amounts = storedPortfolio.value.assetAmounts
    let weights = storedPortfolio.value.weights

    let quoterContract = Quoter.bind(contractAddress)

    let allocations = mapAllocations(
      portfolioId,
      assets,
      weights,
      amounts,
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
  portfolioId: string,
  stake: BigInt,
  timestamp: BigInt
): void {
  let moduleAddress = Address.fromString(Module.load('PORTFOLIO')!.address)

  let contract = PortfolioContract.bind(contractAddress)
  let storedPortfolio = contract.try_getPortfolio(
    moduleAddress,
    creator,
    BigInt.fromString(portfolioId)
  )

  if (storedPortfolio.reverted) {
    log.error('Failed to fetch portfolio {}', [portfolioId])
  } else {
    let userAddr = creator.toHexString()
    let portfolio = new VirtualPortfolio(portfolioId)
    let owner = getOrCreateUser(userAddr)
    let userStat = getOrCreateUserStat(userAddr)

    portfolio.owner = owner.id
    portfolio.createdTimestamp = timestamp

    let entry = createPortfolioEntry(
      contractAddress,
      creator,
      portfolio.id,
      stake,
      timestamp
    )

    if (entry) {
      portfolio.currentEntry = entry.id

      let rebalances = portfolio.rebalances
      rebalances.push(portfolio.currentEntry!)
      portfolio.rebalances = rebalances
    }

    portfolio.save()

    owner.currentPortfolio = portfolio.id
    owner.save()
    userStat.save()
  }
}
