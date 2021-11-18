import { BigInt } from '@graphprotocol/graph-ts'
import { User, UserStat } from '../../generated/schema'

export function getOrCreateUser(address: string): User {
  let user = User.load(address)
  if (user == null) {
    let userStat = getOrCreateUserStat(address)

    user = new User(address)
    user.stats = userStat.id
    user.save()
  }
  return user as User
}

export function getOrCreateUserStat(address: string): UserStat {
  let stat = UserStat.load(address)
  if (stat == null) {
    stat = new UserStat(address)
    stat.totalDelegatedTo = BigInt.zero()
    stat.totalDelegatedFrom = BigInt.zero()
    stat.reputation = BigInt.zero()
    stat.pollenPnl = BigInt.fromI32(0)

    stat.save()
  }
  return stat as UserStat
}
