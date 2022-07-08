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

import { League, Member, LeagueMember, Invitation } from '../../generated/schema'

export function handleNewLeague(event: NewLeague): void {
  let id = event.params.id.toHexString()
  let admin = event.params.admin.toHexString()
  let name = event.params.name
  let timestamp = event.block.timestamp

  let league = new League(id)
  let member = new Member(admin)
  let leagueMember = new LeagueMember(admin.concat(id))

  league.admin = admin
  league.timestamp = timestamp
  league.name = name

  leagueMember.member = member.id
  leagueMember.league = league.id

  league.save()
  member.save()
  leagueMember.save()

  log.info('New league {} {}', [id, name])
}

export function handleJoinedLeague(event: JoinedLeague): void {
  let user = event.params.user.toHexString()
  let leagueId = event.params.leagueId.toHexString()

  let member = Member.load(user)
  let league = League.load(leagueId)

  if (member === null && league) {
    member = new Member(user)

    let leagueMember = new LeagueMember(user.concat(leagueId))

    leagueMember.member = member.id
    leagueMember.league = league.id

    leagueMember.save()

    store.remove('Invitation', user.concat(leagueId))

    log.info('Joined league {} {} {}', [league.id, league.name, user])
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

    if (member) {
      let leagueMember = new LeagueMember(newAdmin.concat(leagueId))
      leagueMember.member = member.id
      leagueMember.league = league.id
      leagueMember.save()
    } else {
      let leagueMember = new LeagueMember(newAdmin.concat(leagueId))
      member = new Member(newAdmin)
      member.save()

      leagueMember.member = member.id
      leagueMember.league = league.id
      leagueMember.save()
    }
    league.admin = newAdmin
    league.save()

    store.remove('LeagueMember', oldAdmin.concat(leagueId))
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

  let assoc = userId.concat(leagueId)
  let member = Member.load(userId)
  let league = League.load(leagueId)

  if (member && league) {
    store.remove('LeagueMember', assoc)
    log.info('Removed member {}', [member.id])
  } else {
    log.error('Failed to remove member', [])
  }
}
