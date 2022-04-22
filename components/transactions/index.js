import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { useSelector, useDispatch, shallowEqual } from 'react-redux'

import _ from 'lodash'
import moment from 'moment'
import Web3 from 'web3'
import { utils } from 'ethers'
import { Img } from 'react-image'
import { Oval } from 'react-loader-spinner'
import { MdRefresh } from 'react-icons/md'

import Transactions from '../transactions/transactions'

import { linkedAddresses, crosschainTxs } from '../../lib/api/opensearch'
import { domains, getENS } from '../../lib/api/ens'
import { type } from '../../lib/object/id'
import { sleep } from '../../lib/utils'

import { ENS_DATA } from '../../reducers/types'

export default function TransactionsIndex() {
  const dispatch = useDispatch()
  const { preferences, chains, ens } = useSelector(state => ({ preferences: state.preferences, chains: state.chains, ens: state.ens }), shallowEqual)
  const { theme } = { ...preferences }
  const { chains_data } = { ...chains }
  const { ens_data } = { ...ens }

  const router = useRouter()
  const { query } = { ...router }
  const { confirm_deposit } = { ...query }

  const [web3, setWeb3] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [addTokenData, setAddTokenData] = useState(null)
  const [linkedAddressesData, setLinkedAddressesData] = useState(null)
  const [txsTrigger, setTxsTrigger] = useState(null)
  const [transactions, setTransactions] = useState(null)

  useEffect(() => {
    if (!web3) {
      setWeb3(new Web3(Web3.givenProvider))
    }
    else {
      try {
        web3.currentProvider._handleChainChanged = e => {
          try {
            setChainId(Web3.utils.hexToNumber(e?.chainId))
          } catch (error) {}
        }
      } catch (error) {}
    }
  }, [web3])

  useEffect(() => {
    if (addTokenData?.chain_id === chainId && addTokenData?.contract) {
      addTokenToMetaMask(addTokenData.chain_id, addTokenData.contract)
    }
  }, [chainId, addTokenData])

  useEffect(() => {
    const controller = new AbortController()

    const getData = async is_interval => {
      if (!controller.signal.aborted) {
        if (!is_interval && txsTrigger && typeof txsTrigger !== 'boolean') {
          setTransactions(null)

          if (transactions && transactions.data?.length < 1) {
            await sleep(0.5 * 1000)
          }
        }

        if (txsTrigger || typeof txsTrigger !== 'boolean') {
          const must = []

          if (confirm_deposit) {
            must.push({ match: { 'confirm_deposit.id': confirm_deposit } },)
          }

          const response = await crosschainTxs({
            query: {
              bool: {
                must,
              },
            },
            sort: [
              { 'send.created_at.ms': 'desc' },
            ],
            size: 500,
          })

          setTransactions({ data: response?.data || [], txsTrigger })
        }
      }
    }

    getData()

    const interval = setInterval(() => getData(true), 0.5 * 60 * 1000)
    return () => {
      controller?.abort()
      clearInterval(interval)
    }
  }, [confirm_deposit, txsTrigger])

  useEffect(async () => {
    if (transactions?.data?.length > 0) {
      const depositAddresses = _.uniq(transactions.data.map(t => t?.send?.recipient_address)).filter(a => a && !(linkedAddressesData?.data?.findIndex(l => l?.deposit_address?.toLowerCase() === a.toLowerCase()) > -1))

      if (depositAddresses.length > 0) {
        const should = depositAddresses.map(a => { return { match: { deposit_address: a } } })

        const response = await linkedAddresses({
          query: {
            bool: {
              should,
            },
          },
          sort: [
            { height: 'desc' },
          ],
          size: 1000,
        })

        if (response?.data?.length > 0) {
          response.data = _.orderBy(_.uniqBy(_.concat(linkedAddressesData?.data || [], response.data), 'txhash'), ['height'], ['desc'])

          setLinkedAddressesData(response)
          setTransactions({ ...transactions, txsTrigger: false })
          setTxsTrigger(false)

          const evmAddresses = _.slice(_.uniq(response?.data?.flatMap(l => [l?.sender_address, l?.recipient_address, l?.deposit_address].filter(a => type(a) === 'evm' && !ens_data?.[a?.toLowerCase()])) || []), 0, 250)
          if (evmAddresses.length > 0) {
            let ensData
            const addressChunk = _.chunk(evmAddresses, 50)

            for (let i = 0; i < addressChunk.length; i++) {
              const domainsResponse = await domains({ where: `{ resolvedAddress_in: [${addressChunk[i].map(id => `"${id?.toLowerCase()}"`).join(',')}] }` })
              ensData = _.concat(ensData || [], domainsResponse?.data || [])
            }

            if (ensData?.length > 0) {
              const ensResponses = {}
              for (let i = 0; i < evmAddresses.length; i++) {
                const evmAddress = evmAddresses[i]?.toLowerCase()
                const resolvedAddresses = ensData.filter(d => d?.resolvedAddress?.id?.toLowerCase() === evmAddress)
                if (resolvedAddresses.length > 1) {
                  ensResponses[evmAddress] = await getENS(evmAddress)
                }
                else if (resolvedAddresses.length < 1) {
                  ensData.push({ resolvedAddress: { id: evmAddress } })
                }
              }

              dispatch({
                type: ENS_DATA,
                value: Object.fromEntries(ensData.filter(d => !ensResponses?.[d?.resolvedAddress?.id?.toLowerCase()]?.reverseRecord || d?.name === ensResponses?.[d?.resolvedAddress?.id?.toLowerCase()].reverseRecord).map(d => [d?.resolvedAddress?.id?.toLowerCase(), { ...d }])),
              })
            }
          }
        }
      }
      else if (transactions?.txsTrigger) {
        setTransactions({ ...transactions, txsTrigger: false })
        setTxsTrigger(false)
      }
    }
    else if (transactions?.txsTrigger) {
      setTransactions({ ...transactions, txsTrigger: false })
      setTxsTrigger(false)
    }
  }, [transactions])

  const addTokenToMetaMask = async (chain_id, contract) => {
    if (web3 && contract) {
      if (chain_id === chainId) {
        try {
          const response = await web3.currentProvider.request({
            method: 'wallet_watchAsset',
            params: {
              type: 'ERC20',
              options: {
                address: contract.contract_address,
                symbol: contract.symbol,
                decimals: contract.contract_decimals,
                image: `${contract.image?.startsWith('/') ? process.env.NEXT_PUBLIC_SITE_URL : ''}${contract.image}`,
              },
            },
          })
        } catch (error) {}

        setAddTokenData(null)
      }
      else {
        switchNetwork(chain_id, contract)
      }
    }
  }

  const switchNetwork = async (chain_id, contract) => {
    try {
      await web3.currentProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: utils.hexValue(chain_id) }],
      })
    } catch (error) {
      if (error.code === 4902) {
        try {
          await web3.currentProvider.request({
            method: 'wallet_addEthereumChain',
            params: chains_data?.find(c => c.chain_id === chain_id)?.provider_params,
          })
        } catch (error) {}
      }
    }

    if (contract) {
      setAddTokenData({ chain_id, contract })
    }
  }

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

  const fetching = transactions?.txsTrigger

  return (
    <div className="max-w-8xl min-h-screen mx-auto">
      <div className="flex items-center justify-between mt-3 mb-4 mx-2.5">
        <span className="uppercase text-lg font-semibold">Transactions</span>
        <div className="flex items-center space-x-1 -mr-2.5">
          <button
            disabled={fetching}
            onClick={() => setTxsTrigger(moment().valueOf())}
            className={`${fetching ? 'cursor-not-allowed text-gray-400 dark:text-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'} rounded-xl flex items-center font-medium space-x-1.5 py-1 px-3`}
          >
            {!fetching ?
              <MdRefresh size={16} />
              :
              <Oval color={theme === 'dark' ? '#F9FAFB' : '#3B82F6'} width="16" height="16" />
            }
            <span>{!fetching ? 'Refresh' : 'Fetching'}</span>
          </button>
        </div>
      </div>
      <Transactions
        page_size={100}
        data={transactions?.data}
        linkedAddresses={linkedAddressesData?.data}
        addTokenToMetaMask={addTokenToMetaMask}
        className="no-border"
      />
    </div>
  )
}