import { Address, BigInt, log } from '@graphprotocol/graph-ts'
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

import { getOrCreateUserStat } from '../utils/UserStat'

export function handleWithdrawWithPenalty(event: WithdrawWithPenalty): void {
  let owner = event.params.portfolio.toHexString()
  let user = event.params.user.toHexString()
  handleWithdraw(
    owner,
    user,
    event.params.amount,
    event.params.penalty,
    event.params.delegateFee,
    event.params.portfolio,
    event.block.timestamp,
    true
  )
}

export function handleWithdrawWithReward(event: WithdrawWithReward): void {
  let owner = event.params.portfolio.toHexString()
  let user = event.params.user.toHexString()
  handleWithdraw(
    owner,
    user,
    event.params.amount,
    event.params.reward,
    event.params.delegateFee,
    event.params.portfolio,
    event.block.timestamp,
    false
  )
}

function handleWithdraw(
  owner: string,
  user: string,
  withdrawAmount: BigInt,
  rewardPenalty: BigInt,
  fee: BigInt,
  portfolioOwner: Address,
  timestamp: BigInt,
  isPenalty: boolean
): void {
  log.info('Withdrawing stake {} {}', [user, owner, withdrawAmount.toString()])
  let rewardPenaltyDecimal = isPenalty
    ? rewardPenalty.toBigDecimal().neg()
    : rewardPenalty.toBigDecimal()

  let delegateeStat = getOrCreateUserStat(owner)
  let delegatorStat = getOrCreateUserStat(user)

  if (user == owner) {
    // User withdrawing thier own portfolio stake
    let id = owner + '-portfolio-withdraw-' + timestamp.toString()
    let withdrawal = new PortfolioStakeWithdrawal(id)
    withdrawal.rewardPenalty = rewardPenaltyDecimal
    withdrawal.withdrawAmount = withdrawAmount
    withdrawal.portfolio = portfolioOwner.toHexString()
    withdrawal.timestamp = timestamp
    let portfolio = VirtualPortfolio.load(owner)

    if (portfolio !== null) {
      log.info('Withdrawing from portfolio {}', [owner])
      portfolio.rewardsOrPenalties = portfolio.rewardsOrPenalties.plus(
        rewardPenaltyDecimal
      )
      portfolio.updatedTimestamp = timestamp
      portfolio.pollenStake = portfolio.pollenStake.minus(withdrawAmount)
      portfolio.save()
    }
    delegateeStat.portfolioStake = delegateeStat.portfolioStake.minus(withdrawAmount)
    delegateeStat.pollenPnl = delegateeStat.pollenPnl.plus(rewardPenaltyDecimal)
    log.info('Updating pnl stat {} {}', [
      rewardPenaltyDecimal.toString(),
      delegateeStat.pollenPnl.toString(),
    ])
    withdrawal.save()
    let stakeRemoved = withdrawAmount.toBigDecimal().neg()
    updatePollenatorOverviewStats(stakeRemoved, owner, rewardPenaltyDecimal, timestamp)
  } else {
    // Delegator withdrawing thier delegation stake
    let id = user + '-delegate-withdraw-' + timestamp.toString()
    let withdrawal = new DelegateWithdrawal(id)
    withdrawal.withdrawAmount = withdrawAmount
    withdrawal.delegatee = owner
    withdrawal.delegator = user
    withdrawal.delegatorRewardPenalty = rewardPenalty.toBigDecimal()
    withdrawal.delegateFee = fee
    withdrawal.timestamp = timestamp
    delegatorStat.totalDelegatedTo = delegatorStat.totalDelegatedTo.minus(withdrawAmount)
    delegatorStat.totalDelegationFeesPaid = delegatorStat.totalDelegationFeesPaid.plus(
      fee
    )
    delegateeStat.totalDelegationFeesEarned = delegatorStat.totalDelegationFeesEarned.plus(
      fee
    )
    delegateeStat.totalRewardsForDelegators = delegateeStat.totalRewardsForDelegators.plus(
      rewardPenaltyDecimal
    )

    let delegationId = user + '-' + owner
    let delegation = Delegation.load(delegationId)
    if (delegation) {
      log.info('Removing amount from delegation {}', [delegationId])
      delegation.amount = delegation.amount.minus(withdrawAmount)
      delegation.rewardsOrPenalties = delegation.rewardsOrPenalties.plus(
        rewardPenaltyDecimal
      )
      delegation.updatedTimestamp = timestamp
      delegation.save()
      if (withdrawAmount.equals(delegation.amount)) {
        delegateeStat.totalDelegators = delegateeStat.totalDelegators.minus(
          BigInt.fromString('1')
        )
      }
      delegateeStat.totalDelegatedFrom = delegateeStat.totalDelegatedFrom.minus(
        withdrawAmount
      )
      delegateeStat.save()
    } else {
      log.info('Delegation not found {}', [delegationId])
    }
    withdrawal.save()
    let stakeRemoved = withdrawAmount.toBigDecimal().neg()
    updateDelegatorOverviewStats(stakeRemoved, user, rewardPenaltyDecimal, fee, timestamp)
  }
  delegateeStat.updatedTimestamp = timestamp
  delegatorStat.updatedTimestamp = timestamp
  delegateeStat.save()
  delegatorStat.save()
}
