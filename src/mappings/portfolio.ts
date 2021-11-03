import { BigInt, Address } from '@graphprotocol/graph-ts'

import {
  Portfolio as PortfolioContract,
  PortfolioCreated,
  AssetAdded,
} from '../../generated/Portfolio/Portfolio'
import { PAI as ERC20 } from '../../generated/Portfolio/PAI'

import { Portfolio, Asset } from '../../generated/schema'

export function handlePortfolioCreated(event: PortfolioCreated): void {
  let userAddr = event.params.creator.toHexString()

  // Should never already be a portfolio as restricted in contract
  // and any existing will removed from PortfolioClosed handler first
  let portfolio = new Portfolio(userAddr)

  // TODO: Waiting for Pollen stake from event params
  portfolio.pollenStake = BigInt.fromI32(100)
  // TODO: Waiting for initial value from event params
  portfolio.initialValue = BigInt.fromI32(100)

  let contract = PortfolioContract.bind(event.address)

  let storedPortfolio = contract.getPortfolio(
    // TODO: Need to replace first param with module address once added
    event.params.creator,
    event.params.creator,
    event.params.portfolioId
  )

  // TODO: Read allocations and map to portfolio

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
