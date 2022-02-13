import { BigInt } from '@graphprotocol/graph-ts'
import { WithdrawWithPenalty, WithdrawWithReward } from '../../generated/Minter/Minter'

import {
  DelegateWithdrawal,
  PortfolioStakeWithdrawal,
  VirtualPortfolio,
  Delegation,
} from '../../generated/schema'

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
  if (user === owner) {
    // User withdrawing thier own portfolio stake
    let id = owner + '-portfolio-withdraw-' + timestamp.toString()
    let withdrawal = new PortfolioStakeWithdrawal(id)
    if (isPenalty) {
      withdrawal.rewardPenalty = rewardPenalty.toBigDecimal().neg()
    } else {
      withdrawal.rewardPenalty = rewardPenalty.toBigDecimal()
    }
    withdrawal.deposited = deposited
    withdrawal.timestamp = timestamp
    let portfolio = VirtualPortfolio.load(owner)
    if (portfolio) {
      portfolio.pollenStake = BigInt.zero()
      portfolio.save()
    }
    withdrawal.save()
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
    let delegationId = user + '-' + owner
    let delegation = Delegation.load(delegationId)
    if (delegation) {
      // TODO: Once partial withdraws are in place we'll
      // need to adjust the amount down instead of to zero
      delegation.amount = BigInt.zero()
      delegation.save()
    }
    delegatorStat.save()
    withdrawal.save()
  }
}
