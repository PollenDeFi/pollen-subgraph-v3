import { BigInt } from '@graphprotocol/graph-ts'

export function newPortfolioId(portfolioContractId: string): string {
  return portfolioContractId + ':' + '0'
}

export function incrementPortfolioId(portfolioId: string): string {
  let idParts = portfolioId.split(':')
  return (
    idParts[0] +
    ':' +
    BigInt.fromString(idParts[1])
      .plus(BigInt.fromI32(1))
      .toString()
  )
}

export function getContractId(portfolioId: string): string {
  let idParts = portfolioId.split(':')
  return idParts[0]
}
