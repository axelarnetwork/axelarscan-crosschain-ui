import Link from 'next/link'
import { useSelector, shallowEqual } from 'react-redux'

import _ from 'lodash'
import moment from 'moment'
import { constants } from 'ethers'
import BigNumber from 'bignumber.js'
import { Img } from 'react-image'
import { Puff } from 'react-loader-spinner'
import { TiArrowRight } from 'react-icons/ti'
import { FaCheckCircle, FaTimesCircle, FaClock } from 'react-icons/fa'

import Datatable from '../datatable'
import Copy from '../copy'
import Popover from '../popover'

import { type } from '../../lib/object/id'
import { chainTitle } from '../../lib/object/chain'
import { getName, numberFormat, ellipseAddress } from '../../lib/utils'

BigNumber.config({ DECIMAL_PLACES: Number(process.env.NEXT_PUBLIC_MAX_BIGNUMBER_EXPONENTIAL_AT), EXPONENTIAL_AT: [-7, Number(process.env.NEXT_PUBLIC_MAX_BIGNUMBER_EXPONENTIAL_AT)] })

export default function Transactions({ page_size = 10, data, linkedAddresses, addTokenToMetaMask, className = '' }) {
  const { preferences, chains, cosmos_chains, assets, ens } = useSelector(state => ({ preferences: state.preferences, chains: state.chains, cosmos_chains: state.cosmos_chains, assets: state.assets, ens: state.ens }), shallowEqual)
  const { theme } = { ...preferences }
  const { chains_data } = { ...chains }
  const { cosmos_chains_data } = { ...cosmos_chains }
  const { assets_data } = { ...assets }
  const { ens_data } = { ...ens }

  const axelarChain = cosmos_chains_data?.find(c => c.id === 'axelarnet')

  return (
    <>
      <Datatable
        columns={[
          {
            Header: 'Tx ID',
            accessor: 'send.id',
            disableSortBy: true,
            Cell: props => {
              const chain = props.row.original.from_chain

              return !props.row.original.skeleton ?
                <>
                  <div className="min-w-max flex items-center space-x-1">
                    <Link href={`/tx/${props.value}`}>
                      <a className="uppercase text-blue-500 dark:text-blue-400 text-xs font-medium">
                        {ellipseAddress(props.value, 8)}
                      </a>
                    </Link>
                    <Copy text={props.value} />
                    {chain?.explorer?.url && (
                      <a
                        href={`${chain.explorer.url}${chain.explorer.transaction_path?.replace('{tx}', props.value)}`}
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
                  </div>
                </>
                :
                <div className="skeleton w-32 h-5" />
            },
          },
          {
            Header: 'Sender',
            accessor: 'send.sender_address',
            disableSortBy: true,
            Cell: props => {
              const chain = props.row.original.from_chain

              return !props.row.original.skeleton ?
                props.value ?
                  <div className="min-w-max">
                    <div className="flex items-center space-x-1">
                      <Copy
                        text={props.value}
                        copyTitle={<span className="normal-case text-gray-700 dark:text-gray-300 text-xs font-medium">
                          {ellipseAddress(ens_data?.[props.value]?.name || props.value, 8)}
                        </span>}
                      />
                      {chain?.explorer?.url && (
                        <a
                          href={`${chain.explorer.url}${chain.explorer.address_path?.replace('{address}', props.value)}`}
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
                    </div>
                    {chain && (
                      <div className="flex items-center space-x-2 mt-1.5">
                        <Img
                          src={chain.image}
                          alt=""
                          className="w-6 h-6 rounded-full"
                        />
                        <span className="text-gray-900 dark:text-white text-xs font-semibold">{chainTitle(chain)}</span>
                      </div>
                    )}
                  </div>
                  :
                  <span className="text-gray-400 dark:text-gray-600 font-light">Unknown</span>
                :
                <div className="space-y-2.5">
                  <div className="skeleton w-32 h-5" />
                  <div className="skeleton w-24 h-4" />
                </div>
            },
          },
          {
            Header: 'Deposit Address',
            accessor: 'send.recipient_address',
            disableSortBy: true,
            Cell: props => {
              const chain = props.row.original.deposit_chain
              const address = props.value

              return !props.row.original.skeleton ?
                address ?
                  <div className="min-w-max">
                    <div className="flex items-center space-x-1">
                      {chain?.image && (
                        <Img
                          src={chain.image}
                          alt=""
                          className="w-5 h-5 rounded-full"
                        />
                      )}
                      <Copy
                        size={14}
                        text={address}
                        copyTitle={<span className="normal-case text-gray-600 dark:text-gray-400 text-2xs font-medium">
                          {ellipseAddress(ens_data?.[address]?.name || address, 6)}
                        </span>}
                      />
                      {chain?.explorer?.url && (
                        <a
                          href={`${chain.explorer.url}${chain.explorer.address_path?.replace('{address}', address)}`}
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
                    </div>
                  </div>
                  :
                  <span className="text-gray-400 dark:text-gray-600 font-light">Unknown</span>
                :
                <div className="skeleton w-32 h-5" />
            },
          },
          {
            Header: 'Recipient',
            accessor: 'confirm_deposit.deposit_address',
            disableSortBy: true,
            Cell: props => {
              const chain = props.row.original.to_chain
              const address = linkedAddresses?.find(l => l?.deposit_address?.toLowerCase() === (props.value || props.row.original.send?.recipient_address)?.toLowerCase())?.recipient_address || props.value

              return !props.row.original.skeleton ?
                address ?
                  <div className="min-w-max">
                    <div className="flex items-center space-x-1">
                      <Copy
                        text={address}
                        copyTitle={<span className="normal-case text-gray-700 dark:text-gray-300 text-xs font-medium">
                          {ellipseAddress(ens_data?.[address]?.name || address, 8)}
                        </span>}
                      />
                      {chain?.explorer?.url && (
                        <a
                          href={`${chain.explorer.url}${chain.explorer.address_path?.replace('{address}', address)}`}
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
                    </div>
                    {chain && (
                      <div className="flex items-center space-x-2 mt-1.5">
                        <Img
                          src={chain.image}
                          alt=""
                          className="w-6 h-6 rounded-full"
                        />
                        <span className="text-gray-900 dark:text-white text-xs font-semibold">{chainTitle(chain)}</span>
                      </div>
                    )}
                  </div>
                  :
                  <span className="text-gray-400 dark:text-gray-600 font-light">Unknown</span>
                :
                <div className="space-y-2.5">
                  <div className="skeleton w-32 h-5" />
                  <div className="skeleton w-24 h-4" />
                </div>
            },
          },
          {
            Header: 'Asset',
            accessor: 'send.amount',
            disableSortBy: true,
            Cell: props => {
              const fromChain = props.row.original.from_chain
              const toChain = props.row.original.to_chain
              const asset = assets_data?.find(a => [a?.id?.toLowerCase()].concat(Array.isArray(a?.ibc) ? a.ibc.map(ibc => ibc?.ibc_denom?.toLowerCase()) : a?.ibc?.toLowerCase()).includes(props.row.original.send?.denom?.toLowerCase()))
              const contract = asset?.contracts?.find(c => c.chain_id === toChain?.chain_id)
              const fromContract = asset?.contracts?.find(c => c.chain_id === fromChain?.chain_id)

              const addToMetaMaskButton = contract && (
                <button
                  onClick={() => addTokenToMetaMask(toChain?.chain_id, { ...asset, ...contract })}
                  className="w-auto bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg flex items-center justify-center py-1.5 px-2"
                >
                  <Img
                    src="/logos/wallets/metamask.png"
                    alt=""
                    className="w-4 h-4"
                  />
                </button>
              )

              return !props.row.original.skeleton ?
                <div className="min-w-max mr-4">
                  <div className="flex items-center space-x-2 mb-1.5">
                    <div className="min-w-max max-w-min bg-gray-100 dark:bg-gray-900 rounded-2xl flex items-center space-x-2 ml-auto py-1 px-3">
                      {asset?.image && (
                        <Img
                          src={asset.image}
                          alt=""
                          className="w-6 sm:w-5 lg:w-6 h-6 sm:h-5 lg:h-6 rounded-full"
                        />
                      )}
                      <span className="flex items-center text-gray-700 dark:text-gray-300 text-sm font-semibold">
                        <span className="font-mono mr-1.5">{typeof props.value === 'number' ? numberFormat(BigNumber(props.value).shiftedBy(-(fromContract?.contract_decimals || contract?.contract_decimals || 6)).toNumber(), '0,0.00000000', true) : '-'}</span>
                        <span className="normal-case">{ellipseAddress(asset?.symbol || props.row.original.send?.denom, 12)}</span>
                      </span>
                    </div>
                    {addToMetaMaskButton && (
                      <Popover
                        placement="top"
                        title={<span className="normal-case text-xs">Add token</span>}
                        content={<div className="w-36 text-xs">Add <span className="font-semibold">{asset.symbol}</span> to MetaMask</div>}
                        titleClassName="py-1"
                      >
                        {addToMetaMaskButton}
                      </Popover>
                    )}
                  </div>
                  {contract && (
                    <div className="flex items-center justify-end space-x-1">
                      <Copy
                        size={14}
                        text={contract.contract_address}
                        copyTitle={<span className="normal-case text-gray-600 dark:text-gray-400 text-2xs font-medium">
                          {ellipseAddress(contract.contract_address, 8)}
                        </span>}
                      />
                      {toChain?.explorer?.url && (
                        <a
                          href={`${toChain.explorer.url}${toChain.explorer[`contract${contract.contract_address === constants.AddressZero ? '_0' : ''}_path`]?.replace('{address}', contract.contract_address)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-white"
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
                    </div>
                  )}
                </div>
                :
                <div className="space-y-2.5 mr-4">
                  <div className="skeleton w-32 h-5 ml-auto" />
                  <div className="skeleton w-24 h-4 ml-auto" />
                </div>
            },
            headerClassName: 'justify-end text-right mr-4',
          },
          {
            Header: 'Status',
            accessor: 'status',
            disableSortBy: true,
            Cell: props => {
              const type = props.row.original.send?.type
              const fromChain = props.row.original.from_chain
              const toChain = props.row.original.to_chain

              const steps = [
                { id: 'send', title: 'Send Token', chain: fromChain },
                { id: 'confirm_deposit', title: 'Deposit Confirmed',chain: axelarChain },
                { id: 'vote_confirm_deposit', type: 'evm_transfer', title: 'Deposit Voted', chain: axelarChain },
                { id: 'signed', type: ['axelarnet_transfer', 'ibc_transfer'], title: 'Batch Signed', url: '/batch/{chain}/{batch_id}', field_id: 'batch_id' },
                { id: 'send_gateway', type: ['axelarnet_transfer', 'ibc_transfer'], title: 'Gateway Sent', url: '/batch/{chain}/{batch_id}', field_id: 'batch_id' },
              ].filter(step => !step.type || step.type === type || (Array.isArray(step.type) && step.type.includes(type)))

              const current_step = steps.findIndex(step => !(props.row.original[step?.id] && props.row.original[step?.id].status === 'success'))

              return !props.row.original.skeleton ?
                <div className="min-w-max flex flex-col space-y-2 mb-4">
                  {steps.map((step, i) => (
                    <div key={i} className="flex items-center space-x-1.5">
                      {props.row.original[step.id] ?
                        props.row.original[step.id].status === 'failed' ?
                          <FaTimesCircle size={20} className="text-red-500" />
                          :
                          <FaCheckCircle size={20} className="text-green-500" />
                        :
                        i === current_step ?
                          <Puff color={theme === 'dark' ? 'white' : '#9CA3AF'} width="20" height="20" />
                          :
                          <FaClock size={20} className="text-gray-200 dark:text-gray-800" />
                      }
                      <div key={i} className="flex items-center space-x-1">
                        {props.row.original[step.id]?.id || props.row.original[step.id]?.[step.field_id] ?
                          <Copy
                            size={16}
                            text={props.row.original[step.id]?.id || props.row.original[step.id]?.[step.field_id]}
                            copyTitle={<span className="uppercase text-gray-800 dark:text-gray-200 text-xs font-semibold">{step.title}</span>}
                          />
                          :
                          <span className="uppercase text-gray-600 dark:text-gray-400 text-xs">{step.title}</span>
                        }
                        {step.chain ?
                          props.row.original[step.id]?.id && step.chain.explorer?.url && (
                            <a
                              href={`${step.chain.explorer.url}${step.chain.explorer.transaction_path?.replace('{tx}', props.row.original[step.id].id)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 dark:text-white"
                            >
                              {step.chain.explorer.icon ?
                                <Img
                                  src={step.chain.explorer.icon}
                                  alt=""
                                  className="w-4 h-4 rounded-full opacity-60 hover:opacity-100"
                                />
                                :
                                <TiArrowRight size={16} className="transform -rotate-45" />
                              }
                            </a>
                          )
                          :
                          step.url ?
                            props.row.original[step.id]?.[step.field_id] && (
                              <Link href={step.url?.split('/').map(path => path?.startsWith('{') && path?.endsWith('}') ? props.row.original[step.id][path.substring(1, path.length - 1)] : path).join('/')}>
                                <a
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 dark:text-white"
                                >
                                  <TiArrowRight size={16} className="transform -rotate-45" />
                                </a>
                              </Link>
                            )
                            :
                            null
                        }
                      </div>
                    </div>
                  ))}
                </div>
                :
                <div className="flex-col space-y-2 mb-4">
                  {[...Array(4).keys()].map(i => (
                    <div key={i} className="skeleton w-32 h-5" />
                  ))}
                </div>
            },
          },
          {
            Header: 'Time',
            accessor: 'send.created_at.ms',
            disableSortBy: true,
            Cell: props => (
              !props.row.original.skeleton ?
                <Popover
                  placement="top"
                  title={<span className="normal-case">TX Time</span>}
                  content={<div className="w-36 text-xs">{moment(props.value).format('MMM D, YYYY h:mm:ss A')}</div>}
                  titleClassName="h-8"
                  className="ml-auto"
                >
                  <div className="text-right">
                    <span className="normal-case text-gray-400 dark:text-gray-600 font-normal">
                      {Number(moment().diff(moment(props.value), 'second')) > 59 ?
                        moment(props.value).fromNow()
                        :
                        <>{moment().diff(moment(props.value), 'second')}s ago</>
                      }
                    </span>
                  </div>
                </Popover>
                :
                <div className="skeleton w-20 h-5 ml-auto" />
            ),
            headerClassName: 'justify-end text-right',
          },
        ]}
        data={data ?
          data.map((transaction, i) => {
            const sender_chain = transaction?.send?.sender_chain || (transaction?.send?.type === 'evm_transfer' ? transaction?.confirm_deposit?.sender_chain : linkedAddresses?.find(l => l?.deposit_address?.toLowerCase() === transaction?.send?.recipient_address?.toLowerCase())?.sender_chain) || (transaction?.send?.type === 'axelarnet_transfer' && axelarChain?.id) || (transaction?.send?.type === 'ibc_transfer' && cosmos_chains_data?.find(c => transaction?.send?.sender_address?.startsWith(c.prefix_address))?.id)
            const from_chain = chains_data?.find(c => c.id === sender_chain) || cosmos_chains_data?.find(c => c.id === sender_chain)
            const _deposit_chain = linkedAddresses?.find(l => l?.deposit_address?.toLowerCase() === transaction?.send?.recipient_address?.toLowerCase())?.sender_chain || (['axelarnet_transfer', 'ibc_transfer'].includes(transaction?.send?.type) && axelarChain?.id)
            const deposit_chain = chains_data?.find(c => c.id === _deposit_chain) || cosmos_chains_data?.find(c => c.id === _deposit_chain)
            const recipient_chain = linkedAddresses?.find(l => l?.deposit_address?.toLowerCase() === transaction?.send?.recipient_address?.toLowerCase())?.recipient_chain || (transaction?.send?.type === 'evm_transfer' && axelarChain?.id)
            const to_chain = chains_data?.find(c => c.id === recipient_chain) || cosmos_chains_data?.find(c => c.id === recipient_chain)

            if (transaction?.signed && !transaction.signed.chain) {
              transaction.signed.chain = (['axelarnet_transfer', 'ibc_transfer'].includes(transaction.send?.type) ? to_chain : from_chain)?.id
            }

            return {
              ...transaction,
              i,
              from_chain,
              deposit_chain,
              to_chain,
            }
          })
          :
          [...Array(page_size).keys()].map(i => { return { i, skeleton: true } })
        }
        noPagination={!data || data?.length <= 10 ? true : false}
        defaultPageSize={page_size}
        className={`min-h-full ${className}`}
      />
      {data && !(data.length > 0) && (
        <div className="bg-gray-100 dark:bg-gray-900 rounded-xl text-gray-300 dark:text-gray-500 text-base font-medium italic text-center my-4 mx-2.5 py-4">
          No Transactions
        </div>
      )}
    </>
  )
}