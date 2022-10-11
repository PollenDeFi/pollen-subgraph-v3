import { log, store, Address, BigInt, BigDecimal } from '@graphprotocol/graph-ts'

import {
  NewLeague,
  Invited,
  JoinedLeague,
  LeftLeague,
  MemberRemoved,
  TransferAdminRole,
} from '../../generated/Leagues/Leagues'

import { League, Member, Invitation } from '../../generated/schema'

// FIXME: get nft price and max supply from event params
export function handleNewLeague(event: NewLeague): void {
  let id = event.params.id.toHexString()
  let admin = event.params.admin.toHexString()
  let name = event.params.name
  let timestamp = event.block.timestamp

  let league = new League(id)
  let member = new Member(admin)
  let contract = Contract.bind(contractAddress)
  let info = contract.try_leagues(event.params.id)

  league.admin = admin
  league.timestamp = timestamp
  league.name = name
  league.maxSupply = BigInt.zero()
  league.nftPrice = BigInt.zero()
  league.membersCount = BigInt.fromI32(1)
  league.totalPlnStaked = BigDecimal.zero()
  league.totalVePlnStaked = BigDecimal.zero()
  league.rewardsOrPenaltiesPln = BigDecimal.zero()
  league.rewardsOrPenaltiesVePln = BigDecimal.zero()

  if (info.reverted) {
    log.error('Failed to fetch league info {}', [id])
  } else {
    league.nftPrice = info.value.value3
    league.maxSupply = info.value.value4
  }

  member.leagues = [league.id]

  league.save()
  member.save()

  log.info('New league {} {}', [id, name])
}

export function handleJoinedLeague(event: JoinedLeague): void {
  let user = event.params.user.toHexString()
  let leagueId = event.params.leagueId.toHexString()
  let member = Member.load(user)
  let league = League.load(leagueId)

  if (league) {
    if (member === null) {
      member = new Member(user)
      member.leagues = [league.id]
    } else {
      let memberLeagues = member.leagues
      memberLeagues.push(league.id)
      member.leagues = memberLeagues
    }
    member.save()

    league.membersCount = league.membersCount.plus(BigInt.fromI32(1))
    league.save()

    log.info('Joined league {} - {}, user: {}', [league.id, league.name, user])
  } else {
    log.error('Failed to join league', [])
  }
}

export function handleMemberRemoved(event: MemberRemoved): void {
  removeMembership(event.params.user, event.params.leagueId)
}

export function handleLeftLeague(event: LeftLeague): void {
  removeMembership(event.params.user, event.params.leagueId)
}

export function handleTransferAdminRole(event: TransferAdminRole): void {
  let newAdmin = event.params.newAdmin.toHexString()
  let leagueId = event.params.leagueId.toHexString()
  let league = League.load(leagueId)
  let newMember = Member.load(newAdmin)

  if (league) {
    if (newMember === null) {
      newMember = new Member(newAdmin)
      newMember.leagues = [league.id]
      league.membersCount = league.membersCount.plus(BigInt.fromI32(1))
    } else {
      let newMemberLeagues = newMember.leagues
      if (newMemberLeagues) {
        if (newMemberLeagues.indexOf(league.id) === -1) {
          newMemberLeagues.push(leagueId)
          newMember.leagues = newMemberLeagues
          league.membersCount = league.membersCount.plus(BigInt.fromI32(1))
        }
      }
    }
    league.admin = newAdmin
    newMember.save()
    league.save()
  } else {
    log.error('Failed to transfer admin role', [])
  }
}

export function handleInvited(event: Invited): void {
  let user = event.params.user.toHexString()
  let leagueId = event.params.leagueId.toHexString()

  let invitation = new Invitation(user.concat(leagueId))
  invitation.user = user
  invitation.league = leagueId

  invitation.save()

  log.info('Invited new user to the league {} {}', [user, leagueId])
}

function removeMembership(user: Address, id: BigInt): void {
  let userId = user.toHexString()
  let leagueId = id.toHexString()
  let league = League.load(leagueId)
  let member = Member.load(userId)

  if (member) {
    if (league) {
      let memberLeagues = member.leagues
      if (memberLeagues) {
        const removedLeague = memberLeagues.indexOf(leagueId)
        if (removedLeague !== -1) {
          memberLeagues.splice(removedLeague, 1)
          member.leagues = memberLeagues
          member.save()

          league.membersCount = league.membersCount.minus(BigInt.fromI32(1))
          league.save()
        }
        if (memberLeagues.length === 0) store.remove('Member', member.id)
      }
    }
  } else {
    log.error('Failed to remove member from league {}', [leagueId])
  }
}
