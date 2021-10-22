[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

# Pollen Subgraph V3

A graphql based data layer for querying the Pollen DAO.

URL: _Coming soon_

### Setup

`$ npm install`

### Development

- Run the `npm run prepare:[network]` to prepare yaml file from template.yaml and network specific data.
- Run the `npm run codegen` command to prepare the TypeScript sources for the GraphQL (generated/schema) and the ABIs (generated/[ABI]/\*)
- [Optional] run the `npm run build` command to build the subgraph. Can be used to check compile errors before deploying.

### Deploy

- Run `graph auth https://api.thegraph.com/deploy/ <ACCESS_TOKEN>`
- Deploy via `npm run deploy`.

### Docs

Visit [The Graph](https://thegraph.com/docs) docs for more info.
