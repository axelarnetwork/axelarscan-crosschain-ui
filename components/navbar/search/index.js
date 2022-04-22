import { useRouter } from 'next/router'
import { useState, useRef } from 'react'
import { useSelector, useDispatch, shallowEqual } from 'react-redux'

import { useForm } from 'react-hook-form'
import { FiSearch } from 'react-icons/fi'

import { linkedAddresses, crosschainTxs, batches } from '../../../lib/api/opensearch'
import { domains, getENS } from '../../../lib/api/ens'
import { type } from '../../../lib/object/id'

import { ENS_DATA } from '../../../reducers/types'

export default function Search() {
  const dispatch = useDispatch()
  const { ens } = useSelector(state => ({ ens: state.ens }), shallowEqual)
  const { ens_data } = { ...ens }

  const router = useRouter()
  const { pathname } = { ...router }

  const [inputSearch, setInputSearch] = useState('')

  const inputSearchRef = useRef()

  const { handleSubmit } = useForm()

  const getDomain = async address => {
    if (address && !ens_data?.[address.toLowerCase()]) {
      const response = await domains({ where: `{ resolvedAddress_in: ["${address.toLowerCase()}"] }` })
      if (response?.data) {
        let ensResponse
        if (response.data.length > 1) {
          ensResponse = await getENS(address)
        }
        dispatch({
          type: ENS_DATA,
          value: Object.fromEntries(response.data.filter(d => !ensResponse?.reverseRecord || d?.name === ensResponse.reverseRecord).map(d => [d?.resolvedAddress?.id?.toLowerCase(), { ...d }])),
        })
      }
    }
  }

  const getAddressFromENS = async ens => {
    let domain
    if (ens) {
      domain = ens_data && Object.values(ens_data).find(d => d?.name?.toLowerCase() === ens?.toLowerCase())
      if (!domain) {
        const response = await domains({ where: `{ name_in: ["${ens.toLowerCase()}"] }` })
        if (response?.data) {
          dispatch({
            type: ENS_DATA,
            value: Object.fromEntries(response.data.map(d => [d?.resolvedAddress?.id?.toLowerCase(), { ...d }])),
          })
          domain = response.data?.find(d => d?.name?.toLowerCase() === ens?.toLowerCase())
        }
      }
    }
    return domain
  }

  const onSubmit = async () => {
    if (type(inputSearch)) {
      let _inputSearch = inputSearch
      let _type = type(_inputSearch)

      if (_type === 'ens') {
        const domain = await getAddressFromENS(_inputSearch)
        if (domain?.resolvedAddress?.id) {
          _inputSearch = domain.resolvedAddress.id
          _type = 'evm'
        }
      }

      if (_type === 'evm') {
        getDomain(_inputSearch)
        const response = await linkedAddresses({
          query: {
            bool: {
              should: [
                { match: { sender_address: _inputSearch } },
                { match: { deposit_address: _inputSearch } },
                { match: { recipient_address: _inputSearch } },
              ],
            },
          },
          size: 1,
        })
        _inputSearch = response?.data?.[0] ? _inputSearch : inputSearch
        _type = 'account'
      }
      else if (_type === 'address') {
        const response = await linkedAddresses({
          query: {
            bool: {
              should: [
                { match: { sender_address: _inputSearch } },
                { match: { deposit_address: _inputSearch } },
                { match: { recipient_address: _inputSearch } },
              ],
            },
          },
          size: 1,
        })
        _inputSearch = response?.data?.[0] ? _inputSearch : inputSearch
        _type = 'account'
      }
      else {
        let response = await crosschainTxs({
          query: {
            bool: {
              should: [
                { match: { 'send.id': _inputSearch } },
                { match: { 'confirm_deposit.id': _inputSearch } },
                { match: { 'vote_confirm_deposit.id': _inputSearch } },
              ],
            },
          },
          size: 10,
        })

        if (response?.data?.length > 0) {
          if (response.data.length === 1) {
            _inputSearch = response.data[0].send?.id || _inputSearch
            _type = 'tx'
          }
          else {
            _inputSearch = `?confirm_deposit=${_inputSearch}`
            _type = 'transactions'
          }
        }
        else {
          response = await batches({
            query: {
              match: { 'batch_id': _inputSearch },
            },
            size: 1,
          })

          if (response?.data?.[0]) {
            _inputSearch = `${response.data[0].chain}/${response.data[0].batch_id}`
            _type = 'batch'
          }
          else {
            response = await batches({
              query: {
                term: { 'command_ids': _inputSearch },
              },
              size: 100,
            })

            if (response?.data?.length > 0) {
              if (response.data.length === 1) {
                _inputSearch = `${response.data[0].chain}/${response.data[0].batch_id}`
              }
              else {
                _inputSearch = `?command_id=${_inputSearch}`
              }
              _type = 'batch'
            }
          }
        }
      }

      router.push(`/${_type}/${_inputSearch}`)
      setInputSearch('')
      inputSearchRef?.current?.blur()
    }
  }

  const onNavbar = !['/'].includes(pathname)

  return (
    <div className={`navbar-search mr-1.5 sm:mx-${!onNavbar ? 1.5 : 3}`}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="relative">
          <input
            ref={inputSearchRef}
            value={inputSearch}
            onChange={event => setInputSearch(event.target.value?.trim())}
            type="search"
            placeholder={`Search ${!onNavbar ? 'by' : 'by'} TX / Addr / Batch / Command ID`}
            className={`${!onNavbar ? 'w-72 sm:w-80 xl:w-96 h-10 sm:h-12 text-xs sm:text-base pl-3 sm:pl-4 pr-2' : 'w-48 sm:w-72 xl:w-80 h-8 sm:h-10 text-2xs sm:text-xs pl-2 sm:pl-8 pr-0 sm:pr-2'} bg-white dark:bg-gray-900 border-gray-200 dark:border-black appearance-none rounded-lg focus:outline-none`}
          />
          {onNavbar && (
            <div className="hidden sm:block absolute top-0 left-0 mt-3 ml-2.5">
              <FiSearch size={14} className="stroke-current" />
            </div>
          )}
        </div>
      </form>
    </div>
  )
}