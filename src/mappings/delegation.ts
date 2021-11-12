import {
    Delegated
} from '../../generated/Delegation/Delegation'

import { Delegation } from '../../generated/schema'

import { getOrCreateUser, getOrCreateUserStat } from '../utils/User'

export function handleDelegated(event: Delegated): void {

    let id = event.transaction.hash.toHexString()
    let delegation = new Delegation(id)

    delegation.delegator = event.params.delegator.toHexString()
    delegation.delegatee = event.params.delegatee.toHexString()
    delegation.amount = event.params.amount
    delegation.save()

    let userDelegator = getOrCreateUser(delegation.delegator)
    let userStatsDelegator = getOrCreateUserStat(userDelegator.id)
    userStatsDelegator.totalDelegatedTo = userStatsDelegator.totalDelegatedTo.plus(delegation.amount)
    userStatsDelegator.save()
    userDelegator.stats = userStatsDelegator.id
    userDelegator.save()

    let userDelegatee = getOrCreateUser(delegation.delegatee)
    let userStatsDelegatee = getOrCreateUserStat(userDelegatee.id)
    userStatsDelegatee.totalDelegatedFrom = userStatsDelegatee.totalDelegatedFrom.plus(delegation.amount)
    userStatsDelegatee.save()
    userDelegatee.stats = userDelegatee.id
    userDelegatee.save()
}