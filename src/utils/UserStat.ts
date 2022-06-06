import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { UserStat } from '../../generated/schema'

export function getOrCreateUserStat(address: string): UserStat {
  let stat = UserStat.load(address)
  if (stat == null) {
    stat = new UserStat(address)
    stat.address = address
    stat.totalPlnDelegatedTo = BigInt.zero()
    stat.totalVePlnDelegatedTo = BigInt.zero()
    stat.totalPlnDelegatedFrom = BigInt.zero()
    stat.totalVePlnDelegatedFrom = BigInt.zero()
    stat.totalDelegators = BigInt.zero()
    stat.reputation = BigDecimal.fromString('100')
    stat.rewardsOrPenaltiesPln = BigDecimal.zero()
    stat.rewardsOrPenaltiesVePln = BigDecimal.zero()
    stat.totalRewardsForDelegators = BigDecimal.zero()
    stat.totalDelegationFeesEarned = BigInt.zero()
    stat.totalRebalances = BigInt.fromI32(0)
    stat.portfolioOpen = false
    stat.save()
  }
  return stat as UserStat
}
