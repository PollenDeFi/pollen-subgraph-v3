/* eslint-disable prefer-const */
import { BigInt, BigDecimal, Address } from '@graphprotocol/graph-ts'

export const ZERO_ADDRESS = Address.fromString(
  '0x0000000000000000000000000000000000000000'
)
export const ZERO_ADDRESS_STRING = '0x0000000000000000000000000000000000000000'

export let ZERO_BI = BigInt.fromI32(0)
export let ONE_BI = BigInt.fromI32(1)
export let ZERO_BD = BigDecimal.fromString('0')
export let ONE_BD = BigDecimal.fromString('1')
export let BI_18 = BigInt.fromI32(18)

export let USER_OVERVIEW_STATS_ID = '1'
export let VOTING_TERMS_ID = '1'
