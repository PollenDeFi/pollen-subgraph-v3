import { log } from '@graphprotocol/graph-ts'

// TODO: fix "Trasnfer" typo in .sol
import {
  Leagues,
  NewLeague,
  Invited,
  JoinedLeague,
  LeftLeague,
  TrasnferAdminRole,
} from '../../generated/Leagues/Leagues'

import { League, Member, LeagueMember } from '../../generated/schema'

export function handleNewLeague(event: NewLeague): void {
  let nonce = event.params.id.toHexString()
  let admin = event.params.admin.toHexString()
  let name = event.params.name
  let timestamp = event.block.timestamp

  let league = new League(nonce)
  let member = new Member(admin)
  let leagueMember = new LeagueMember(admin.concat(nonce))

  league.admin = admin
  league.timestamp = timestamp
  league.claimed = false
  league.name = name
  league.members = [member.id]

  member.leagues = [league.id]

  leagueMember.member = member.id
  leagueMember.league = league.id

  league.save()
  member.save()
  leagueMember.save()

  log.info('New league {} {}', [nonce, name])
}
