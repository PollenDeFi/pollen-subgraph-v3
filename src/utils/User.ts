import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { UserStat, Delegation } from '../../generated/schema'

export function getOrCreateUserStat(address: string): UserStat {
  let stat = UserStat.load(address)
  if (stat == null) {
    stat = new UserStat(address)
    stat.address = address
    stat.totalDelegatedTo = BigInt.zero()
    stat.totalDelegatedFrom = BigInt.zero()
    stat.reputation = BigDecimal.fromString('100')
    stat.pollenPnl = BigDecimal.fromString('0')
    stat.totalRebalances = BigInt.fromI32(0)

    stat.save()
  }
  return stat as UserStat
}
