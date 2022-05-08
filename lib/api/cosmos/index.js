import _ from 'lodash'
import moment from 'moment'

import { searchAxelard } from '../opensearch'
import { axelard } from '../executor'
import { tx_manager } from '../../object/tx'
import { base64ToHex, base64ToBech32 } from '../../object/key'
import { getRequestUrl, convertToJson } from '../../utils'

const _module = 'lcd'

const request = async (path, params) => {
  const res = await fetch(getRequestUrl(process.env.NEXT_PUBLIC_API_URL, path, { ...params, module: _module }))
    .catch(error => { return null })
  return res && await res.json()
}

export const block = async (height, params) => {
  const path = `/cosmos/base/tendermint/v1beta1/blocks/${height}`
  let response = await request(path, params)
  if (response?.block?.header) {
    response.block.header.hash = base64ToHex(response.block_id?.hash)
    response.block.header.proposer_address = base64ToBech32(response.block.header.proposer_address, process.env.NEXT_PUBLIC_PREFIX_CONSENSUS)
    response.block.header.txs = typeof response.block.data.txs?.length === 'number' ? response.block.data.txs.length : -1
    response = { data: response.block.header }
  }
  return response
}

export const validators = async params => {
  const path = '/cosmos/staking/v1beta1/validators'
  let response = await request(path, params)
  if (response?.validators) {
    response = { data: response.validators, pagination: response.pagination }
  }
  return response
}

export const allValidators = async (params, denoms) => {
  let pageKey = true, data = []
  while (pageKey) {
    const response = await validators({ ...params, 'pagination.key': pageKey && typeof pageKey === 'string' ? pageKey : undefined })
    data = _.orderBy(_.uniqBy(_.concat(data, response?.data || []), 'operator_address'), ['description.moniker'], ['asc'])
    pageKey = response?.pagination?.next_key
  }
  return await allValidatorsBroadcaster(data, denoms)
}

export const allValidatorsBroadcaster = async (validator_data, denoms) => {
  let response = await transactionsByEvents(`message.action='RegisterProxy'`, null, true, denoms), data = validator_data || []
  if (response?.data) {
    data = data.map(v => {
      const tx = response.data.find(_tx => _tx && !_tx.code && _tx.activities?.findIndex(a => a?.sender === v?.operator_address) > -1)
      return {
        ...v,
        start_proxy_height: (tx?.height && Number(tx.height)) || v?.start_proxy_height,
        broadcaster_address: tx?.activities?.find(a => a?.sender === v?.operator_address)?.address,
      }
    })
  }

  if (data) {
    const should_have_broadcaster_data = data.filter(v => !v.broadcaster_address)
    let broadcasters_data
    if (should_have_broadcaster_data.length > 1) {
      response = await searchAxelard({
        query: {
          bool: {
            must: [
              { match: { type: 'proxy' } },
              { range: { updated_at: { gte: moment().subtract(1, 'days').valueOf() / 1000 } } }
            ],
          },
        },
        size: 100,
      })
      broadcasters_data = response?.data?.map(b => {
        const broadcaster_address = convertToJson(b?.data?.stdout || b?.stdout)?.address
        return {
          operator_address: _.last(b?.id?.split(' ')),
          broadcaster_address,
        }
      })
    }
    for (let i = 0; i < should_have_broadcaster_data.length; i++) {
      const v = should_have_broadcaster_data[i]
      if (!v.broadcaster_address) {
        v.broadcaster_address = broadcasters_data?.find(b => b?.operator_address === v.operator_address)?.broadcaster_address
        if (!v.broadcaster_address) {
          response = await axelard({ cmd: `axelard q snapshot proxy ${v.operator_address}`, cache: true, cache_timeout: 5 })
          if (convertToJson(response?.stdout)) {
            v.broadcaster_address = convertToJson(response.stdout).address
          }
        }
      }
    }
  }
  return { data }
}

export const transactions = async (params, denoms) => {
  const path = '/cosmos/tx/v1beta1/txs'
  let response = await request(path, params)
  if (response?.tx_responses) {
    response.tx_responses = response.tx_responses.map(record => {
      const activities = tx_manager.activities(record, denoms)
      return {
        ...record,
        height: Number(record.height),
        status: tx_manager.status(record),
        type: tx_manager.type(record),
        fee: tx_manager.fee(record, denoms),
        symbol: tx_manager.symbol(record, denoms),
        gas_used: tx_manager.gas_used(record),
        gas_limit: tx_manager.gas_limit(record),
        memo: tx_manager.memo(record),
        activities,
      }
    })
    response = { data: response.tx_responses, pagination: response.pagination, total: response.pagination && Number(response.pagination.total) }
  }
  return response
}

export const transactionsByEvents = async (events, data, isUnlimit, denoms) => {
  const page_size = 50, max_size = 500
  let pageKey = true, total = 500, loop_count = 0, txs = [], first_load_txs
  while ((pageKey || total) && txs.length < total && (isUnlimit || txs.length < max_size) && (loop_count < Math.ceil((isUnlimit ? total : max_size) / page_size))) {
    const _pageKey = (isUnlimit || total <= max_size) && pageKey && typeof pageKey === 'string' ? pageKey : undefined
    const _offset = total + (total % page_size === 0 ? 0 : page_size - (total % page_size)) - txs.length
    const response = await transactions({
      events,
      'pagination.key': _pageKey,
      'pagination.limit': page_size,
      'pagination.offset': _pageKey ?
        undefined
        :
        txs.length > 0 && _offset >= page_size ?
          _offset > total ? total : _offset
          :
          txs.length,
    }, denoms)
    txs = _.uniqBy(_.concat(txs, response?.data || []), 'txhash')
    if (!first_load_txs) {
      first_load_txs = txs
    }
    pageKey = response?.pagination?.next_key
    total = response?.pagination && Number(response.pagination.total)
    loop_count++
  }
  if (total > max_size) {
    txs = txs.filter(tx => !first_load_txs || first_load_txs.findIndex(_tx => _tx?.txhash === tx?.txhash) < 0)
  }
  return { data: _.orderBy(_.uniqBy(_.concat(data || [], txs), 'txhash'), ['timestamp', 'height'], ['desc', 'desc']), total }
}

export const transferFee = async params => {
  const path = '/axelar/nexus/v1beta1/transfer_fee'
  const response = await request(path, params)
  return response
}