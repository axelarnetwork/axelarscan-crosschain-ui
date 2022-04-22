export const txRegEx = new RegExp(/^0x([A-Fa-f0-9]{64})$/, 'igm')
export const evmAddressRegEx = new RegExp(/^0x[a-fA-F0-9]{40}$/, 'igm')
export const ensRegEx = new RegExp(/[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)?/, 'igm')
export const axelarAddressRegEx = new RegExp(`${process.env.NEXT_PUBLIC_PREFIX_ACCOUNT}.*$`, 'igm')
const prefixLookup = {
  osmosis: 'osmo',
}
export const cosmosChainsAddressRegEx = Object.fromEntries((process.env.NEXT_PUBLIC_COSMOS_CHAINS?.split(',') || []).map(c => prefixLookup[c] || c).map(c => [c, new RegExp(`${c}.*$`, 'igm')]))
export const type = id => {
  return !id ? null : id.match(evmAddressRegEx) ? 'evm' : id.match(ensRegEx) ? 'ens' : id.match(axelarAddressRegEx) || Object.values(cosmosChainsAddressRegEx).findIndex(r => id.match(r)) > -1 ? 'address' : id.match(txRegEx) ? 'tx' : 'tx'
}