import { block } from '../cosmos'
import { getRequestUrl } from '../../utils'

const _module = 'rpc'

const request = async (path, params) => {
  const res = await fetch(getRequestUrl(process.env.NEXT_PUBLIC_API_URL, path, { ...params, module: _module }))
    .catch(error => { return null })
  return res && await res.json()
}

export const status = async params => {
  const path = '/status'
  const response =  await request(path, params)
  if (response && Number(response?.earliest_block_height) > 0) {
    const block_variance = 1, block_avg_time_variance = 100
    let earliest_block_height = Number(response.earliest_block_height)
    earliest_block_height = earliest_block_height + (earliest_block_height + block_variance < Number(response.latest_block_height) ? block_variance : 0)
    const resBlock = await block(earliest_block_height)
    if (resBlock?.data?.time) {
      response.earliest_block_height_for_cal = earliest_block_height
      response.earliest_block_time = resBlock.data.time
      response.chain_id = resBlock.data.chain_id
    }
  }
  return response
}
