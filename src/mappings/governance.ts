import { log, BigInt, Value, BigDecimal } from '@graphprotocol/graph-ts'
import { VOTING_TERMS_ID } from '../utils/constants'

import {
  NewProposal,
  QuorumChanged,
  TimeLockChanged,
  VotingPeriodChanged,
  Voted,
} from '../../generated/Governance/Governance'

import { Proposal, VotingTerm, Voter } from '../../generated/schema'

export function handleNewProposal(event: NewProposal): void {
  let id = event.params.id.toHexString()
  let submitter = event.params.submitter.toHexString()
  let executer = event.params.executer.toHexString()
  let timestamp = event.block.timestamp

  let proposal = new Proposal(id)
  proposal.submitter = submitter
  proposal.executer = executer
  proposal.timestamp = timestamp
  proposal.yes = BigDecimal.zero()
  proposal.no = BigDecimal.zero()

  proposal.save()

  log.info('New proposal {} {} {}', [id, submitter, executer])
}

export function handleVoted(event: Voted): void {
  let voterId = event.params.voter.toHexString()
  let proposalId = event.params.proposalId.toHexString()
  let voteType = event.params.vote ? 'yes' : 'no'
  let amount = event.params.amount.toBigDecimal()

  let proposal = Proposal.load(proposalId)
  let voter = Voter.load(voterId)

  if (proposal) {
    if (voteType === 'yes') proposal.yes = proposal.yes.plus(amount)
    if (voteType === 'no') proposal.no = proposal.no.plus(amount)

    if (voter) {
      let newProposals = voter.proposals
      newProposals.push(proposalId)
      voter.proposals = newProposals
    } else {
      voter = new Voter(voterId)
      voter.proposals = [proposalId]
    }

    proposal.save()
    voter.save()
  } else {
    log.error('No proposal found {}, voter: {}', [proposalId, voterId])
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
