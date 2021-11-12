import { log, dataSource } from '@graphprotocol/graph-ts'

import {
  ModuleAdded,
  ModuleUpdated,
  PollenTokenSet
} from '../../generated/Module/PollenDAO'

import { Module } from '../../generated/schema'

export function handleModuleAdded(event: ModuleAdded): void {

  let id = event.params.moduleName.toString()
  let module = new Module(id)

  module.address = event.params.moduleAddr.toHexString()
  module.lastUpdated = event.block.timestamp

  module.save()
}

export function handleModuleUpdated(event: ModuleUpdated): void {

}

export function handlePollenTokenSet(event: PollenTokenSet): void {
  log.debug("POLLEN TOKEN SET {}", [event.params.pollenTokenAddr.toHexString()])
}