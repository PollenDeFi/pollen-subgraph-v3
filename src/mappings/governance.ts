import { log, BigInt, Value } from '@graphprotocol/graph-ts'
import { VOTING_TERMS_ID } from '../utils/constants'

import {
  NewProposal,
  QuorumChanged,
  TimeLockChanged,
  VotingPeriodChanged,
  Voted,
} from '../../generated/Governance/Governance'

import { Proposal, VotingTerm } from '../../generated/schema'

export function handleNewProposal(event: NewProposal): void {
  let id = event.params.id.toHexString()
  let submitter = event.params.submitter.toHexString()
  let executer = event.params.executer.toHexString()
  let timestamp = event.block.timestamp

  let proposal = new Proposal(id)
  proposal.submitter = submitter
  proposal.executer = executer
  proposal.timestamp = timestamp
  proposal.yes = BigInt.zero()
  proposal.no = BigInt.zero()

  proposal.save()

  log.info('New proposal {} {} {}', [id, submitter, executer])
}

export function handleVoted(event: Voted): void {
  let voter = event.params.voter.toHexString()
  let proposalId = event.params.proposalId.toHexString()
  let voteType = event.params.vote ? 'yes' : 'no'
  let amount = event.params.amount

  let proposal = Proposal.load(proposalId)

  if (proposal) {
    if (voteType === 'yes') proposal.yes = proposal.yes.plus(amount)
    if (voteType === 'no') proposal.no = proposal.no.plus(amount)

    proposal.save()
  } else {
    log.error('No proposal found {}, voter: {}', [proposalId, voter])
  }
}

export function handleVotingPeriodChanged(event: VotingPeriodChanged): void {
  let newVotingPeriod = event.params.newVotingPeriod
  updateTerms('period', newVotingPeriod)
}

export function handleQuorumChanged(event: QuorumChanged): void {
  let newQuorum = event.params.newQuorum
  updateTerms('quorum', newQuorum)
}

export function handleTimeLockChanged(event: TimeLockChanged): void {
  let newTimeLock = event.params.newTimeLock
  updateTerms('timelock', newTimeLock)
}

function updateTerms(term: string, value: BigInt): void {
  let terms = VotingTerm.load(VOTING_TERMS_ID)

  if (terms == null) {
    terms = new VotingTerm(VOTING_TERMS_ID)

    terms.quorum = BigInt.zero()
    terms.timelock = BigInt.zero()
    terms.period = BigInt.zero()
  }

  terms.set(term, Value.fromBigInt(value))
  terms.save()

  log.info('Voting term changed {}: {}', [term, value.toString()])
}
