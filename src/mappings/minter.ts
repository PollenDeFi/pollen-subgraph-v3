import { BigInt } from '@graphprotocol/graph-ts'
import { WithdrawWithPenalty, WithdrawWithReward } from '../../generated/Minter/Minter'

import {
  DelegateWithdrawal,
  PortfolioStakeWithdrawal,
  VirtualPortfolio,
  Delegation,
} from '../../generated/schema'
import {
  updateDelegatorOverviewStats,
  updatePollenatorOverviewStats,
} from '../utils/OverviewStats'

import { getOrCreateUserStat } from '../utils/User'

export function handleWithdrawWithPenalty(event: WithdrawWithPenalty): void {
  let owner = event.params.portfolio.toString()
  let user = event.params.user.toString()
  handleWithdraw(
    owner,
    user,
    event.params.penalty,
    event.params.delegateFee,
    event.params.deposited,
    event.block.timestamp,
    true
  )
}

export function handleWithdrawWithReward(event: WithdrawWithReward): void {
  let owner = event.params.portfolio.toString()
  let user = event.params.user.toString()
  handleWithdraw(
    owner,
    user,
    event.params.reward,
    event.params.delegateFee,
    event.params.deposited,
    event.block.timestamp,
    false
  )
}

function handleWithdraw(
  owner: string,
  user: string,
  rewardPenalty: BigInt,
  fee: BigInt,
  deposited: BigInt,
  timestamp: BigInt,
  isPenalty: boolean
): void {
  let rewardPenaltyDecimal = isPenalty
    ? rewardPenalty.toBigDecimal().neg()
    : rewardPenalty.toBigDecimal()

  if (user === owner) {
    // User withdrawing thier own portfolio stake
    let id = owner + '-portfolio-withdraw-' + timestamp.toString()
    let withdrawal = new PortfolioStakeWithdrawal(id)
    withdrawal.rewardPenalty = rewardPenaltyDecimal

    withdrawal.deposited = deposited
    withdrawal.timestamp = timestamp
    let portfolio = VirtualPortfolio.load(owner)
    if (portfolio) {
      // TODO: Handle partial withdraw when contract updated
      portfolio.pollenStake = BigInt.zero()
      portfolio.save()
    }
    withdrawal.save()
    let stakeRemoved = deposited.toBigDecimal().neg()
    updatePollenatorOverviewStats(stakeRemoved, owner, rewardPenaltyDecimal, timestamp)
  } else {
    // Delegator withdrawing thier delegation stake
    let id = user + '-delegate-withdraw-' + timestamp.toString()
    let withdrawal = new DelegateWithdrawal(id)
    withdrawal.deposited = deposited
    withdrawal.delegatee = owner
    withdrawal.delegator = user
    withdrawal.delegatorRewardPenalty = rewardPenalty.toBigDecimal()
    withdrawal.delegateFee = fee
    withdrawal.timestamp = timestamp
    let delegatorStat = getOrCreateUserStat(user)
    delegatorStat.totalDelegationFeesPaid = delegatorStat.totalDelegationFeesPaid.plus(
      fee
    )
    let delegateeStat = getOrCreateUserStat(owner)
    delegateeStat.totalDelegationFeesEarned = delegatorStat.totalDelegationFeesEarned.plus(
      fee
    )
    delegateeStat.pollenPnl = delegateeStat.pollenPnl.plus(rewardPenaltyDecimal)

    let delegationId = user + '-' + owner
    let delegation = Delegation.load(delegationId)
    if (delegation) {
      // TODO: Handle partial withdraw when contract updated
      delegation.amount = BigInt.zero()
      delegation.save()
    }
    delegateeStat.save()
    delegatorStat.save()
    withdrawal.save()
    let stakeRemoved = deposited.toBigDecimal().neg()
    updateDelegatorOverviewStats(stakeRemoved, user, rewardPenaltyDecimal, fee, timestamp)
  }
}
