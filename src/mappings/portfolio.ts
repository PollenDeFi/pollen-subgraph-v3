import { BigInt, Address } from '@graphprotocol/graph-ts'

import {
  Portfolio as PortfolioContract,
  PortfolioCreated,
  PortfolioClosed,
  AssetAdded,
} from '../../generated/Portfolio/Portfolio'
import { PAI as ERC20 } from '../../generated/Portfolio/PAI'

import { Portfolio, Asset, User, UserStat } from '../../generated/schema'

export function handlePortfolioCreated(event: PortfolioCreated): void {
  let userAddr = event.params.creator.toHexString()
  let user = getOrCreateUser(userAddr)
  let id = userAddr + '-' + event.params.portfolioId.toString()

  // Should never already be a portfolio as restricted in contract
  // and any existing will removed from PortfolioClosed handler first
  let portfolio = new Portfolio(id)
  portfolio.owner = user.id
  // TODO: Waiting for Pollen stake from event params
  portfolio.pollenStake = BigInt.fromI32(100)

  let contract = PortfolioContract.bind(event.address)

  let storedPortfolio = contract.getPortfolio(
    // TODO: Need to replace first param with module address once added
    event.params.creator,
    event.params.creator,
    event.params.portfolioId
  )

  portfolio.initialValue = storedPortfolio.initialValue

  // TODO: Read allocations and map to portfolio

  portfolio.save()
}

export function handlePortfolioClosed(event: PortfolioClosed): void {
  let userAddr = event.params.creator.toHexString()
  let id = userAddr + '-' + event.params.portfolioId.toString()
  let portfolio = Portfolio.load(id)!

  // TODO: Waiting for closing value from event params
  let userStat = getOrCreateUserStat(userAddr)

  // TODO: Waiting for pnl from contract
  let pollenPnl = BigInt.fromI32(100)
  userStat.pollenPnl = userStat.pollenPnl.plus(pollenPnl)

  // TODO: Waiting on event param
  portfolio.closingValue = BigInt.fromI32(100)

  if (portfolio.closingValue > portfolio.initialValue) {
    let percent = portfolio
      .closingValue!.minus(portfolio.initialValue)
      .div(portfolio.initialValue)

    let repIncrease = userStat.reputation.times(percent)
    userStat.reputation = userStat.reputation.plus(repIncrease)
  } else {
    let percent = portfolio.initialValue
      .minus(portfolio.closingValue!)
      .div(portfolio.initialValue)

    let repDecrease = userStat.reputation.times(percent)
    userStat.reputation = userStat.reputation.minus(repDecrease)
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

function getOrCreateUser(address: string): User {
  let user = User.load(address)
  if (user == null) {
    let userStat = getOrCreateUserStat(address)

    user = new User(address)
    user.stats = userStat.id
    user.save()
  }
  return user as User
}

function getOrCreateUserStat(address: string): UserStat {
  let stat = UserStat.load(address)
  if (stat == null) {
    let stat = new UserStat(address)
    stat.totalDelegatedTo = BigInt.zero()
    stat.totalDelegatedFrom = BigInt.zero()
    stat.reputation = BigInt.zero()
    stat.pollenPnl = BigInt.fromI32(0)

    stat.save()
  }
  return stat as UserStat
}
