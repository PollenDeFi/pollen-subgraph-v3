import { log, store, Address, BigInt, BigDecimal } from '@graphprotocol/graph-ts'

import {
  NewLeague,
  Invited,
  JoinedLeague,
  LeftLeague,
  MemberRemoved,
  TransferAdminRole,
  Leagues as Contract,
} from '../../generated/Leagues/Leagues'

import { League, Member, Invitation, LeaderboardEntry, MemberPerformance } from '../../generated/schema'

// FIXME: get nft price and max supply from event params
export function handleNewLeague(event: NewLeague): void {
  let id = event.params.id.toHexString()
  let admin = event.params.admin.toHexString()
  let name = event.params.name
  let timestamp = event.block.timestamp
  let contractAddress = event.address

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
  let league = League.load(leagueId)

  if (league) {
    // Initialize member with leaderboard support
    initializeMemberInLeague(user, league.id)

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
  if (league) {
    let newMember = Member.load(newAdmin)
    if (newMember === null) {
      newMember = new Member(newAdmin)
      newMember.leagues = [league.id]
      newMember.save()
    } else {
      let newMemberLeagues = newMember.leagues
      if (newMemberLeagues) {
        if (newMemberLeagues.indexOf(league.id) === -1) {
          newMemberLeagues.push(league.id)
          newMember.leagues = newMemberLeagues
          newMember.save()
        }
      }
    }
    league.admin = newAdmin
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
          league.membersCount = league.membersCount.minus(BigInt.fromI32(1))
          league.save()
          member.save()
        }
        if (memberLeagues.length === 0) store.remove('Member', member.id)
      }
    }
  } else {
    log.error('Failed to remove member from league {}', [leagueId])
  }
}

// New leaderboard management functions
export function updateMemberPerformance(
  userId: string, 
  leagueId: string, 
  rewardPenalty: BigDecimal,
  isVePln: boolean,
  timestamp: BigInt
): void {
  let performanceId = userId + '-' + leagueId
  let performance = MemberPerformance.load(performanceId)
  
  if (performance == null) {
    performance = new MemberPerformance(performanceId)
    performance.member = userId
    performance.league = leagueId
    performance.plnStaked = BigDecimal.zero()
    performance.vePlnStaked = BigDecimal.zero()
    performance.rewardsEarned = BigDecimal.zero()
    performance.penaltiesIncurred = BigDecimal.zero()
    performance.portfolioValue = BigDecimal.zero()
    performance.performanceScore = BigDecimal.zero()
  }
  
  if (rewardPenalty.gt(BigDecimal.zero())) {
    performance.rewardsEarned = performance.rewardsEarned.plus(rewardPenalty)
  } else {
    performance.penaltiesIncurred = performance.penaltiesIncurred.plus(rewardPenalty.neg())
  }
  
  // Calculate performance score
  performance.performanceScore = performance.rewardsEarned.minus(performance.penaltiesIncurred)
  performance.lastUpdated = timestamp
  performance.save()
  
  // Update leaderboard
  updateMemberLeaderboardEntry(userId, leagueId, timestamp)
}

export function updateMemberLeaderboardEntry(
  userId: string, 
  leagueId: string, 
  timestamp: BigInt
): void {
  let performanceId = userId + '-' + leagueId
  let performance = MemberPerformance.load(performanceId)
  
  if (performance) {
    let entryId = leagueId + '-' + userId
    let entry = LeaderboardEntry.load(entryId)
    
    if (entry == null) {
      entry = new LeaderboardEntry(entryId)
      entry.league = leagueId
      entry.member = userId
      entry.rank = BigInt.zero()
    }
    
    entry.score = performance.performanceScore
    entry.totalRewards = performance.rewardsEarned
    entry.totalPenalties = performance.penaltiesIncurred
    entry.portfolioPerformance = performance.performanceScore
    entry.timestamp = timestamp
    entry.save()
    
    // Update member stats
    let member = Member.load(userId)
    if (member) {
      member.totalScore = performance.performanceScore
      member.save()
    }
  }
}

export function initializeMemberInLeague(userId: string, leagueId: string): void {
  let member = Member.load(userId)
  if (member == null) {
    member = new Member(userId)
    member.leagues = []
    member.totalScore = BigDecimal.zero()
    member.rank = BigInt.zero()
  }
  
  let memberLeagues = member.leagues
  memberLeagues.push(leagueId)
  member.leagues = memberLeagues
  member.save()
}
