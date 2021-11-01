import { BigInt, Address } from '@graphprotocol/graph-ts'

import {
  Portfolio as PortfolioContract,
  PortfolioCreated,
  AssetAdded,
} from '../../generated/Portfolio/Portfolio'
import { ERC20 } from '../../generated/PollenDAO/ERC20'

import { Portfolio, Asset } from '../../generated/schema'

export function handlePortfolioCreated(event: PortfolioCreated): void {
  let userAddr = event.params.creator.toHexString()

  // Should never already be a portfolio as restricted in contract
  // and any existing will removed from PortfolioClosed handler first
  let portfolio = new Portfolio(userAddr)
  let contract = PortfolioContract.bind(event.address)

  // TODO: Waiting for id to be added to event params
  let portfolioId = BigInt.fromI32(100)

  // TODO: Wait for clarity on first address arg

  let storedPortfolio = contract.getPortfolio(
    event.params.creator,
    event.params.creator,
    portfolioId
  )
  // TODO: Can we read the portfolio that has been created
  // in this block or will we need to the data in the event

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
