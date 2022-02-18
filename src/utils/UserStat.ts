import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { UserStat } from '../../generated/schema'

export function getOrCreateUserStat(address: string): UserStat {
  let stat = UserStat.load(address)
  if (stat == null) {
    stat = new UserStat(address)
    stat.address = address
    stat.totalDelegatedTo = BigInt.zero()
    stat.totalDelegatedFrom = BigInt.zero()
    stat.totalDelegators = BigInt.zero()
    stat.reputation = BigDecimal.fromString('100')
    stat.pollenPnl = BigDecimal.zero()
    stat.totalRewardsForDelegators = BigDecimal.zero()
    stat.totalRebalances = BigInt.fromI32(0)
    stat.portfolioStake = BigInt.fromI32(0)
    stat.save()
  }
  return stat as UserStat
}
