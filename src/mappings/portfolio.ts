import { BigInt, Address, log } from '@graphprotocol/graph-ts'

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

import { Portfolio, Asset, PortfolioAllocation, Module } from '../../generated/schema'

import { getOrCreateUser, getOrCreateUserStat } from '../utils/User'
import { getContractId, incrementPortfolioId, newPortfolioId } from '../utils/portfolio'

export function handlePortfolioCreated(event: PortfolioCreated): void {
  log.info('portfolio created', [event.params.portfolioId.toString()])

  let portfolioId = newPortfolioId(event.params.portfolioId.toString())

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
  if (user.currentPortfolio !== null) {
    let existingPortfolio = Portfolio.load(user.currentPortfolio!)
    if (existingPortfolio !== null) {
      existingPortfolio.closingValue = event.params.closingValue
      existingPortfolio.closedTimestamp = event.block.timestamp
      existingPortfolio.stakeGainOrLoss = event.params.gainOrLossAmount
      existingPortfolio.save()

      let gainOrLossAmount = event.params.gainOrLossAmount
      updateUserStatsAfterRebalance(existingPortfolio, gainOrLossAmount)

      let portfolioId = incrementPortfolioId(existingPortfolio.id)

      createPortfolio(
        event.address,
        event.params.creator,
        portfolioId,
        event.params.newAmount,
        event.block.timestamp
      )
    } else {
      log.error('Tried rebalance a portfolio that does not exist', [
        event.params.portfolioId.toString(),
      ])
    }
  }
}

export function handlePortfolioClosed(event: PortfolioClosed): void {
  let userAddr = event.params.creator.toHexString()
  let user = getOrCreateUser(userAddr)
  user.currentPortfolio = null
  let id = event.params.portfolioId.toString()
  let portfolio = Portfolio.load(id)

  if (portfolio !== null) {
    portfolio.closingValue = event.params.closingValue
    portfolio.closedTimestamp = event.block.timestamp
    portfolio.stakeGainOrLoss = event.params.gainOrLossAmount
    portfolio.save()

    let gainOrLossAmount = event.params.gainOrLossAmount

    updateUserStatsAfterRebalance(portfolio, gainOrLossAmount)
  } else {
    log.error('no portfolio found when closing, {}', [id])
  }
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
  assetToken.avgAllocation = 0;
  assetToken.isRemoved = false
  assetToken.addedTimestamp = event.block.timestamp

  assetToken.save()
}

export function handleAssetRemoved(event: AssetRemoved): void {
  let assetToken = Asset.load(event.params.asset.toHexString())
  if (assetToken != null) {
    assetToken.isRemoved = true
    assetToken.avgAllocation = 0;
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

      if(asset && weights[i]) {
        asset.avgAllocation = asset.avgAllocation + weights[i]
        asset.save()
      }
    }
  }

  return allocations
}

function updateUserStatsAfterRebalance(portfolio: Portfolio, gainOrLoss: BigInt): void {
  let userStat = getOrCreateUserStat(portfolio.owner)

  if (portfolio.closingValue! > portfolio.initialValue) {
    log.warning('Closing value bigger {}', [gainOrLoss.toString()])
    let dif = portfolio.closingValue!.minus(portfolio.initialValue)
    let percent = dif.toBigDecimal().div(portfolio.initialValue.toBigDecimal())

    let repIncrease = userStat.reputation.times(percent)

    userStat.reputation = userStat.reputation.plus(repIncrease)
    userStat.pollenPnl = userStat.pollenPnl.plus(gainOrLoss.toBigDecimal())
  } else {
    log.warning('Closing value smaller {}', [gainOrLoss.toString()])
    let dif = portfolio.initialValue.minus(portfolio.closingValue!)
    let percent = dif.toBigDecimal().div(portfolio.initialValue.toBigDecimal())

    let repDecrease = userStat.reputation.times(percent)
    userStat.reputation = userStat.reputation.minus(repDecrease)
    userStat.pollenPnl = userStat.pollenPnl.minus(gainOrLoss.toBigDecimal())
  }
  userStat.save()
}

function createPortfolio(
  contractAddress: Address,
  creator: Address,
  portfolioGraphId: string,
  stake: BigInt,
  timestamp: BigInt
): void {
  let moduleAddress = Address.fromString(Module.load('PORTFOLIO')!.address)

  let contract = PortfolioContract.bind(contractAddress)
  let portfolioId = getContractId(portfolioGraphId)
  let storedPortfolio = contract.try_getPortfolio(
    moduleAddress,
    creator,
    BigInt.fromString(portfolioId)
  )

  if (storedPortfolio.reverted) {
    log.error('Failed to fetch portfolio {}', [portfolioGraphId])
  } else {
    let userAddr = creator.toHexString()
    let portfolio = new Portfolio(portfolioGraphId)
    let owner = getOrCreateUser(userAddr)
    let userStat = getOrCreateUserStat(userAddr)
    userStat.totalRebalances = userStat.totalRebalances.plus(BigInt.fromI32(1))

    portfolio.owner = owner.id
    portfolio.pollenStake = stake
    portfolio.createdTimestamp = timestamp

    portfolio.initialValue = storedPortfolio.value.initialValue
    let assets = contract.getAssets(moduleAddress)
    let amounts = storedPortfolio.value.assetAmounts
    let weights = storedPortfolio.value.weights

    let quoterContract = Quoter.bind(contractAddress)

    let allocations = mapAllocations(
      portfolio.id,
      assets,
      weights,
      amounts,
      quoterContract
    )
    portfolio.allocations = allocations
    portfolio.save()

    owner.currentPortfolio = portfolio.id
    owner.save()
    userStat.save()
  }
}
