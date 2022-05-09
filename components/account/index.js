import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { useSelector, useDispatch, shallowEqual } from 'react-redux'

import _ from 'lodash'
import moment from 'moment'
import Web3 from 'web3'
import { utils } from 'ethers'
import { Img } from 'react-image'
import { Oval, ThreeDots } from 'react-loader-spinner'
import StackGrid from 'react-stack-grid'
import { BsFileEarmarkCode } from 'react-icons/bs'
import { TiArrowRight } from 'react-icons/ti'
import { HiArrowNarrowRight, HiSparkles } from 'react-icons/hi'
import { IoWallet } from 'react-icons/io5'
import { AiFillFire } from 'react-icons/ai'
import { MdRefresh } from 'react-icons/md'

import Transactions from '../transactions/transactions'
import TransactionsFilter from '../transactions/filter'
import Search from '../navbar/search'
import Popover from '../popover'
import Copy from '../copy'
import Widget from '../widget'

import { linkedAddresses, crosschainTxs } from '../../lib/api/opensearch'
import { domains, getENS } from '../../lib/api/ens'
import { type, axelarAddressRegEx } from '../../lib/object/id'
import { numberFormat, ellipseAddress, getName, sleep } from '../../lib/utils'

import { ENS_DATA } from '../../reducers/types'

export default function Account() {
  const dispatch = useDispatch()
  const { preferences, chains, cosmos_chains, assets, ens } = useSelector(state => ({ preferences: state.preferences, chains: state.chains, cosmos_chains: state.cosmos_chains, assets: state.assets, ens: state.ens }), shallowEqual)
  const { theme } = { ...preferences }
  const { chains_data } = { ...chains }
  const { cosmos_chains_data } = { ...cosmos_chains }
  const { assets_data } = { ...assets }
  const { ens_data } = { ...ens }

  const router = useRouter()
  const { query } = { ...router }
  const { address } = { ...query }

  const [web3, setWeb3] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [addTokenData, setAddTokenData] = useState(null)
  const [timer, setTimer] = useState(null)
  const [linkedAddressesData, setLinkedAddressesData] = useState(null)
  const [txsTrigger, setTxsTrigger] = useState(null)
  const [txsFilter, setTxsFilter] = useState(null)
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
    const run = async () => setTimer(moment().unix())
    if (!timer) {
      run()
    }
    const interval = setInterval(() => run(), 15 * 1000)
    return () => clearInterval(interval)
  }, [timer])

  useEffect(() => {
    const controller = new AbortController()

    const getData = async is_interval => {
      if (address) {
        if (!controller.signal.aborted) {
          const resolvedAddress = await resolveAddress(address)

          if (resolvedAddress) {
            const response = await linkedAddresses({
              query: {
                bool: {
                  should: [
                    { match: { sender_address: resolvedAddress } },
                    { match: { deposit_address: resolvedAddress } },
                    { match: { recipient_address: resolvedAddress } },
                  ],
                },
              },
              sort: [
                { height: 'desc' },
              ],
              size: 100,
            })

            setLinkedAddressesData(response)
            setTxsTrigger(moment().valueOf())
            setTimer(moment().unix())

            if (!controller.signal.aborted && !is_interval) {
              const evmAddresses = _.uniq(response?.data?.flatMap(l => [l?.sender_address, l?.recipient_address, l?.deposit_address].filter(a => type(a) === 'evm' && !ens_data?.[a?.toLowerCase()])) || [])
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
        }
      }
    }

    getData()

    const interval = setInterval(() => getData(true), 3 * 60 * 1000)
    return () => {
      controller?.abort()
      clearInterval(interval)
    }
  }, [address])

  useEffect(() => {
    const controller = new AbortController()

    const getData = async is_interval => {
      if (cosmos_chains_data && linkedAddressesData) {
        if (!controller.signal.aborted) {
          if (!is_interval && txsTrigger && typeof txsTrigger !== 'boolean') {
            setTransactions(null)

            if (transactions && transactions.data?.length < 1) {
              await sleep(0.5 * 1000)
            }
          }

          if (txsTrigger || typeof txsTrigger !== 'boolean') {
            const must = []

            if (txsFilter) {
              if (txsFilter.tx_id) {
                must.push({
                  bool: {
                    should: ['send.id', 'confirm_deposit.id', 'vote_confirm_deposit.id', 'signed.batch_id'].map(f => {
                      return { match: { [`${f}`]: txsFilter.tx_id } }
                    }),
                    minimum_should_match: '25%',
                  },
                })
              }

              if (txsFilter.from_chain) {
                const bool = {}

                const should = [
                  { match: { 'send.sender_chain': txsFilter.from_chain } },
                  { match: { 'confirm_deposit.sender_chain': txsFilter.from_chain } },
                ]

                for (let i = 0; i < linkedAddressesData.data.length; i++) {
                  const linkedAddress = linkedAddressesData.data[i]

                  if (linkedAddress?.sender_chain === txsFilter.from_chain) {
                    if (linkedAddress.deposit_address) {
                      if (should.findIndex(s => s?.match?.['send.recipient_address'] === linkedAddress.deposit_address.toLowerCase()) < 0) {
                        should.push({ match: { 'send.recipient_address': linkedAddress.deposit_address.toLowerCase() } })
                      }
                    }
                  }
                }

                if (should.length < 1) {
                  bool.must = [{ match: { 'send.type': cosmos_chains_data.findIndex(c => c.id === txsFilter.from_chain) > -1 ? txsFilter.from_chain === axelarChain.id ? 'axelarnet_transfer' : 'ibc_transfer' : 'evm_transfer' } }]
                }
                else {
                  bool.should = should
                  bool.minimum_should_match = `${Math.floor(100 / (should.length || 1))}%`
                }

                must.push({
                  bool,
                })
              }

              if (txsFilter.to_chain) {
                const should = [
                  { match: { 'send.recipient_chain': txsFilter.to_chain } },
                  { match: { 'confirm_deposit.recipient_chain': txsFilter.to_chain } },
                ]

                for (let i = 0; i < linkedAddressesData.data.length; i++) {
                  const linkedAddress = linkedAddressesData.data[i]

                  if (linkedAddress?.recipient_chain === txsFilter.to_chain) {
                    if (linkedAddress.deposit_address) {
                      if (should.findIndex(s => s?.match?.['send.recipient_address'] === linkedAddress.deposit_address.toLowerCase()) < 0) {
                        should.push({ match: { 'send.recipient_address': linkedAddress.deposit_address.toLowerCase() } })
                      }
                    }
                  }
                }

                if (should.length > 0) {
                  must.push({
                    bool: {
                      should,
                      minimum_should_match: `${Math.floor(100 / (should.length || 1))}%`,
                    },
                  })
                }
              }

              if (txsFilter.denom) {
                const should = [{ match: { 'send.denom': txsFilter.denom } }]

                if (assets_data?.findIndex(a => a.id === txsFilter.denom && a.ibc) > -1) {
                  const ibc = assets_data.find(a => a.id === txsFilter.denom && a.ibc).ibc
                  if (Array.isArray(ibc)) {
                    for (let i = 0; i < ibc.length; i++) {
                      if (ibc[i]?.ibc_denom) {
                        should.push({ match: { 'send.denom': ibc[i].ibc_denom } })
                      }
                    }
                  }
                  else {
                    should.push({ match: { 'send.denom': ibc } })
                  }
                }

                if (should.length > 0) {
                  must.push({
                    bool: {
                      should,
                    },
                  })
                }
              }

              if (txsFilter.status) {
                if (txsFilter.status === 'unconfirmed') {
                  must.push({
                    bool: {
                      must: [
                        { match: { 'send.status_code': 0 } },
                      ],
                      must_not: [
                        { match: { 'confirm_deposit.status_code': 0 } },
                        { match: { 'vote_confirm_deposit.status_code': 0 } },
                      ],
                    },
                  })
                }
                else if (txsFilter.status === 'waiting_vote') {
                  must.push({
                    bool: {
                      must: [
                        { match: { 'send.type': 'evm_transfer' } },
                        { match: { 'confirm_deposit.status_code': 0 } },
                      ],
                      must_not: [
                        { match: { 'vote_confirm_deposit.status_code': 0 } },
                      ],
                    },
                  })
                }
                else if (txsFilter.status === 'waiting_batch') {
                  must.push({
                    bool: {
                      should: [
                        {
                          bool: {
                            must: [
                              { match: { 'send.type': 'axelarnet_transfer' } },
                              { match: { 'confirm_deposit.status_code': 0 } },
                            ],
                            must_not: [{ exists: { field: 'signed' } }],
                          },
                        },
                        {
                          bool: {
                            must: [
                              { match: { 'send.type': 'ibc_transfer' } },
                              { match: { 'confirm_deposit.status_code': 0 } },
                            ],
                            must_not: [{ exists: { field: 'signed' } }],
                          },
                        },
                      ],
                      minimum_should_match: '50%',
                    },
                  })
                }
                else if (txsFilter.status === 'waiting_gateway') {
                  must.push({
                    bool: {
                      should: [
                        {
                          bool: {
                            must: [
                              {
                                bool: {
                                  should: [
                                    { match: { 'send.type': 'axelarnet_transfer' } },
                                    { match: { 'send.type': 'ibc_transfer' } },
                                  ],
                                },
                              },
                              { exists: { field: 'signed' } },
                            ],
                            must_not: [{ exists: { field: 'send_gateway' } }],
                          },
                        },
                      ],
                      minimum_should_match: '50%',
                    },
                  })
                }
                else if (txsFilter.status === 'success') {
                  must.push({
                    bool: {
                      should: [
                        {
                          bool: {
                            must: [
                              { match: { 'send.type': 'axelarnet_transfer' } },
                              { exists: { field: 'send_gateway' } },
                            ],
                          },
                        },
                        {
                          bool: {
                            must: [
                              { match: { 'send.type': 'ibc_transfer' } },
                              { exists: { field: 'send_gateway' } },
                            ],
                          },
                        },
                        {
                          bool: {
                            must: [
                              { match: { 'send.type': 'evm_transfer' } },
                              { exists: { field: 'vote_confirm_deposit' } },
                            ],
                          },
                        },
                      ],
                      minimum_should_match: '33%',
                    },
                  })
                }
              }
            }

            const should = [
              { match: { 'send.sender_address': address.toLowerCase() } },
              { match: { 'send.recipient_address': address.toLowerCase() } }
            ]

            if (address?.match(axelarAddressRegEx)) {
              should.push({ match: { 'confirm_deposit.user': address.toLowerCase() } })
            }

            if (linkedAddressesData?.data) {
              for (let i = 0; i < linkedAddressesData.data.length; i++) {
                const linkedAddress = linkedAddressesData.data[i]

                if (linkedAddress) {
                  if (linkedAddress.sender_address) {
                    // if (should.findIndex(s => s?.match?.['send.sender_address'] === linkedAddress.sender_address.toLowerCase()) < 0) {
                    //   should.push({ match: { 'send.sender_address': linkedAddress.sender_address.toLowerCase() } })
                    // }

                    if (should.findIndex(s => s?.match?.['send.recipient_address'] === linkedAddress.sender_address.toLowerCase()) < 0) {
                      should.push({ match: { 'send.recipient_address': linkedAddress.sender_address.toLowerCase() } })
                    }
                  }

                  if (linkedAddress.recipient_address) {
                    if (should.findIndex(s => s?.match?.['send.recipient_address'] === linkedAddress.recipient_address.toLowerCase()) < 0) {
                      should.push({ match: { 'send.recipient_address': linkedAddress.recipient_address.toLowerCase() } })
                    }

                    // if (should.findIndex(s => s?.match?.['send.sender_address'] === linkedAddress.recipient_address.toLowerCase()) < 0) {
                    //   should.push({ match: { 'send.sender_address': linkedAddress.recipient_address.toLowerCase() } })
                    // }
                  }

                  if (linkedAddress.deposit_address) {
                    if (should.findIndex(s => s?.match?.['send.recipient_address'] === linkedAddress.deposit_address.toLowerCase()) < 0) {
                      should.push({ match: { 'send.recipient_address': linkedAddress.deposit_address.toLowerCase() } })
                    }
                  }
                }
              }
            }

            if (should.length > 0) {
              must.push({
                bool: {
                  should: _.slice(should, 0, 100),
                },
              })
            }

            const response = must.length > 0 && await crosschainTxs({
              query: {
                bool: {
                  must,
                },
              },
              sort: [
                { 'send.created_at.ms': 'desc' },
              ],
              size: 100,
            })

            setTransactions({ data: response?.data || [], txsTrigger })
          }
        }
      }
    }

    getData()

    const interval = setInterval(() => getData(true), 0.5 * 60 * 1000)
    return () => {
      controller?.abort()
      clearInterval(interval)
    }
  }, [txsTrigger, txsFilter])

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
          size: 100,
        })

        if (response?.data?.length > 0) {
          response.data = _.orderBy(_.uniqBy(_.concat(linkedAddressesData?.data || [], response.data), 'txhash'), ['height'], ['desc'])

          setLinkedAddressesData(response)
          if (response.data.length > linkedAddressesData?.data?.length) {
            setTxsTrigger(true)
          }
          else {
            setTransactions({ ...transactions, txsTrigger: false })
            setTxsTrigger(false)
          }
          setTimer(moment().unix())
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

  const resolveAddress = async _address => {
    if (type(_address)) {
      _address = _address?.toLowerCase()

      let __address = _address
      let _type = type(__address)

      if (_type === 'ens') {
        const domain = await getAddressFromENS(__address)
        if (domain?.resolvedAddress?.id) {
          __address = domain.resolvedAddress.id
          _type = 'evm'
        }
      }

      if (_type === 'evm') {
        getDomain(__address)
        const response = await linkedAddresses({
          query: {
            bool: {
              should: [
                { match: { sender_address: __address } },
                { match: { deposit_address: __address } },
                { match: { recipient_address: __address } },
              ],
            },
          },
          size: 1,
        })
        __address = response?.data?.[0] ? __address : _address
        _type = 'account'
      }
      else if (_type === 'address') {
        _type = 'account'
      }

      if (__address?.toLowerCase() !== _address?.toLowerCase()) {
        router.push(`/${_type}/${__address}`)
        return null
      }
      return __address
    }

    return null
  }

  const staging = process.env.NEXT_PUBLIC_SITE_URL?.includes('staging')

  const chainsComponent = chains_data?.map((chain, i) => (
    <Widget
      key={i}
      title={<div className="flex items-center space-x-2">
        <Img
          src={chain.image}
          alt=""
          className="w-6 h-6 rounded-full"
        />
        <span className="text-gray-900 dark:text-white font-semibold">{chain.title}</span>
      </div>}
      className="border-0 shadow-md rounded-2xl"
    >
      <div className="flex items-center text-gray-400 dark:text-gray-500 space-x-1.5 mt-2">
        <Popover
          placement="top"
          title={chain.title}
          content={<div className="w-56">{axelarChain?.short_name} Gateway contract address</div>}
        >
          <BsFileEarmarkCode size={16} className="mb-0.5" />
        </Popover>
        <div className="flex items-center space-x-1">
          {chain.gateway_address ?
            <>
              <Copy
                text={chain.gateway_address}
                copyTitle={<span className="text-xs font-normal">
                  {ellipseAddress(chain.gateway_address, 10)}
                </span>}
              />
              {chain.explorer?.url && (
                <a
                  href={`${chain.explorer.url}${chain.explorer.address_path?.replace('{address}', chain.gateway_address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-white"
                >
                  {chain.explorer.icon ?
                    <Img
                      src={chain.explorer.icon}
                      alt=""
                      className="w-4 h-4 rounded-full opacity-60 hover:opacity-100"
                    />
                    :
                    <TiArrowRight size={16} className="transform -rotate-45" />
                  }
                </a>
              )}
            </>
            :
            '-'
          }
        </div>
      </div>
      <div className="mt-4">
        <div className="uppercase text-xs font-semibold">Tokens</div>
        <div className="space-y-2 mt-2">
          {assets_data?.filter(a => (!a?.is_staging || staging) && a?.contracts?.find(c => c.chain_id === chain.chain_id)).map((a, j) => {
            const contract = a.contracts.find(c => c.chain_id === chain.chain_id)
            const addToMetaMaskButton = (
              <button
                onClick={() => addTokenToMetaMask(chain.chain_id, { ...a, ...contract })}
                className="w-auto bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg flex items-center justify-center py-1.5 px-2"
              >
                <Img
                  src="/logos/wallets/metamask.png"
                  alt=""
                  className="w-4 h-4"
                />
              </button>
            )

            return (
              <div key={j} className="flex items-start justify-between">
                <div className="flex items-start space-x-1.5">
                  <Img
                    src={a.image}
                    alt=""
                    className="w-6 h-6 rounded-full"
                  />
                  <div className="flex flex-col">
                    <span className="text-gray-600 dark:text-white font-medium">{contract.symbol || a.symbol}</span>
                    <div className="flex items-center space-x-1">
                      {contract.contract_address ?
                        <>
                          <Copy
                            text={contract.contract_address}
                            copyTitle={<span className="text-xs font-normal">
                              {ellipseAddress(contract.contract_address, 8)}
                            </span>}
                          />
                          {chain.explorer?.url && (
                            <a
                              href={`${chain.explorer.url}${chain.explorer.contract_path?.replace('{address}', contract.contract_address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-white"
                            >
                              {chain.explorer.icon ?
                                <Img
                                  src={chain.explorer.icon}
                                  alt=""
                                  className="w-3.5 h-3.5 rounded-full opacity-60 hover:opacity-100"
                                />
                                :
                                <TiArrowRight size={16} className="transform -rotate-45" />
                              }
                            </a>
                          )}
                        </>
                        :
                        '-'
                      }
                    </div>
                  </div>
                </div>
                <Popover
                  placement="left"
                  title={<span className="normal-case text-xs">Add token</span>}
                  content={<div className="w-36 text-xs">Add <span className="font-semibold">{contract.symbol || a.symbol}</span> to MetaMask</div>}
                  titleClassName="py-1"
                >
                  {addToMetaMaskButton}
                </Popover>
              </div>
            )
          })}
        </div>
      </div>
    </Widget>
  ))

  const linkedAddressesComponent = chains_data?.map((chain, i) => {
    const _linkedAddresses = linkedAddressesData?.data?.filter(l => [l?.sender_chain, l?.recipient_chain].includes(chain?.id))

    return (
      <Widget
        key={i}
        title={<div className="flex items-center space-x-2">
          <Img
            src={chain.image}
            alt=""
            className="w-6 h-6 rounded-full"
          />
          <span className="text-gray-900 dark:text-white font-semibold">{chain.title}</span>
        </div>}
        className="border-0 shadow-md rounded-2xl"
      >
        <div className="max-h-52 overflow-y-auto mt-2">
          <div className="space-y-2.5">
            {_linkedAddresses?.length > 0 ?
              _linkedAddresses.map((l, j) => {
                const fromChain = chains_data?.find(c => c.id === l?.sender_chain) || cosmos_chains_data?.find(c => c.id === l?.sender_chain)
                if (fromChain) {
                  fromChain.is_cosmos = cosmos_chains_data?.findIndex(c => c.id === fromChain.id) > -1
                }
                const toChain = chains_data?.find(c => c.id === l?.recipient_chain) || cosmos_chains_data?.find(c => c.id === l?.recipient_chain)
                if (toChain) {
                  toChain.is_cosmos = cosmos_chains_data?.findIndex(c => c.id === toChain.id) > -1
                }
                const _asset = assets_data?.find(a => [a?.id, a?.ibc].includes(l?.asset))

                return (
                  <div key={j} className="grid grid-flow-row grid-cols-3 items-start">
                    <div className="flex flex-col items-start space-y-0.5">
                      <Img
                        src={fromChain?.image}
                        alt=""
                        className="w-5 h-5 rounded-full"
                      />
                      <span className="leading-3 text-gray-500 dark:text-white text-3xs">{fromChain?.title}</span>
                    </div>
                    <div className="flex flex-col items-center space-y-0 mx-auto">
                      <div className="flex items-center space-x-1">
                        <HiArrowNarrowRight size={18} className={`text-${l?.type === axelarChain?.id ? 'green' : 'red'}-500`} />
                        {l?.deposit_address && (
                          <Popover
                            placement="left"
                            title="Deposit Address"
                            content={<div className="w-40 flex items-center space-x-1">
                              <Copy
                                text={l.deposit_address}
                                copyTitle={<span className="text-2xs font-normal">
                                  {ellipseAddress(ens_data?.[l.deposit_address]?.name || l.deposit_address, 8)}
                                </span>}
                              />
                              {fromChain?.explorer?.url && (
                                <a
                                  href={`${fromChain.explorer.url}${fromChain.explorer.address_path?.replace('{address}', l.deposit_address)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="min-w-max text-blue-600 dark:text-white"
                                >
                                  {fromChain.explorer.icon ?
                                    <Img
                                      src={fromChain.explorer.icon}
                                      alt=""
                                      className="w-4 h-4 rounded-full opacity-60 hover:opacity-100"
                                    />
                                    :
                                    <TiArrowRight size={16} className="transform -rotate-45" />
                                  }
                                </a>
                              )}
                            </div>}
                          >
                            {l?.type === axelarChain?.id ?
                              <HiSparkles size={16} className="text-green-400 hover:text-green-600" />
                              :
                              <AiFillFire size={16} className="text-red-400 hover:text-red-600" />
                            }
                          </Popover>
                        )}
                      </div>
                      <div className="flex items-center justify-center space-x-1">
                        <Img
                          src={_asset?.image}
                          alt=""
                          className="w-4 h-4 rounded-full"
                        />
                        <span className="leading-4 text-gray-600 dark:text-white text-2xs font-medium">{_asset?.symbol}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 ml-auto">
                      <Popover
                        placement="left"
                        title={`${toChain?.is_cosmos ? getName(l.recipient_chain) : 'EVM'} Address`}
                        content={<div className="w-40 flex items-center space-x-1">
                          <Copy
                            text={l.recipient_address}
                            copyTitle={<span className="text-2xs font-normal">
                              {ellipseAddress(ens_data?.[l.recipient_address]?.name || l.recipient_address, 8)}
                            </span>}
                          />
                          {toChain?.explorer?.url && (
                            <a
                              href={`${toChain.explorer.url}${toChain.explorer.address_path?.replace('{address}', l.recipient_address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="min-w-max text-blue-600 dark:text-white"
                            >
                              {toChain.explorer.icon ?
                                <Img
                                  src={toChain.explorer.icon}
                                  alt=""
                                  className="w-4 h-4 rounded-full opacity-60 hover:opacity-100"
                                />
                                :
                                <TiArrowRight size={16} className="transform -rotate-45" />
                              }
                            </a>
                          )}
                        </div>}
                      >
                        <IoWallet size={16} className="text-gray-400 hover:text-gray-500 dark:text-gray-200 dark:hover:text-white" />
                      </Popover>
                      <Img
                        src={toChain?.image}
                        alt=""
                        className="w-5 h-5 rounded-full"
                      />
                    </div>
                  </div>
                )
              })
              :
              linkedAddressesData ?
                <span className="italic text-gray-400 dark:text-gray-500 ml-1">No linked addresses</span>
                :
                <div className="flex justify-center">
                 <ThreeDots color={theme === 'dark' ? 'white' : '#D1D5DB'} width="32" height="32" />
                </div>
            }
          </div>
        </div>
      </Widget>
    )
  })

  const axelarChain = cosmos_chains_data?.find(c => c.id === 'axelarnet')
  const addressType = type(address)
  const addressChain = cosmos_chains_data?.find(c => address?.startsWith(c.prefix_address))
  const fetching = transactions?.txsTrigger

  return (
    <>
      <div className="my-6">
        <div className="flex flex-col sm:flex-row items-center justify-center space-x-4">
          <span className="text-lg font-semibold">
            {['ens', 'evm'].includes(addressType) ?
              `${addressType.toUpperCase()} Address`
              :
              address ?
                `${addressChain?.short_name || axelarChain?.short_name} Address`
                :
                'Search'
            }
            <span className="hidden sm:inline">:</span>
          </span>
          {!address ?
            <div className="mt-1 sm:mt-0">
              <Search />
            </div>
            :
            <div className="flex items-center space-x-1.5">
              <Copy
                size={20}
                text={address}
                copyTitle={<span className="uppercase text-gray-600 dark:text-gray-400 text-base sm:text-lg font-normal">
                  {ellipseAddress(ens_data?.[address]?.name || address, 16)}
                </span>}
              />
              {!['ens', 'evm'].includes(addressType) && (
                addressChain?.explorer?.url ?
                  <a
                    href={`${addressChain.explorer.url}${addressChain.explorer.address_path?.replace('{address}', address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-white"
                  >
                    {addressChain.explorer.icon ?
                      <Img
                        src={addressChain.explorer.icon}
                        alt=""
                        className="w-8 h-8 rounded-full opacity-60 hover:opacity-100"
                      />
                      :
                      <TiArrowRight size={20} className="transform -rotate-45" />
                    }
                  </a>
                  :
                  axelarChain?.explorer?.url && (
                    <a
                      href={`${axelarChain.explorer.url}${axelarChain.explorer.address_path?.replace('{address}', address)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-white"
                    >
                      {axelarChain.explorer.icon ?
                        <Img
                          src={axelarChain.explorer.icon}
                          alt=""
                          className="w-8 h-8 rounded-full opacity-60 hover:opacity-100"
                        />
                        :
                        <TiArrowRight size={20} className="transform -rotate-45" />
                      }
                    </a>
                  )
              )}
            </div>
          }
        </div>
      </div>
      {address && (
        <>
          {/*<div className="max-w-8xl mx-auto py-4">
            <div className="uppercase text-lg font-semibold mb-4 mx-2.5">Linked Addresses</div>
            <StackGrid
              columnWidth={264}
              gutterWidth={16}
              gutterHeight={16}
              className="hidden sm:block"
            >
              {linkedAddressesComponent}
            </StackGrid>
            <div className="block sm:hidden space-y-3">
              {linkedAddressesComponent}
            </div>
          </div>*/}
          <div className="max-w-8xl mx-auto">
            <div className="flex items-center justify-between mb-4 mx-2.5">
              <span className="uppercase text-lg font-semibold">Transactions</span>
              <div className="flex items-center space-x-1 -mr-2.5">
                <TransactionsFilter
                  applied={Object.values(txsFilter || {}).filter(_value => _value).length > 0}
                  disabled={!linkedAddressesData}
                  initialFilter={txsFilter}
                  updateFilter={_filter => {
                    setTxsFilter(_filter)
                    setTxsTrigger(moment().valueOf())
                  }}
                />
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
              data={transactions?.data}
              linkedAddresses={linkedAddressesData?.data}
              addTokenToMetaMask={addTokenToMetaMask}
              className="no-border"
            />
          </div>
        </>
      )}
      <div className="max-w-8xl mx-auto py-4">
        <div className="uppercase text-lg font-semibold mb-4 mx-2.5">Supported Chains</div>
        <StackGrid
          columnWidth={264}
          gutterWidth={16}
          gutterHeight={16}
          className="hidden sm:block"
        >
          {chainsComponent}
        </StackGrid>
        <div className="block sm:hidden space-y-3">
          {chainsComponent}
        </div>
      </div>
    </>
  )
}