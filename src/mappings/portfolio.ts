import { BigInt, Address } from '@graphprotocol/graph-ts'

import {
  Portfolio as PortfolioContract,
  PortfolioCreated,
  PortfolioClosed,
  AssetAdded,
} from '../../generated/Portfolio/Portfolio'
import { PAI as ERC20 } from '../../generated/Portfolio/PAI'

import { Portfolio, Asset, AssetBalance, Module } from '../../generated/schema'

import { getOrCreateUser, getOrCreateUserStat } from '../utils/User'

export function handlePortfolioCreated(event: PortfolioCreated): void {
  //   let moduleAddress = Address.fromString(Module.load('PORTFOLIO')!.address)
  // Waiting for module added event to be fixed
  let moduleAddress = Address.fromString('0x23A8F41d045D1bdE5C4CCc6C47D56cf762f1F5a6')
  let userAddr = event.params.creator.toHexString()
  let id = event.params.portfolioId.toString()
  let portfolio = new Portfolio(id)
  portfolio.owner = getOrCreateUser(userAddr).id
  portfolio.pollenStake = event.params.amount
  portfolio.createdTimestamp = event.block.timestamp
  let contract = PortfolioContract.bind(event.address)
  let storedPortfolio = contract.getPortfolio(
    moduleAddress,
    event.params.creator,
    event.params.portfolioId
  )
  portfolio.initialValue = storedPortfolio.initialValue
  let assets = contract.getAssets(moduleAddress)
  let weights = contract.getPortfolio(
    moduleAddress,
    Address.fromString(portfolio.owner),
    BigInt.fromString(portfolio.id)
  ).assetAmounts
  let mappedAssets = mapAssets(portfolio.id, assets, weights)
  portfolio.assetBalances = mappedAssets
  portfolio.save()
}

export function handlePortfolioClosed(event: PortfolioClosed): void {
  let userAddr = event.params.creator.toHexString()
  let userStat = getOrCreateUserStat(userAddr)
  let id = userAddr + '-' + event.params.portfolioId.toString()

  let portfolio = Portfolio.load(id)!
  portfolio.closingValue = event.params.closingValue
  portfolio.closedTimestamp = event.block.timestamp

  let pollenAmount = event.params.gainOrLossAmount

  if (portfolio.closingValue > portfolio.initialValue) {
    let percent = portfolio
      .closingValue!.minus(portfolio.initialValue)
      .div(portfolio.initialValue)

    let repIncrease = userStat.reputation.times(percent)
    userStat.reputation = userStat.reputation.plus(repIncrease)
    userStat.pollenPnl = userStat.pollenPnl.plus(pollenAmount)
  } else {
    let percent = portfolio.initialValue
      .minus(portfolio.closingValue!)
      .div(portfolio.initialValue)

    let repDecrease = userStat.reputation.times(percent)
    userStat.reputation = userStat.reputation.minus(repDecrease)
    userStat.pollenPnl = userStat.pollenPnl.minus(pollenAmount)
  }

  userStat.save()
  portfolio.save()
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

function mapAssets(portfolioId: string, assets: Address[], weights: BigInt[]): string[] {
  let assetBalances!: string[]

  for (let i = 0; i < assets.length; i++) {
    if (weights[i]) {
      let asset = Asset.load(assets[i].toHexString())
      let assetBalance = new AssetBalance(assets[i].toHexString() + '-' + portfolioId)

      assetBalance.asset = asset!.id
      assetBalance.amount = weights[i]
      assetBalance.save()

      assetBalances.push(assetBalance.id)
    }
  }

  return assetBalances
}
