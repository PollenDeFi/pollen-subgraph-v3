import { log, store, Address, BigInt, BigDecimal } from '@graphprotocol/graph-ts'
import {
  LockCreated,
  LockIncreased,
  LockExtended,
  UnLocked,
  LockedPollen as Contract,
} from '../../generated/LockedPollen/LockedPollen'

import { LockedPollen } from '../../generated/schema'

export function handleLockCreated(event: LockCreated): void {
  let account = event.params.account.toHexString()
  let amount = event.params.amount
  let lockEndTime = event.params.lockEndTime

  let lock = LockedPollen.load(account)

  if (!lock) {
    lock = new LockedPollen(account)
  }

  lock.amount = amount
  lock.lockEndTime = lockEndTime
  lock.votingPower = getVotingPower(event.params.account, event.address)

  lock.save()
}

export function handleLockIncreased(event: LockIncreased): void {
  let account = event.params.account.toHexString()
  let amount = event.params.amount
  let lock = LockedPollen.load(account)

  if (lock) {
    lock.amount = lock.amount.plus(amount)
    lock.votingPower = getVotingPower(event.params.account, event.address)
    lock.save()
  } else {
    log.error('Failed to increase lock amount for: {}', [account])
  }
}

export function handleLockExtended(event: LockExtended): void {
  let account = event.params.account.toHexString()
  let lockEndTime = event.params.newLockEndTime
  let lock = LockedPollen.load(account)

  if (lock) {
    lock.lockEndTime = lockEndTime
    lock.votingPower = getVotingPower(event.params.account, event.address)
    lock.save()
  } else {
    log.error('Failed to increase lock end time for: {}', [account])
  }
}

export function handleUnlocked(event: UnLocked): void {
  let account = event.params.account.toHexString()
  let lock = LockedPollen.load(account)

  if (lock) {
    store.remove('LockedPollen', account)
  }
}

function getVotingPower(account: Address, vePlnAddress: Address): BigInt {
  let contract = Contract.bind(vePlnAddress)
  let votingpPower = contract.try_getVotingPower(account)
  return votingpPower.value
}
