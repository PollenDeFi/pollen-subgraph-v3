import { BigInt, Address, log } from '@graphprotocol/graph-ts'

import {
  Portfolio as PortfolioContract,
  PortfolioCreated,
  PortfolioClosed,
  AssetAdded,
} from '../../generated/Portfolio/Portfolio'
import { PAI as ERC20 } from '../../generated/Portfolio/PAI'
import { Quoter } from '../../generated/Portfolio/Quoter'

import { Portfolio, Asset, PortfolioAllocation, Module } from '../../generated/schema'

import { getOrCreateUser, getOrCreateUserStat } from '../utils/User'

export function handlePortfolioCreated(event: PortfolioCreated): void {
  let moduleAddress = Address.fromString(Module.load('PORTFOLIO')!.address)

  let id = event.params.portfolioId.toString()

  let contract = PortfolioContract.bind(event.address)
  let storedPortfolio = contract.try_getPortfolio(
    moduleAddress,
    event.params.creator,
    event.params.portfolioId
  )
  if (storedPortfolio.reverted) {
    log.info('Failed to fetch portfolio {}', [id])
  } else {
    let userAddr = event.params.creator.toHexString()
    let portfolio = new Portfolio(id)
    let owner = getOrCreateUser(userAddr)
    let userStat = getOrCreateUserStat(userAddr)
    userStat.totalRebalances = userStat.totalRebalances.plus(BigInt.fromI32(1))

    portfolio.owner = owner.id
    portfolio.pollenStake = event.params.amount
    portfolio.createdTimestamp = event.block.timestamp

    portfolio.initialValue = storedPortfolio.value.initialValue
    let assets = contract.getAssets(moduleAddress)
    let amounts = storedPortfolio.value.assetAmounts
    let weights = storedPortfolio.value.weights

    let quoterContract = Quoter.bind(event.address)

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

export function handlePortfolioClosed(event: PortfolioClosed): void {
  let userAddr = event.params.creator.toHexString()
  let userStat = getOrCreateUserStat(userAddr)
  let user = getOrCreateUser(userAddr)
  user.currentPortfolio = null
  let id = event.params.portfolioId.toString()

  let portfolio = Portfolio.load(id)

  if (portfolio !== null) {
    portfolio.closingValue = event.params.closingValue
    portfolio.closedTimestamp = event.block.timestamp

    let pollenAmount = event.params.gainOrLossAmount

    if (portfolio.closingValue > portfolio.initialValue) {
      let dif = portfolio.closingValue!.minus(portfolio.initialValue)
      let percent = dif.toBigDecimal().div(portfolio.initialValue.toBigDecimal())

      let repIncrease = userStat.reputation.times(percent)

      userStat.reputation = userStat.reputation.plus(repIncrease)
      userStat.pollenPnl = userStat.pollenPnl.plus(pollenAmount)
    } else {
      let dif = portfolio.initialValue.minus(portfolio.closingValue!)
      let percent = dif.toBigDecimal().div(portfolio.initialValue.toBigDecimal())

      let repDecrease = userStat.reputation.times(percent)
      userStat.reputation = userStat.reputation.minus(repDecrease)
      userStat.pollenPnl = userStat.pollenPnl.minus(pollenAmount)
    }

    portfolio.save()
  } else {
    log.warning('no portfolio found when closing, {}', [id])
  }
  userStat.save()
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

  assetToken.save()
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
    let asset = Asset.load(assets[i].toHexString())
    let allocation = new PortfolioAllocation(assets[i].toHexString() + '-' + portfolioId)

    let price = quoterContract.quotePrice(quoterModule, 0, Address.fromString(asset!.id))

    allocation.initialUsdPrice = price.value0
    allocation.asset = asset!.id
    allocation.weight = weights[i]
    allocation.amount = amounts[i]
    allocation.save()

    allocations.push(allocation.id)
  }

  return allocations
}
