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
    event.params.tokenType,
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
    event.params.tokenType,
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
  isVePln: boolean,
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
    if (isVePln) {
      withdrawal.rewardPenaltyVePln = rewardPenaltyDecimal
    } else {
      withdrawal.rewardPenaltyPln = rewardPenaltyDecimal
    }
    withdrawal.withdrawAmount = withdrawAmount
    withdrawal.portfolio = portfolioOwner.toHexString()
    withdrawal.timestamp = timestamp
    withdrawal.tokenType = isVePln ? 'vepln' : 'pln'
    let portfolio = VirtualPortfolio.load(owner)

    if (portfolio !== null) {
      log.info('Withdrawing from portfolio {}', [owner])
      if (isVePln && isPenalty) {
        portfolio.rewardsOrPenaltiesVePln = portfolio.rewardsOrPenaltiesVePln.plus(
          rewardPenaltyDecimal
        )
        delegateeStat.rewardsOrPenaltiesVePln = delegateeStat.rewardsOrPenaltiesVePln.plus(
          rewardPenaltyDecimal
        )
      } else {
        delegateeStat.rewardsOrPenaltiesPln = delegateeStat.rewardsOrPenaltiesPln.plus(
          rewardPenaltyDecimal
        )
        portfolio.rewardsOrPenaltiesPln = portfolio.rewardsOrPenaltiesPln.plus(
          rewardPenaltyDecimal
        )
      }

      portfolio.updatedTimestamp = timestamp
      if (isVePln) {
        portfolio.vePlnStake = portfolio.vePlnStake.minus(withdrawAmount)
      } else {
        portfolio.plnStake = portfolio.plnStake.minus(withdrawAmount)
      }
      if (portfolio.plnStake.isZero() && portfolio.vePlnStake.isZero()) {
        delegateeStat.portfolioOpen = false
      }
      portfolio.save()
    }
    log.info('Updating pnl stat {} {}', [
      rewardPenaltyDecimal.toString(),
      delegateeStat.rewardsOrPenaltiesPln.toString(),
    ])
    withdrawal.save()
    let stakeRemoved = withdrawAmount.toBigDecimal().neg()
    updatePollenatorOverviewStats(
      stakeRemoved,
      owner,
      rewardPenaltyDecimal,
      isVePln,
      timestamp
    )
  } else {
    // Delegator withdrawing thier delegation stake
    let id = user + '-delegate-withdraw-' + timestamp.toString()
    let withdrawal = new DelegateWithdrawal(id)
    withdrawal.withdrawAmount = withdrawAmount
    withdrawal.delegatee = owner
    withdrawal.delegator = user
    withdrawal.tokenType = isVePln ? 'vepln' : 'pln'

    if (isVePln && isPenalty) {
      withdrawal.delegatorRewardPenaltyVePln = rewardPenalty.toBigDecimal()
    } else {
      withdrawal.delegatorRewardPenaltyPln = rewardPenalty.toBigDecimal()
    }
    withdrawal.delegateFee = fee
    withdrawal.timestamp = timestamp
    if (isVePln) {
      delegatorStat.totalVePlnDelegatedTo = delegatorStat.totalVePlnDelegatedTo.minus(
        withdrawAmount
      )
    } else {
      delegatorStat.totalPlnDelegatedTo = delegatorStat.totalPlnDelegatedTo.minus(
        withdrawAmount
      )
    }
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
      if (isVePln) {
        delegation.vePlnAmount = delegation.vePlnAmount.minus(withdrawAmount)
        delegateeStat.totalVePlnDelegatedFrom = delegateeStat.totalVePlnDelegatedFrom.minus(
          withdrawAmount
        )
      } else {
        delegation.plnAmount = delegation.plnAmount.minus(withdrawAmount)
        delegateeStat.totalPlnDelegatedFrom = delegateeStat.totalPlnDelegatedFrom.minus(
          withdrawAmount
        )
      }
      if (isVePln && isPenalty) {
        delegation.rewardsOrPenaltiesVePln = delegation.rewardsOrPenaltiesVePln.plus(
          rewardPenaltyDecimal
        )
      } else {
        delegation.rewardsOrPenaltiesPln = delegation.rewardsOrPenaltiesPln.plus(
          rewardPenaltyDecimal
        )
      }

      delegation.updatedTimestamp = timestamp
      delegation.save()
      let bal = isVePln ? delegation.vePlnAmount : delegation.plnAmount
      if (withdrawAmount.equals(bal)) {
        delegateeStat.totalDelegators = delegateeStat.totalDelegators.minus(
          BigInt.fromString('1')
        )
      }

      delegateeStat.save()
    } else {
      log.info('Delegation not found {}', [delegationId])
    }
    withdrawal.save()
    let stakeRemoved = withdrawAmount.toBigDecimal().neg()
    updateDelegatorOverviewStats(
      stakeRemoved,
      user,
      rewardPenaltyDecimal,
      fee,
      timestamp,
      isVePln
    )
  }
  delegateeStat.updatedTimestamp = timestamp
  delegatorStat.updatedTimestamp = timestamp
  delegateeStat.save()
  delegatorStat.save()
}
