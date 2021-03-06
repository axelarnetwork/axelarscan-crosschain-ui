import { getRequestUrl } from '../../utils'

const _module = 'cli'

const request = async (path, params) => {
  const res = await fetch(getRequestUrl(process.env.NEXT_PUBLIC_API_URL, path, { ...params, module: _module }))
    .catch(error => { return null })
  return res && await res.json()
}

export const axelard = async params => await request(null, params)
