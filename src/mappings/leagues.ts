import { log, store, Address, BigInt } from '@graphprotocol/graph-ts'

// TODO: fix "Trasnfer" typo in .sol
import {
  NewLeague,
  Invited,
  JoinedLeague,
  LeftLeague,
  MemberRemoved,
  TrasnferAdminRole,
} from '../../generated/Leagues/Leagues'

import { League, Member, Invitation } from '../../generated/schema'

export function handleNewLeague(event: NewLeague): void {
  let id = event.params.id.toHexString()
  let admin = event.params.admin.toHexString()
  let name = event.params.name
  let timestamp = event.block.timestamp

  let league = new League(id)
  let member = new Member(admin)

  league.admin = admin
  league.timestamp = timestamp
  league.name = name
  league.members = [member.id]
  league.membersCount = BigInt.fromI32(1)

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
      member.save()
    }

    let leagueMembers = league.members
    leagueMembers.push(member.id)

    league.members = leagueMembers
    league.membersCount = league.membersCount.plus(BigInt.fromI32(1))
    league.save()

    store.remove('Invitation', user.concat(leagueId))

    log.info('Joined league {} - {}, user: {}', [league.id, league.name, user])
  } else {
    log.error('Failed to join league', [])
  }
}

export function handleMemberRemoved(event: MemberRemoved): void {
  removeMember(event.params.user, event.params.leagueId)
}

export function handleLeftLeague(event: LeftLeague): void {
  removeMember(event.params.user, event.params.leagueId)
}

export function handleTransferAdminRole(event: TrasnferAdminRole): void {
  let oldAdmin = event.params.oldAdmin.toHexString()
  let newAdmin = event.params.newAdmin.toHexString()
  let leagueId = event.params.leagueId.toHexString()

  let league = League.load(leagueId)

  if (league) {
    let member = Member.load(newAdmin)
    if (member === null) {
      member = new Member(newAdmin)
      member.save()
    }

    let leagueMembers = league.members
    const oldMember = leagueMembers.indexOf(oldAdmin)

    if (oldMember !== -1) leagueMembers.splice(oldMember, 1)

    leagueMembers.push(newAdmin)

    league.admin = newAdmin
    league.members = leagueMembers
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

function removeMember(user: Address, id: BigInt): void {
  let userId = user.toHexString()
  let leagueId = id.toHexString()
  let league = League.load(leagueId)

  if (league) {
    let leagueMembers = league.members
    const removedMember = leagueMembers.indexOf(userId)
    let member = Member.load(userId)

    if (removedMember !== -1) {
      leagueMembers.splice(removedMember, 1)

      league.membersCount = league.membersCount.minus(BigInt.fromI32(1))
      league.members = leagueMembers
      league.save()

      if (member && member.leagues) {
        if (member.leagues!.length === 0) store.remove('Member', member.id)
      }
    }
  } else {
    log.error('Failed to remove member from league {}', [leagueId])
  }
}
