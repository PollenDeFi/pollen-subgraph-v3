import { log } from '@graphprotocol/graph-ts'

import {
  ModuleAdded,
  ModuleUpdated,
  PollenTokenSet
} from '../../generated/Module/PollenDAO'

import { Module } from '../../generated/schema'

export function handleModuleAdded(event: ModuleAdded): void {

  let id = event.params.moduleAddr.toHexString()
  let module = new Module(id)

  module.name = event.params.moduleName.toString()
  module.lastUpdated = event.block.timestamp

  module.save()
}

export function handleModuleUpdated(event: ModuleUpdated): void {

  let module = Module.load(event.params.oldModuleAddr.toHexString())!

  module.id = event.params.newModuleAddr.toHexString()
  module.lastUpdated = event.block.timestamp

  module.save()
}

export function handlePollenTokenSet(event: PollenTokenSet): void {
  log.debug("POLLEN TOKEN SET {}", [event.params.pollenTokenAddr.toHexString()])
}