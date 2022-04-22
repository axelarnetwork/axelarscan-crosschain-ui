import _ from 'lodash'

// import { getRequestUrl } from '../../utils'

const _module = 'index'

const request = async (path, params) => {
  // const res = await fetch(getRequestUrl(process.env.NEXT_PUBLIC_API_URL, path, { ...params, module: _module }))
  params = { ...params, path, module: _module }
  const res = await fetch(process.env.NEXT_PUBLIC_API_URL, {
    method: 'POST',
    body: JSON.stringify(params),
  }).catch(error => { return null })
  return res && await res.json()
}

export const linkedAddresses = async params => {
  const path = '/linked_addresses/_search'
  params = {
    size: 0,
    ...params,
    index: 'linked_addresses',
    method: 'search',
  }

  const response = await request(path, params)
  return response
}

export const crosschainTxs = async params => {
  const path = '/crosschain_txs/_search'
  params = {
    size: 0,
    ...params,
    index: 'crosschain_txs',
    method: 'search',
  }

  const response = await request(path, params)
  return response
}

export const evmVotes = async params => {
  const path = '/evm_votes/_search'
  params = {
    size: 0,
    ...params,
    index: 'evm_votes',
    method: 'search',
  }

  let response = await request(path, params)
  if (response?.aggs?.votes?.buckets) {
    response = {
      data: Object.fromEntries(response.aggs.votes.buckets.map(record => [record.key, record.doc_count])),
      total: response.total,
    }
  }
  return response
}

export const batches = async params => {
  const path = '/batches/_search'
  params = {
    size: 0,
    ...params,
    index: 'batches',
    method: 'search',
  }

  let response = await request(path, params)
  if (response?.data) {
    response = {
      data: response.data.map(d => {
        if (params.fields) {
          return fieldsToObj(d, ['signature'])
        }
        else {
          return d
        }
      }),
      total: response.total,
    }
    response.data = response.data.map(d => {
      return {
        ...d,
        created_at: Object.fromEntries(Object.entries(d?.created_at?.[0] || {}).map(([key, value]) => [key, Number(value)])),
      }
    })
  }
  return response
}

export const searchAxelard = async params => {
  const path = '/axelard/_search'
  params = {
    ...params,
    index: 'axelard',
    method: 'search',
  }

  const response = await request(path, params)
  return response
}

const fieldsToObj = (fields_data, array_fields) => {
  const obj = {}
  const fields = Object.keys(fields_data).filter(field => field && !field.endsWith('.keyword'))
  
  fields.filter(field => !field.includes('.')).forEach(field => {
    const value = fields_data[field]
    obj[field] = array_fields.includes(field) ? value : _.head(value)
  })

  const nested_fields = fields.filter(field => field.includes('.'))
  const csv = [nested_fields.join(',')]

  for (let i = 0; i < fields_data[_.head(nested_fields)]?.length; i++) {
    const data = []
    nested_fields.forEach(field => {
      const value = fields_data[field][i]
      data.push(value)
    })
    csv.push(data.join(','))
  }

  const json = csvToJson(csv)
  const nested_obj_fields = Object.keys(_.head(json) || {})
  const _obj = Object.fromEntries(nested_obj_fields.map(field => [field, json.map(data => data[field])]))
  return mergeObj(obj, _obj)
}

const csvToJson = csv => {
  const construct = (key, parent, value) => {
    if (key?.split('.').length === 1) {
      parent[key] = value
      return parent
    }

    const _key = key.split('.')[0]
    if (!parent[_key]) {
      parent[_key] = {}
    }
    if (key.split('.').length > 0) {
      parent[_key] = construct(key.split('.').slice(1).join('.'), parent[_key], value)
    }
    return parent
  }

  const attrs = _.head(csv?.splice(0, 1) || [])?.split(',')
  const json = csv?.map(row => {
    var obj = {}
    var values = row.split(',')
    attrs?.forEach((value, i) => {
      obj = construct(value, obj, values[i])
    })
    return obj
  })
  return json
}

const mergeObj = (a, b) => {
  Object.entries(b || {}).forEach(([key, value]) => {
    a[key] = value
  })
  return a
}