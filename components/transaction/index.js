import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { useSelector, useDispatch, shallowEqual } from 'react-redux'

import _ from 'lodash'
import moment from 'moment'
import Web3 from 'web3'
import { constants, utils } from 'ethers'
import BigNumber from 'bignumber.js'
import { Img } from 'react-image'
import { TailSpin, Puff } from 'react-loader-spinner'
import { TiArrowRight } from 'react-icons/ti'
import { FaCheckCircle, FaRegCheckCircle, FaTimesCircle, FaQuestion } from 'react-icons/fa'
import { BsFileEarmarkX } from 'react-icons/bs'
import { GoCode } from 'react-icons/go'

import Copy from '../copy'
import Widget from '../widget'
import Popover from '../popover'
import SectionTitle from '../section-title'

import { linkedAddresses, crosschainTxs, evmVotes } from '../../lib/api/opensearch'
import { axelard } from '../../lib/api/executor'
import { domains, getENS } from '../../lib/api/ens'
import { chainTitle } from '../../lib/object/chain'
import { numberFormat, ellipseAddress, sleep } from '../../lib/utils'

import { ENS_DATA } from '../../reducers/types'

BigNumber.config({ DECIMAL_PLACES: Number(process.env.NEXT_PUBLIC_MAX_BIGNUMBER_EXPONENTIAL_AT), EXPONENTIAL_AT: [-7, Number(process.env.NEXT_PUBLIC_MAX_BIGNUMBER_EXPONENTIAL_AT)] })

export default function Transaction() {
  const dispatch = useDispatch()
  const { preferences, chains, cosmos_chains, assets, ens, validators } = useSelector(state => ({ preferences: state.preferences, chains: state.chains, cosmos_chains: state.cosmos_chains, assets: state.assets, ens: state.ens, validators: state.validators }), shallowEqual)
  const { theme } = { ...preferences }
  const { chains_data } = { ...chains }
  const { cosmos_chains_data } = { ...cosmos_chains }
  const { assets_data } = { ...assets }
  const { ens_data } = { ...ens }
  const { validators_data } = { ...validators }

  const router = useRouter()
  const { query } = { ...router }
  const { tx } = { ...query }

  const [transaction, setTransaction] = useState(null)
  const [confirmations, setConfirmations] = useState(null)
  const [web3, setWeb3] = useState(null)
  const [chainId, setChainId] = useState(null)
  const [addTokenData, setAddTokenData] = useState(null)

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
    const getData = async () => {
      if (tx) {
        let data, linked
        let query = {
          query: {
            bool: {
              should: [
                { match: { 'send.id': tx } },
                { match: { 'confirm_deposit.id': tx } },
                { match: { 'vote_confirm_deposit.id': tx } },
              ],
            },
          },
          size: 10,
        }

        let response = await crosschainTxs(query)

        if (response?.data?.length > 0) {
          if (response.data.length === 1) {
            data = response.data[0]

            if (data?.send?.recipient_address) {
              const resLinked = await linkedAddresses({
                query: {
                  match: { deposit_address: data.send.recipient_address },
                },
                size: 1,
              })

              linked = resLinked?.data?.[0]
            }

            if (data?.signed && !data?.send_gateway) {
              await sleep(0.5 * 1000)
              await axelard({ cmd: `axelard q evm batched-commands ${data.signed.chain} ${data.signed.batch_id} -oj`, cache: true, cache_timeout: 1 })
              await sleep(0.5 * 1000)
              response = await crosschainTxs(query)

              if (response?.data?.[0]) {
                data = response.data[0]
              }
            }
          }
          else {
            router.push(`/transactions/?confirm_deposit=${tx}`)
          }
        }

        setTransaction({ data, linked, tx })

        if (data?.send?.type === 'evm_transfer' && data.send.id) {
          query = {
            query: {
              bool: {
                must: [
                  { match: { 'transaction_id': data.send.id } },
                  { match: { 'confirmed': true } },
                ],
              },
            },
            size: 100,
          }

          response = await evmVotes(query)
          setConfirmations(response)
        }
        else {
          setConfirmations(null)
        }

        if (data) {
          const evmAddresses = _.uniq([data.send?.sender_address, data.send?.recipient_address, linked?.sender_address, linked?.deposit_address, linked?.recipient_address].filter(id => id))
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

    if (transaction?.tx !== tx) {
      setTransaction(null)
    }

    getData()

    const interval = setInterval(() => getData(), 0.5 * 60 * 1000)
    return () => {
      clearInterval(interval)
    }
  }, [tx])

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

  const { data, linked } = { ...transaction }
  const { send, confirm_deposit, vote_confirm_deposit, signed, send_gateway } = { ...data }

  const axelarChain = cosmos_chains_data?.find(c => c.id === 'axelarnet')
  const asset = assets_data?.find(a => [a?.id?.toLowerCase()].concat(Array.isArray(a?.ibc) ? a.ibc.map(ibc => ibc?.ibc_denom?.toLowerCase()) : a?.ibc?.toLowerCase()).includes(send?.denom?.toLowerCase())) || assets_data?.find(a => [a?.id?.toLowerCase()].concat(Array.isArray(a?.ibc) ? a.ibc.map(ibc => ibc?.ibc_denom?.toLowerCase()) : a?.ibc?.toLowerCase()).includes(linked?.asset?.toLowerCase()))
  let fromChain = chains_data?.find(c => c.id === send?.sender_chain) || cosmos_chains_data?.find(c => c.id === send?.sender_chain) || chains_data?.find(c => c.id === linked?.sender_chain) || cosmos_chains_data?.find(c => c.id === linked?.sender_chain)
  fromChain = cosmos_chains_data?.find(c => send?.sender_address?.startsWith(c.id)) || fromChain
  let depositChain = fromChain
  depositChain = (send?.recipient_address || linked?.deposit_address)?.startsWith(process.env.NEXT_PUBLIC_PREFIX_ACCOUNT) ? axelarChain : fromChain
  const toChain = chains_data?.find(c => c.id === linked?.recipient_chain) || cosmos_chains_data?.find(c => c.id === linked?.recipient_chain) || chains_data?.find(c => c.id === send?.recipient_chain) || cosmos_chains_data?.find(c => c.id === send?.recipient_chain)
  const fromContract = asset?.contracts?.find(c => c.chain_id === fromChain?.chain_id)
  const toContract = asset?.contracts?.find(c => c.chain_id === toChain?.chain_id)

  const addSendingTokenToMetaMaskButton = fromContract && fromContract.contract_address !== constants.AddressZero && (
    <button
      onClick={() => addTokenToMetaMask(fromChain?.chain_id, { ...asset, ...fromContract })}
      className="w-auto bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded flex items-center justify-center py-1 px-1.5"
    >
      <Img
        src="/logos/wallets/metamask.png"
        alt=""
        className="w-3.5 h-3.5"
      />
    </button>
  )
  const addReceivingTokenToMetaMaskButton = toContract && toContract.contract_address !== constants.AddressZero && (
    <button
      onClick={() => addTokenToMetaMask(toChain?.chain_id, { ...asset, ...toContract })}
      className="w-auto bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded flex items-center justify-center py-1 px-1.5"
    >
      <Img
        src="/logos/wallets/metamask.png"
        alt=""
        className="w-3.5 h-3.5"
      />
    </button>
  )

  return (
    <div className="max-w-6.5xl mb-3 mx-auto">
      <SectionTitle
        title="Transaction"
        subtitle={<div className="flex items-center space-x-2 mt-1">
          <span className="uppercase text-sm lg:text-lg">{ellipseAddress(tx, 16)}</span>
          <Copy size={20} text={tx} />
        </div>}
        className="flex-col sm:flex-row items-start sm:items-center space-y-2"
      />
      {!transaction || data ?
        <>
          <div className="flex flex-col lg:flex-row space-y-4 lg:space-y-0 mt-2 xl:mt-4">
            <Widget
              title={<div className="uppercase text-gray-400 dark:text-gray-600 text-sm sm:text-base font-semibold mb-2">Asset</div>}
              className="max-wax sm:max-w-min border-0 shadow-md rounded-2xl mr-4 xl:mr-6 px-5 lg:px-3 xl:px-5"
            >
              {transaction ?
                <>
                  <div className="flex items-center justify-between space-x-4 my-2">
                    {asset ?
                      <div className="min-w-max flex flex-col space-y-1">
                        <div className="min-w-max h-6 flex items-center space-x-2">
                          {fromContract ?
                            <>
                              <a
                                href={`${fromChain?.explorer?.url}${fromChain?.explorer?.[`contract${fromContract.contract_address === constants.AddressZero ? '_0' : ''}_path`]?.replace('{address}', fromContract.contract_address)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center space-x-1.5"
                              >
                                <Img
                                  src={asset.image}
                                  alt=""
                                  className="w-6 h-6 rounded-full"
                                />
                                <span className="text-sm font-semibold">{fromContract?.symbol || asset.symbol}</span>
                              </a>
                              {addSendingTokenToMetaMaskButton && (
                                <Popover
                                  placement="top"
                                  title={<span className="normal-case text-3xs">Add token</span>}
                                  content={<div className="w-32 text-3xs">Add <span className="font-semibold">{fromContract?.symbol || asset.symbol}</span> to MetaMask</div>}
                                  titleClassName="py-0.5"
                                  contentClassName="py-1.5"
                                >
                                  {addSendingTokenToMetaMaskButton}
                                </Popover>
                              )}
                            </>
                            :
                            <div className="flex items-center space-x-1.5">
                              <Img
                                src={asset.image}
                                alt=""
                                className="w-6 h-6 rounded-full"
                              />
                              <span className="text-sm font-semibold">{asset.symbol}</span>
                            </div>
                          }
                        </div>
                        <div className="flex items-center space-x-1 ml-0.5">
                          <Img
                            src={fromChain?.image}
                            alt=""
                            className="w-4 h-4 rounded-full"
                          />
                          <span className="whitespace-nowrap text-gray-900 dark:text-white text-2xs">{chainTitle(fromChain)}</span>
                        </div>
                      </div>
                      :
                      <span className="font-mono text-gray-400 dark:text-gray-600">n/a</span>
                    }
                    <div className="flex flex-col items-center space-y-2 mt-0.5">
                      <div className="max-w-min bg-gray-100 dark:bg-gray-800 rounded-xl text-xs space-x-1 py-0.5 px-2">
                        <span className="font-mono font-semibold">{send?.amount ? numberFormat(BigNumber(send.amount).shiftedBy(-(fromContract?.contract_decimals || 6)).toNumber(), '0,0.00000000', true) : '-'}</span>
                      </div>
                      <GoCode size={16} />
                    </div>
                    {asset ?
                      <div className="min-w-max flex flex-col items-end space-y-1">
                        <div className="min-w-max h-6 flex items-center space-x-2">
                          {toContract ?
                            <>
                              <a
                                href={`${toChain?.explorer?.url}${toChain?.explorer?.[`contract${toContract.contract_address === constants.AddressZero ? '_0' : ''}_path`]?.replace('{address}', toContract.contract_address)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center space-x-1.5"
                              >
                                <Img
                                  src={asset.image}
                                  alt=""
                                  className="w-6 h-6 rounded-full"
                                />
                                <span className="text-sm font-semibold">{toContract?.symbol || asset.symbol}</span>
                              </a>
                              {addReceivingTokenToMetaMaskButton && (
                                <Popover
                                  placement="top"
                                  title={<span className="normal-case text-3xs">Add token</span>}
                                  content={<div className="w-32 text-3xs">Add <span className="font-semibold">{toContract?.symbol || asset.symbol}</span> to MetaMask</div>}
                                  titleClassName="py-0.5"
                                  contentClassName="py-1.5"
                                >
                                  {addReceivingTokenToMetaMaskButton}
                                </Popover>
                              )}
                            </>
                            :
                            <div className="flex items-center space-x-1.5">
                              <Img
                                src={asset.image}
                                alt=""
                                className="w-6 h-6 rounded-full"
                              />
                              <span className="text-sm font-semibold">{asset.symbol}</span>
                            </div>
                          }
                        </div>
                        <div className="flex items-center space-x-1">
                          <Img
                            src={toChain?.image}
                            alt=""
                            className="w-4 h-4 rounded-full"
                          />
                          <span className="whitespace-nowrap text-gray-900 dark:text-white text-2xs">{chainTitle(toChain)}</span>
                        </div>
                      </div>
                      :
                      <span className="font-mono text-gray-400 dark:text-gray-600">n/a</span>
                    }
                  </div>
                </>
                :
                <div className="flex flex-col space-y-2 my-3">
                  <div className="skeleton w-64 h-6 sm:ml-auto" />
                  <div className="skeleton w-64 h-5 sm:ml-auto" />
                </div>
              }
            </Widget>
            <Widget
              title={<div className="leading-4 uppercase text-gray-400 dark:text-gray-600 text-sm sm:text-base font-semibold mb-2">Token Transfers</div>}
              className="overflow-x-auto border-0 shadow-md rounded-2xl ml-auto px-5 lg:px-3 xl:px-5"
            >
              <div className="flex flex-col sm:flex-row items-center sm:justify-between space-y-8 sm:space-y-0 my-2">
                {transaction ?
                  send?.sender_address ?
                    <div className="min-w-max">
                      <div className="flex items-center space-x-1.5 sm:space-x-1 xl:space-x-1.5">
                        {ens_data?.[send.sender_address.toLowerCase()]?.name && (
                          <Img
                            src={`${process.env.NEXT_PUBLIC_ENS_AVATAR_URL}/${ens_data?.[send.sender_address.toLowerCase()].name}`}
                            alt=""
                            className="w-6 h-6 rounded-full"
                          />
                        )}
                        <Link href={`/account/${send.sender_address}`}>
                          <a className={`text-gray-400 dark:text-gray-200 text-base sm:text-xs xl:text-sm ${ens_data?.[send.sender_address.toLowerCase()]?.name ? 'font-semibold' : 'font-medium'}`}>
                            {ellipseAddress(ens_data?.[send.sender_address.toLowerCase()]?.name, 10) || ellipseAddress(send.sender_address.toLowerCase(), 6)}
                          </a>
                        </Link>
                        <Copy size={18} text={send.sender_address} />
                        {fromChain?.explorer?.url && (
                          <a
                            href={`${fromChain.explorer.url}${fromChain.explorer.address_path?.replace('{address}', send.sender_address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-white"
                          >
                            {fromChain.explorer.icon ?
                              <Img
                                src={fromChain.explorer.icon}
                                alt=""
                                className="w-5 sm:w-4 xl:w-5 h-5 sm:h-4 xl:h-5 rounded-full opacity-60 hover:opacity-100"
                              />
                              :
                              <TiArrowRight size={20} className="transform -rotate-45" />
                            }
                          </a>
                        )}
                      </div>
                      {fromChain && (
                        <div className="flex items-center justify-center sm:justify-start space-x-2.5 mt-1.5">
                          <Img
                            src={fromChain.image}
                            alt=""
                            className="w-6 h-6 rounded-full"
                          />
                          <span className="text-gray-800 dark:text-gray-200 text-sm font-medium">{chainTitle(fromChain)}</span>
                        </div>
                      )}
                    </div>
                    :
                    <span className="font-mono text-gray-400 dark:text-gray-600 font-light">Unknown</span>
                  :
                  <div className="flex flex-col space-y-2.5 my-1">
                    <div className="skeleton w-36 h-6" />
                    <div className="skeleton w-24 h-7 mx-auto sm:ml-0" />
                  </div>
                }
                {transaction ?
                  <div className="flex flex-col items-center justify-center space-y-1 mx-auto">
                    <div className="flex items-center space-x-1">
                      <a
                        href={axelarChain?.explorer?.url ? `${axelarChain.explorer.url}${linked ? axelarChain.explorer.transaction_path?.replace('{tx}', linked.txhash) : axelarChain.explorer.address_path?.replace('{address}', send?.sender_address)}` : `${process.env.NEXT_PUBLIC_EXPLORER_URL}/${linked ? `tx/${linked.txhash}` : `address/${send?.sender_address}`}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`max-w-min h-6 bg-gray-100 dark:bg-${linked ? 'green-600' : 'blue-600'} rounded-lg flex items-center space-x-1 py-1 px-1.5`}
                      >
                        {linked ?
                          <FaCheckCircle size={14} className="text-green-600 dark:text-white" />
                          :
                          <TailSpin color={theme === 'dark' ? 'white' : '#3B82F6'} width="14" height="14" />
                        }
                        <div className={`uppercase ${linked ? 'text-black dark:text-white' : 'text-gray-400 dark:text-white'} text-xs font-semibold`}>{linked ? 'Linked' : 'Linking'}</div>
                      </a>
                      {linked?.txhash && (
                        <Copy text={linked.txhash} />
                      )}
                    </div>
                    <div className="flex items-center space-x-1">
                      <a
                        href={fromChain?.explorer?.url ? `${fromChain.explorer.url}${send ? fromChain.explorer.transaction_path?.replace('{tx}', send.id) : fromChain.explorer.address_path?.replace('{address}', send?.sender_address)}` : '/'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`max-w-min h-6 bg-gray-100 dark:bg-${send ? ['success'].includes(send.status) ? 'green-600' : 'red-700' : 'blue-600'} rounded-lg flex items-center space-x-1 py-1 px-1.5`}
                      >
                        {send ?
                          ['success'].includes(send.status) ?
                            <FaCheckCircle size={14} className="text-green-600 dark:text-white" />
                            :
                            <FaTimesCircle size={14} className="text-red-700 dark:text-white" />
                          :
                          <TailSpin color={theme === 'dark' ? 'white' : '#3B82F6'} width="14" height="14" />
                        }
                        <div className={`uppercase ${send ? 'text-black dark:text-white' : 'text-gray-400 dark:text-white'} text-xs font-semibold`}>{send ? 'Send' : 'Sending'}</div>
                      </a>
                      {send?.id && (
                        <Copy text={send.id} />
                      )}
                    </div>
                  </div>
                  :
                  <div className="flex flex-col items-center justify-center space-y-2 my-1 mx-auto">
                    <div className="skeleton w-16 h-6" />
                    <div className="skeleton w-16 h-6" />
                  </div>
                }
                <div className="mx-auto pt-1">
                  {transaction ?
                    linked?.deposit_address || send?.recipient_address ?
                      <div className="min-w-max">
                        <div className="flex items-center sm:justify-end space-x-1.5 sm:space-x-1 xl:space-x-1.5">
                          {ens_data?.[(linked?.deposit_address || send?.recipient_address).toLowerCase()]?.name && (
                            <Img
                              src={`${process.env.NEXT_PUBLIC_ENS_AVATAR_URL}/${ens_data?.[(linked?.deposit_address || send?.recipient_address).toLowerCase()].name}`}
                              alt=""
                              className="w-6 h-6 rounded-full"
                            />
                          )}
                          <Link href={`/address/${linked?.deposit_address || send?.recipient_address}`}>
                            <a className={`text-gray-400 dark:text-gray-200 text-base sm:text-xs xl:text-sm ${ens_data?.[(linked?.deposit_address || send?.recipient_address).toLowerCase()]?.name ? 'font-semibold' : 'font-medium'}`}>
                              {ellipseAddress(ens_data?.[(linked?.deposit_address || send?.recipient_address).toLowerCase()]?.name, 10) || ellipseAddress((linked?.deposit_address || send?.recipient_address).toLowerCase(), 6)}
                            </a>
                          </Link>
                          <Copy size={18} text={linked?.deposit_address || send?.recipient_address} />
                          {depositChain?.explorer?.url && (
                            <a
                              href={`${depositChain.explorer.url}${depositChain.explorer.address_path?.replace('{address}', linked?.deposit_address || send?.recipient_address)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-white"
                            >
                              {depositChain.explorer.icon ?
                                <Img
                                  src={depositChain.explorer.icon}
                                  alt=""
                                  className="w-5 sm:w-4 xl:w-5 h-5 sm:h-4 xl:h-5 rounded-full opacity-60 hover:opacity-100"
                                />
                                :
                                <TiArrowRight size={20} className="transform -rotate-45" />
                              }
                            </a>
                          )}
                        </div>
                        <div className="flex items-center justify-center space-x-2.5 mt-1">
                          <span className="text-gray-500 dark:text-gray-500 text-sm font-medium">Deposit Address</span>
                        </div>
                      </div>
                      :
                      <span className="font-mono text-gray-400 dark:text-gray-600 font-light">Unknown</span>
                    :
                    <div className="flex flex-col space-y-2.5 my-1">
                      <div className="skeleton w-36 h-6" />
                      <div className="skeleton w-24 h-5 mx-auto" />
                    </div>
                  }
                </div>
                {transaction ?
                  <div className="flex flex-col items-center justify-center space-y-1 mx-auto">
                    <div className="flex items-center space-x-1">
                      <a
                        href={axelarChain?.explorer?.url ? `${axelarChain.explorer.url}${confirm_deposit ? axelarChain.explorer.transaction_path?.replace('{tx}', confirm_deposit.id) : axelarChain.explorer.address_path?.replace('{address}', linked?.deposit_address || send?.recipient_address)}` : `${process.env.NEXT_PUBLIC_EXPLORER_URL}/${confirm_deposit ? `tx/${confirm_deposit.id}` : `address/${linked?.deposit_address || send?.recipient_address}`}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`max-w-min h-6 bg-gray-100 dark:bg-${confirm_deposit ? 'green-600' : 'blue-600'} rounded-lg flex items-center space-x-1 py-1 px-1.5`}
                      >
                        {confirm_deposit ?
                          <FaCheckCircle size={14} className="text-green-600 dark:text-white" />
                          :
                          <TailSpin color={theme === 'dark' ? 'white' : '#3B82F6'} width="14" height="14" />
                        }
                        <div className={`uppercase ${confirm_deposit ? 'text-black dark:text-white' : 'text-gray-400 dark:text-white'} text-xs font-semibold`}>{confirm_deposit ? 'Confirmed' : 'Pending'}</div>
                      </a>
                      {confirm_deposit?.id && (
                        <Copy text={confirm_deposit.id} />
                      )}
                    </div>
                    {['axelarnet_transfer', 'ibc_transfer'].includes(send?.type) ?
                      <div className="flex items-center space-x-1">
                        {signed ?
                          <>
                            <a
                              href={`${process.env.NEXT_PUBLIC_SITE_URL}/batch/${signed.chain}/${signed.batch_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`max-w-min h-6 bg-gray-100 dark:bg-${send_gateway ? 'green-600' : 'yellow-500'} rounded-lg flex items-center space-x-1 py-1 px-1.5`}
                            >
                              {send_gateway ?
                                <FaCheckCircle size={14} className="text-green-600 dark:text-white" />
                                :
                                <FaRegCheckCircle size={14} className="text-yellow-500 dark:text-white" />
                              }
                              <div className="uppercase text-black dark:text-white text-xs font-semibold">{send_gateway ? 'Executed' : 'Signed'}</div>
                            </a>
                            {signed.batch_id && (
                              <Copy text={signed.batch_id} />
                            )}
                          </>
                          :
                          <div className="max-w-min h-6 bg-gray-100 dark:bg-blue-600 rounded-lg flex items-center space-x-1 py-1 px-1.5">
                            <Puff color={theme === 'dark' ? 'white' : '#3B82F6'} width="14" height="14" />
                            <div className="uppercase text-gray-400 dark:text-white text-xs font-semibold">Signing</div>
                          </div>
                        }
                      </div>
                      :
                      ['evm_transfer'].includes(send?.type) ?
                        <div className="flex items-center space-x-1">
                          {vote_confirm_deposit ?
                            <>
                              <a
                                href={axelarChain?.explorer?.url ? `${axelarChain.explorer.url}${axelarChain.explorer.transaction_path?.replace('{tx}', vote_confirm_deposit.id)}` : `${process.env.NEXT_PUBLIC_EXPLORER_URL}/tx/${vote_confirm_deposit.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="max-w-min h-6 bg-gray-100 dark:bg-green-600 rounded-lg flex items-center space-x-1 py-1 px-1.5"
                              >
                                <FaCheckCircle size={14} className="text-green-600 dark:text-white" />
                                <div className="uppercase text-black dark:text-white text-xs font-semibold">Voted</div>
                              </a>
                              {vote_confirm_deposit.id && (
                                <Copy text={vote_confirm_deposit.id} />
                              )}
                            </>
                            :
                            <div className="max-w-min h-6 bg-gray-100 dark:bg-blue-600 rounded-lg flex items-center space-x-1 py-1 px-1.5">
                              <Puff color={theme === 'dark' ? 'white' : '#3B82F6'} width="14" height="14" />
                              <div className="uppercase text-gray-400 dark:text-white text-xs font-semibold">Voting</div>
                            </div>
                          }
                        </div>
                        :
                        null
                    }
                  </div>
                  :
                  <div className="flex flex-col items-center justify-center space-y-2 my-1 mx-auto">
                    <div className="skeleton w-16 h-6" />
                    <div className="skeleton w-16 h-6" />
                  </div>
                }
                {transaction ?
                  linked?.recipient_address || send?.recipient_address ?
                    <div className="min-w-max">
                      <div className="flex items-center sm:justify-end space-x-1.5 sm:space-x-1 xl:space-x-1.5">
                        {ens_data?.[(linked?.recipient_address || send?.recipient_address).toLowerCase()]?.name && (
                          <Img
                            src={`${process.env.NEXT_PUBLIC_ENS_AVATAR_URL}/${ens_data?.[(linked?.recipient_address || send?.recipient_address).toLowerCase()].name}`}
                            alt=""
                            className="w-6 h-6 rounded-full"
                          />
                        )}
                        <Link href={`/address/${linked?.recipient_address || send?.recipient_address}`}>
                          <a className={`text-gray-400 dark:text-gray-200 text-base sm:text-xs xl:text-sm ${ens_data?.[(linked?.recipient_address || send?.recipient_address).toLowerCase()]?.name ? 'font-semibold' : 'font-medium'}`}>
                            {ellipseAddress(ens_data?.[(linked?.recipient_address || send?.recipient_address).toLowerCase()]?.name, 10) || ellipseAddress((linked?.recipient_address || send?.recipient_address).toLowerCase(), 6)}
                          </a>
                        </Link>
                        <Copy size={18} text={linked?.recipient_address || send?.recipient_address} />
                        {toChain?.explorer?.url && (
                          <a
                            href={`${toChain.explorer.url}${toChain.explorer.address_path?.replace('{address}', linked?.recipient_address || send?.recipient_address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-white"
                          >
                            {toChain.explorer.icon ?
                              <Img
                                src={toChain.explorer.icon}
                                alt=""
                                className="w-5 sm:w-4 xl:w-5 h-5 sm:h-4 xl:h-5 rounded-full opacity-60 hover:opacity-100"
                              />
                              :
                              <TiArrowRight size={20} className="transform -rotate-45" />
                            }
                          </a>
                        )}
                      </div>
                      {toChain && (
                        <div className="flex items-center justify-center sm:justify-end space-x-2.5 mt-1.5">
                          <Img
                            src={toChain.image}
                            alt=""
                            className="w-6 h-6 rounded-full"
                          />
                          <span className="text-gray-800 dark:text-gray-200 text-sm font-medium">{chainTitle(toChain)}</span>
                        </div>
                      )}
                    </div>
                    :
                    <span className="font-mono text-gray-400 dark:text-gray-600 font-light">Unknown</span>
                  :
                  <div className="flex flex-col space-y-2.5 my-1">
                    <div className="skeleton w-36 h-6" />
                    <div className="skeleton w-24 h-7 mx-auto sm:mr-0" />
                  </div>
                }
              </div>
            </Widget>
          </div>
          <div className="grid grid-flow-row grid-cols-1 sm:grid-cols-2 gap-4 xl:gap-6 mt-4 xl:mt-6">
            {[linked, send, confirm_deposit, ['axelarnet_transfer', 'ibc_transfer'].includes(send?.type) ? signed : ['evm_transfer'].includes(send?.type) ? vote_confirm_deposit : null].map((t, i) => (
              <Widget
                key={i}
                title={<div className="flex items-center space-x-3 mb-4">
                  <Img
                    src={(i === 1 ? fromChain : axelarChain)?.image}
                    alt=""
                    className="w-6 h-6 rounded-full"
                  />
                  <span className="uppercase text-gray-400 dark:text-gray-600 text-base font-semibold">
                    {i === 0 ? 'Linked' : i === 2 ? 'Confirm Deposit' : i === 3 && send?.type ? ['evm_transfer'].includes(send?.type) ? 'Vote Confirm Deposit' : 'Batch Signing' : 'Transaction'} Details
                  </span>
                </div>}
                className="border-0 shadow-md rounded-2xl p-5 lg:px-3 xl:px-5"
              >
                <div className="w-full flex flex-col space-y-4">
                  <div className="flex flex-col md:flex-row items-start space-y-2 md:space-y-0 space-x-0 md:space-x-2">
                    <span className="md:w-20 xl:w-40 whitespace-nowrap text-xs lg:text-base font-semibold">
                      {i === 3 && ['axelarnet_transfer', 'ibc_transfer'].includes(send?.type) ? 'Batch ID' : 'TX Hash'}:
                    </span>
                    {transaction ?
                      t?.txhash || t?.id ?
                        <div className="flex items-center">
                          {(i === 1 ? fromChain : axelarChain)?.explorer?.url ?
                            <a
                              href={`${(i === 1 ? fromChain : axelarChain).explorer.url}${(i === 1 ? fromChain : axelarChain).explorer.transaction_path?.replace('{tx}', t?.txhash || t?.id)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="uppercase text-blue-600 dark:text-white text-xs lg:text-base font-medium mr-1.5"
                            >
                              {ellipseAddress(t?.txhash || t?.id, 16)}
                            </a>
                            :
                            <span className="text-xs lg:text-base mr-1.5">{ellipseAddress(t?.txhash || t?.id, 16)}</span>
                          }
                          <Copy size={18} text={t?.txhash || t?.id} />
                        </div>
                        :
                        t?.batch_id ?
                          <div className="flex items-center">
                            <a
                              href={`${process.env.NEXT_PUBLIC_SITE_URL}/batch/${t.chain}/${t.batch_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="uppercase text-blue-600 dark:text-white text-xs lg:text-base font-medium mr-1.5"
                            >
                              {ellipseAddress(t.batch_id, 16)}
                            </a>
                            <Copy size={18} text={t.batch_id} />
                          </div>
                          :
                          <span className="font-mono text-gray-400 dark:text-gray-600 text-xs lg:text-base">n/a</span>
                      :
                      <div className="skeleton w-72 h-4 lg:h-6 mt-1" />
                    }
                  </div>
                  {(i < 3 || ['evm_transfer'].includes(send?.type)) && (
                    <div className="flex flex-col md:flex-row items-start space-y-2 md:space-y-0 space-x-0 md:space-x-2">
                      <span className="md:w-20 xl:w-40 text-xs lg:text-base font-semibold">Block:</span>
                      {transaction ?
                        t?.height ?
                          (i === 1 ? fromChain : axelarChain)?.explorer?.url ?
                            <a
                              href={`${(i === 1 ? fromChain : axelarChain).explorer.url}${(i === 1 ? fromChain : axelarChain).explorer.block_path?.replace('{block}', t.height)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs lg:text-base"
                            >
                              {numberFormat(t.height, '0,0')}
                            </a>
                            :
                            <span className="text-xs lg:text-base">{numberFormat(t.height, '0,0')}</span>
                          :
                          <span className="font-mono text-gray-400 dark:text-gray-600 text-xs lg:text-base">n/a</span>
                        :
                        <div className="skeleton w-24 h-4 lg:h-6 mt-1" />
                      }
                    </div>
                  )}
                  <div className="flex flex-col md:flex-row items-start space-y-2 md:space-y-0 space-x-0 md:space-x-2">
                    <span className="md:w-20 xl:w-40 text-xs lg:text-base font-semibold">Status:</span>
                    {transaction ?
                      <div className="flex items-center space-x-2.5">
                        <div className={`max-w-min h-6 bg-gray-100 dark:bg-${t?.status ? ['success'].includes(t.status) ? 'green-600' : 'red-700' : i === 0 ? t ? 'green-600' : 'blue-600' : i === 3 && ['axelarnet_transfer', 'ibc_transfer'].includes(send?.type) ? send_gateway ? 'green-600' : t ? 'yellow-500' : 'blue-600' : 'gray-700'} rounded-lg flex items-center space-x-1 py-1 px-1.5`}>
                          {t?.status ?
                            ['success'].includes(t.status) ?
                              <FaCheckCircle size={14} className="text-green-600 dark:text-white" />
                              :
                              <FaTimesCircle size={14} className="text-red-700 dark:text-white" />
                            :
                            i === 0 ?
                              t ?
                                <FaCheckCircle size={14} className="text-green-600 dark:text-white" />
                                :
                                <TailSpin color={theme === 'dark' ? 'white' : '#3B82F6'} width="14" height="14" />
                              :
                              i === 3 && ['axelarnet_transfer', 'ibc_transfer'].includes(send?.type) ?
                                send_gateway ?
                                  <FaCheckCircle size={14} className="text-green-600 dark:text-white" />
                                  :
                                  t ?
                                    <FaRegCheckCircle size={14} className="text-yellow-500 dark:text-white" />
                                    :
                                    <TailSpin color={theme === 'dark' ? 'white' : '#3B82F6'} width="14" height="14" />
                                :
                                <FaQuestion size={14} className="text-gray-300 dark:text-white" />
                          }
                          <div className={`whitespace-nowrap uppercase ${t?.status || (i === 0 && t) || (i === 3 && ['axelarnet_transfer', 'ibc_transfer'].includes(send?.type) && (send_gateway || t)) ? 'text-black dark:text-white' : 'text-gray-400 dark:text-white'} text-xs font-semibold`}>
                            {t?.status ?
                              ['success'].includes(t.status) ?
                                'Success'
                                :
                                'Failed'
                              :
                              i === 0 ?
                                t ?
                                  'Success'
                                  :
                                  'Linking'
                                :
                                i === 3 && ['axelarnet_transfer', 'ibc_transfer'].includes(send?.type) ?
                                  send_gateway ?
                                    'Gateway Sent'
                                    :
                                    t ?
                                      'Signed'
                                      :
                                      'Signing'
                                  :
                                  'Unknown'
                            }
                          </div>
                        </div>
                        {i === 3 && ['evm_transfer'].includes(send?.type) && confirmations?.data?.length > 0 && (
                          <Popover
                            placement="top"
                            title="Confirmation"
                            content={<div className="max-h-48 overflow-y-auto flex flex-col space-y-1">
                              {confirmations.data.map((c, i) => {
                                const validator_data = validators_data?.find(v => v?.broadcaster_address?.toLowerCase() === c?.sender?.toLowerCase())

                                return (
                                  <div className={`min-w-max flex items-${validator_data ? 'start' : 'center'} space-x-2`}>
                                    <div className="flex flex-col">
                                      {validator_data?.description?.moniker && (
                                        <a
                                          href={`${process.env.NEXT_PUBLIC_EXPLORER_URL}/validator/${validator_data.operator_address}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 dark:text-white font-medium"
                                        >
                                          {ellipseAddress(validator_data.description.moniker, 16)}
                                        </a>
                                      )}
                                      <span className="flex items-center space-x-1">
                                        <a
                                          href={`${process.env.NEXT_PUBLIC_EXPLORER_URL}${validator_data?.operator_address ? `/validator/${validator_data.operator_address}` : `/account/${c?.sender}`}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-2xs text-gray-500 font-light"
                                        >
                                          {validator_data?.operator_address ?
                                            `${process.env.NEXT_PUBLIC_PREFIX_VALIDATOR}${ellipseAddress(validator_data.operator_address.replace(process.env.NEXT_PUBLIC_PREFIX_VALIDATOR, ''), 8)}`
                                            :
                                            ellipseAddress(c?.sender, 16)
                                          }
                                        </a>
                                        <Copy text={validator_data?.operator_address || c?.sender} />
                                      </span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>}
                            titleClassName="py-1"
                          >
                            <div className="max-w-min h-6 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center space-x-1.5 py-1 px-2.5">
                              <span>{numberFormat(confirmations.data.length, '0,0')}</span>
                              <span className="normal-case">Confirmation{confirmations.data.length > 1 ? 's' : ''}</span>
                            </div>
                          </Popover>
                        )}
                      </div>
                      :
                      <div className="skeleton w-24 h-5 lg:h-7 mt-1" />
                    }
                  </div>
                  {i > 0 && (i < 3 || ['evm_transfer'].includes(send?.type)) && (
                    <div className="flex flex-col md:flex-row items-start space-y-2 md:space-y-0 space-x-0 md:space-x-2">
                      <span className="md:w-20 xl:w-40 text-xs lg:text-base font-semibold">Time:</span>
                      {transaction ?
                        t?.created_at?.ms ?
                          <span className="text-xs lg:text-base">
                            <span className="text-gray-400 dark:text-gray-600 mr-1">{moment(t.created_at.ms).fromNow()}</span>
                            <span>({moment(t.created_at.ms).format('MMM D, YYYY h:mm:ss A')})</span>
                          </span>
                          :
                          <span className="font-mono text-gray-400 dark:text-gray-600 text-xs lg:text-base">n/a</span>
                        :
                        <div className="skeleton w-60 h-4 lg:h-6 mt-1" />
                      }
                    </div>
                  )}
                  {i < 3 && (
                    <div className="flex flex-col md:flex-row items-start space-y-2 md:space-y-0 space-x-0 md:space-x-2">
                      <span className="md:w-20 xl:w-40 text-xs lg:text-base font-semibold">Sender Chain:</span>
                      {transaction ?
                        fromChain ?
                          <div className="flex items-center justify-center sm:justify-start space-x-2.5 mt-1.5">
                            <Img
                              src={fromChain.image}
                              alt=""
                              className="w-6 h-6 rounded-full"
                            />
                            <span className="text-gray-800 dark:text-gray-200 text-sm font-medium">{chainTitle(fromChain)}</span>
                          </div>
                          :
                          <span className="font-mono text-gray-400 dark:text-gray-600 text-xs lg:text-base">n/a</span>
                        :
                        <div className="skeleton w-24 h-4 lg:h-6 mt-1" />
                      }
                    </div>
                  )}
                  {(i < 1 || i > 2) && (
                    <div className="flex flex-col md:flex-row items-start space-y-2 md:space-y-0 space-x-0 md:space-x-2">
                      <span className="md:w-20 xl:w-40 text-xs lg:text-base font-semibold">Recipient Chain:</span>
                      {transaction ?
                        toChain ?
                          <div className="flex items-center justify-center sm:justify-start space-x-2.5 mt-1.5">
                            <Img
                              src={toChain.image}
                              alt=""
                              className="w-6 h-6 rounded-full"
                            />
                            <span className="text-gray-800 dark:text-gray-200 text-sm font-medium">{chainTitle(toChain)}</span>
                          </div>
                          :
                          <span className="font-mono text-gray-400 dark:text-gray-600 text-xs lg:text-base">n/a</span>
                        :
                        <div className="skeleton w-24 h-4 lg:h-6 mt-1" />
                      }
                    </div>
                  )}
                  {i < 2 && (
                    <div className="flex flex-col md:flex-row items-start space-y-2 md:space-y-0 space-x-0 md:space-x-2">
                      <span className="md:w-20 xl:w-40 text-xs lg:text-base font-semibold">Sender Address:</span>
                      {transaction ?
                        send?.sender_address ?
                          <div className="flex items-center space-x-1.5 sm:space-x-1 xl:space-x-1.5">
                            {ens_data?.[send.sender_address.toLowerCase()]?.name && (
                              <Img
                                src={`${process.env.NEXT_PUBLIC_ENS_AVATAR_URL}/${ens_data?.[send.sender_address.toLowerCase()].name}`}
                                alt=""
                                className="w-6 h-6 rounded-full"
                              />
                            )}
                            <Link href={`/account/${send.sender_address}`}>
                              <a className={`text-gray-400 dark:text-gray-200 text-base ${ens_data?.[send.sender_address.toLowerCase()]?.name ? 'font-semibold' : 'font-medium'}`}>
                                {ellipseAddress(ens_data?.[send.sender_address.toLowerCase()]?.name, 16) || ellipseAddress(send.sender_address.toLowerCase(), 12)}
                              </a>
                            </Link>
                            <Copy size={18} text={send.sender_address} />
                            {fromChain?.explorer?.url && (
                              <a
                                href={`${fromChain.explorer.url}${fromChain.explorer.address_path?.replace('{address}', send.sender_address)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-white"
                              >
                                {fromChain.explorer.icon ?
                                  <Img
                                    src={fromChain.explorer.icon}
                                    alt=""
                                    className="w-5 sm:w-4 xl:w-5 h-5 sm:h-4 xl:h-5 rounded-full opacity-60 hover:opacity-100"
                                  />
                                  :
                                  <TiArrowRight size={20} className="transform -rotate-45" />
                                }
                              </a>
                            )}
                          </div>
                          :
                          <span className="font-mono text-gray-400 dark:text-gray-600 text-xs lg:text-base">n/a</span>
                        :
                        <div className="skeleton w-48 h-4 lg:h-6 mt-1" />
                      }
                    </div>
                  )}
                  {i < 2 && (
                    <div className="flex flex-col md:flex-row items-start space-y-2 md:space-y-0 space-x-0 md:space-x-2">
                      <span className="md:w-20 xl:w-40 text-xs lg:text-base font-semibold">Recipient Address:</span>
                      {transaction ?
                        t?.recipient_address ?
                          <div className="flex items-center space-x-1.5 sm:space-x-1 xl:space-x-1.5">
                            {ens_data?.[t.recipient_address.toLowerCase()]?.name && (
                              <Img
                                src={`${process.env.NEXT_PUBLIC_ENS_AVATAR_URL}/${ens_data?.[t.recipient_address.toLowerCase()].name}`}
                                alt=""
                                className="w-6 h-6 rounded-full"
                              />
                            )}
                            <Link href={`/account/${t.recipient_address}`}>
                              <a className={`text-gray-400 dark:text-gray-200 text-base ${ens_data?.[t.recipient_address.toLowerCase()]?.name ? 'font-semibold' : 'font-medium'}`}>
                                {ellipseAddress(ens_data?.[t.recipient_address.toLowerCase()]?.name, 16) || ellipseAddress(t.recipient_address.toLowerCase(), 12)}
                              </a>
                            </Link>
                            <Copy size={18} text={t.recipient_address} />
                            {(i === 0 ? toChain : depositChain)?.explorer?.url && (
                              <a
                                href={`${(i === 0 ? toChain : depositChain).explorer.url}${(i === 0 ? toChain : depositChain).explorer.address_path?.replace('{address}', t.recipient_address)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-white"
                              >
                                {(i === 0 ? toChain : depositChain).explorer.icon ?
                                  <Img
                                    src={(i === 0 ? toChain : depositChain).explorer.icon}
                                    alt=""
                                    className="w-5 sm:w-4 xl:w-5 h-5 sm:h-4 xl:h-5 rounded-full opacity-60 hover:opacity-100"
                                  />
                                  :
                                  <TiArrowRight size={20} className="transform -rotate-45" />
                                }
                              </a>
                            )}
                          </div>
                          :
                          <span className="font-mono text-gray-400 dark:text-gray-600 text-xs lg:text-base">n/a</span>
                        :
                        <div className="skeleton w-48 h-4 lg:h-6 mt-1" />
                      }
                    </div>
                  )}
                  {i > 1 && !['evm_transfer'].includes(send?.type) && (
                    <div className="flex flex-col md:flex-row items-start space-y-2 md:space-y-0 space-x-0 md:space-x-2">
                      <span className="md:w-20 xl:w-40 whitespace-nowrap text-xs lg:text-base font-semibold">Transfer ID:</span>
                      {transaction ?
                        t?.transfer_id ?
                          <div className="flex items-center">
                            <Copy
                              size={16}
                              text={t.transfer_id}
                              copyTitle={<div className="font-mono text-gray-700 dark:text-gray-300 text-base font-medium">
                                {t.transfer_id}
                              </div>}
                            />
                          </div>
                          :
                          <span className="font-mono text-gray-400 dark:text-gray-600 text-xs lg:text-base">n/a</span>
                        :
                        <div className="skeleton w-24 h-4 lg:h-6 mt-1" />
                      }
                    </div>
                  )}
                  {i === 3 && !['evm_transfer'].includes(send?.type) && (
                    <div className="flex flex-col md:flex-row items-start space-y-2 md:space-y-0 space-x-0 md:space-x-2">
                      <span className="md:w-20 xl:w-40 whitespace-nowrap text-xs lg:text-base font-semibold">Command ID:</span>
                      {transaction ?
                        t?.command_id ?
                          <div className="flex items-center">
                            <Copy
                              size={16}
                              text={t.command_id}
                              copyTitle={<div className="text-gray-700 dark:text-gray-300 text-base font-medium">
                                {ellipseAddress(t.command_id, 12)}
                              </div>}
                            />
                          </div>
                          :
                          <span className="font-mono text-gray-400 dark:text-gray-600 text-xs lg:text-base">n/a</span>
                        :
                        <div className="skeleton w-24 h-4 lg:h-6 mt-1" />
                      }
                    </div>
                  )}
                </div>
              </Widget>
            ))}
          </div>
        </>
        :
        <div className="h-96 bg-transparent rounded-xl border-2 border-dashed border-gray-400 dark:border-gray-600 flex items-center justify-center text-gray-400 dark:text-gray-600 text-lg font-medium space-x-1.5 mt-2 xl:mt-4">
          <BsFileEarmarkX size={32} />
          <span>Transaction not found</span>
        </div>
      }
    </div>
  )
}