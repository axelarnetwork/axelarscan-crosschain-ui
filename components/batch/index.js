import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { useSelector, useDispatch, shallowEqual } from 'react-redux'

import _ from 'lodash'
import moment from 'moment'
import BigNumber from 'bignumber.js'
import { Img } from 'react-image'
import { TiArrowRight } from 'react-icons/ti'
import { RiKeyFill } from 'react-icons/ri'
import { BiArrowBack } from 'react-icons/bi'

import Datatable from '../datatable'
import Copy from '../copy'
import SectionTitle from '../section-title'

import { axelard } from '../../lib/api/executor'
import { domains, getENS } from '../../lib/api/ens'
import { type } from '../../lib/object/id'
import { chainTitle } from '../../lib/object/chain'
import { numberFormat, ellipseAddress, convertToJson } from '../../lib/utils'

import { ENS_DATA } from '../../reducers/types'

BigNumber.config({ DECIMAL_PLACES: Number(process.env.NEXT_PUBLIC_MAX_BIGNUMBER_EXPONENTIAL_AT), EXPONENTIAL_AT: [-7, Number(process.env.NEXT_PUBLIC_MAX_BIGNUMBER_EXPONENTIAL_AT)] })

export default function Batch() {
  const dispatch = useDispatch()
  const { preferences, chains, assets, ens } = useSelector(state => ({ preferences: state.preferences, chains: state.chains, assets: state.assets, ens: state.ens }), shallowEqual)
  const { theme } = { ...preferences }
  const { chains_data } = { ...chains }
  const { assets_data } = { ...assets }
  const { ens_data } = { ...ens }

  const router = useRouter()
  const { query, pathname } = { ...router }
  const { chain, id } = { ...query }

  const [batchData, setBatchData] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    const getData = async is_interval => {
      if (chain && id) {
        if (!controller.signal.aborted) {
          const response = await axelard({ cmd: `axelard q evm batched-commands ${chain} ${id} -oj`, cache: true, cache_timeout: 1 })
          const data = convertToJson(response?.stdout) || {}

          setBatchData({ data, chain, id })

          if (data?.commands) {
            if (!controller.signal.aborted && !is_interval) {
              const evmAddresses = _.uniq(data.commands.flatMap(c => _.concat(c?.params?.account, c?.params?.newOwners?.split(';'), c?.params?.newOperators?.split(';'))).filter(a => type(a) === 'evm' && !ens_data?.[a?.toLowerCase()]))
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

    const interval = setInterval(() => getData(true), 0.5 * 60 * 1000)
    return () => {
      controller?.abort()
      clearInterval(interval)
    }
  }, [chain, id])

  const chainData = chains_data?.find(c => c.id === chain)

  return (
    <div className="max-w-6xl min-h-screen mx-auto">
      <SectionTitle
        title={<div className="mt-3">Batch Commands</div>}
        subtitle={<div className="flex items-center space-x-2 mt-1">
          <span className="uppercase text-sm lg:text-lg">{ellipseAddress(id, 16)}</span>
          <Copy size={20} text={id} />
        </div>}
        right={<div className="w-full sm:w-auto flex sm:flex-col items-center justify-between sm:space-y-0.5">
          {chainData && (
            <div className="flex items-center space-x-2">
              <Img
                src={chainData.image}
                alt=""
                className="w-8 sm:w-6 h-8 sm:h-6 rounded-full"
              />
              <span className="text-base sm:text-sm font-semibold">{chainTitle(chainData)}</span>
            </div>
          )}
          {batchData?.data?.status && (
            <div className={`max-w-min ${['BATCHED_COMMANDS_STATUS_SIGNED'].includes(batchData.data.status) ? 'bg-green-500 dark:bg-green-600' : ['BATCHED_COMMANDS_STATUS_SIGNING'].includes(batchData.data.status) ? 'bg-blue-500 dark:bg-blue-600' : 'bg-red-500 dark:bg-red-600'} shadow rounded-xl text-white text-base ml-auto py-1 px-2.5`}>
              {_.last(batchData.data.status.split('_'))}
            </div>
          )}
        </div>}
        className="flex-col sm:flex-row items-start sm:items-center space-y-2"
      />
      <div className="my-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-1 sm:space-y-0 space-x-1">
          {batchData?.id === id ?
            <div className="flex items-center text-gray-700 dark:text-gray-300 space-x-3">
              <RiKeyFill size={20} className="mb-0.5 ml-0.5" />
              <span className="font-mono text-base font-medium">{batchData?.data?.key_id || 'Unknown'}</span>
            </div>
            :
            <div className="skeleton w-56 h-8" />
          }
          {batchData?.id === id && batchData?.data ?
            batchData.data.created_at && (
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {moment(batchData.data.created_at.ms).format('MMM D, YYYY h:mm:ss A')}
              </div>
            )
            :
            <div className="skeleton w-36 h-6" />
          }
        </div>
        <div className="my-4">
          <Datatable
            columns={[
              {
                Header: 'Command ID',
                accessor: 'id',
                disableSortBy: true,
                Cell: props => (
                  !props.row.original.skeleton ?
                    <Copy
                      text={props.value}
                      copyTitle={<span className="uppercase text-gray-400 dark:text-gray-600 text-xs font-normal">
                        {ellipseAddress(props.value, 8)}
                      </span>}
                    />
                    :
                    <div className="skeleton w-36 h-5" />
                ),
              },
              {
                Header: 'Type',
                accessor: 'type',
                disableSortBy: true,
                Cell: props => (
                  !props.row.original.skeleton ?
                    props.value ?
                      <div className="max-w-min bg-gray-100 dark:bg-gray-900 rounded-xl capitalize font-semibold -mt-1 -ml-2.5 py-1 px-2.5">
                        {props.value}
                      </div>
                      :
                      <span className="text-gray-400 dark:text-gray-600 font-light">Unknown</span>
                    :
                    <div className="skeleton w-24 h-5" />
                ),
              },
              {
                Header: 'Account',
                accessor: 'params.account',
                disableSortBy: true,
                Cell: props => {
                  const chainData = chains_data?.find(c => c.id === chain)

                  return !props.row.original.skeleton ?
                    props.value ?
                      <div className="flex items-center space-x-1">
                        <Copy
                          text={props.value}
                          copyTitle={<span className="normal-case text-gray-700 dark:text-gray-300 text-xs font-medium">
                            {ellipseAddress(ens_data?.[props.value?.toLowerCase()]?.name || props.value, 8)}
                          </span>}
                        />
                        {chainData?.explorer?.url && (
                          <a
                            href={`${chainData.explorer.url}${chainData.explorer.address_path?.replace('{address}', props.value)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-w-max text-blue-600 dark:text-white"
                          >
                            {chainData.explorer.icon ?
                              <Img
                                src={chainData.explorer.icon}
                                alt=""
                                className="w-4 h-4 rounded-full opacity-60 hover:opacity-100"
                              />
                              :
                              <TiArrowRight size={16} className="transform -rotate-45" />
                            }
                          </a>
                        )}
                      </div>
                      :
                      props.row.original.params?.salt ?
                        <div className="flex items-center space-x-1.5">
                          <span className="font-semibold">Salt:</span>
                          <Copy
                            text={props.row.original.params.salt}
                            copyTitle={<span className="normal-case text-gray-700 dark:text-gray-300 text-xs font-medium">
                              {ellipseAddress(props.row.original.params.salt, 8)}
                            </span>}
                          />
                        </div>                   
                        :
                        props.row.original.params?.newOwners ?
                          <div className="max-w-xl flex flex-wrap">
                            {props.row.original.params.newOwners.split(';').map((owner, i) => (
                              <div key={i} className="flex items-center space-x-1 mb-1 mr-2.5">
                                <Copy
                                  text={owner}
                                  copyTitle={<span className="normal-case text-gray-700 dark:text-gray-300 text-xs font-medium">
                                    {ellipseAddress(ens_data?.[owner?.toLowerCase()]?.name || owner, 8)}
                                  </span>}
                                />
                                {chainData?.explorer?.url && (
                                  <a
                                    href={`${chainData.explorer.url}${chainData.explorer.address_path?.replace('{address}', owner)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="min-w-max text-blue-600 dark:text-white"
                                  >
                                    {chainData.explorer.icon ?
                                      <Img
                                        src={chainData.explorer.icon}
                                        alt=""
                                        className="w-4 h-4 rounded-full opacity-60 hover:opacity-100"
                                      />
                                      :
                                      <TiArrowRight size={16} className="transform -rotate-45" />
                                    }
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                          :
                          props.row.original.params?.newOperators ?
                            <div className="max-w-xl flex flex-wrap">
                              {props.row.original.params.newOperators.split(';').map((operator, i) => (
                                <div key={i} className="flex items-center space-x-1 mb-1 mr-2.5">
                                  <Copy
                                    text={operator}
                                    copyTitle={<span className="normal-case text-gray-700 dark:text-gray-300 text-xs font-medium">
                                      {ellipseAddress(ens_data?.[operator?.toLowerCase()]?.name || operator, 8)}
                                    </span>}
                                  />
                                  {chainData?.explorer?.url && (
                                    <a
                                      href={`${chainData.explorer.url}${chainData.explorer.address_path?.replace('{address}', operator)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="min-w-max text-blue-600 dark:text-white"
                                    >
                                      {chainData.explorer.icon ?
                                        <Img
                                          src={chainData.explorer.icon}
                                          alt=""
                                          className="w-4 h-4 rounded-full opacity-60 hover:opacity-100"
                                        />
                                        :
                                        <TiArrowRight size={16} className="transform -rotate-45" />
                                      }
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                            :
                            props.row.original.params?.name ?
                              <div className="flex flex-col">
                                <span className="font-semibold">{props.row.original.params.name}</span>
                                <div className="flex items-center space-x-1.5">
                                  {props.row.original.params.decimals && (
                                    <span className="text-gray-400 dark:text-gray-600 text-xs">decimals: {numberFormat(props.row.original.params.decimals, '0,0')}</span>
                                  )}
                                  {props.row.original.params.cap && (
                                    <span className="text-gray-400 dark:text-gray-600 text-xs">cap: {numberFormat(props.row.original.params.cap, '0,0')}</span>
                                  )}
                                </div>
                              </div>
                              :
                              <span className="text-gray-400 dark:text-gray-600 font-light">Unknown</span>
                    :
                    <div className="skeleton w-40 h-5" />
                },
              },
              {
                Header: 'Amount',
                accessor: 'params.amount',
                disableSortBy: true,
                Cell: props => {
                  const chainData = chains_data?.find(c => c.id === chain)
                  const asset = assets_data?.find(a => a?.symbol?.toLowerCase().replace('axelar', '') === props.row.original.params?.symbol?.toLowerCase())
                  const contract = asset?.contracts?.find(c => c.chain_id === chainData?.chain_id)

                  return !props.row.original.skeleton ?
                    <div className="flex items-center space-x-2 -mt-1 mr-1.5">
                      {props.row.original.params?.symbol ?
                        <div className="min-w-max max-w-min bg-gray-100 dark:bg-gray-900 rounded-2xl flex items-center space-x-2 ml-auto py-1 px-2.5">
                          {asset?.image && (
                            <Img
                              src={asset.image}
                              alt=""
                              className="w-5 h-5 rounded-full"
                            />
                          )}
                          <span className="flex items-center text-gray-700 dark:text-gray-300 text-sm font-semibold">
                            {props.value && (
                              <span className="font-mono mr-1.5">
                                {numberFormat(BigNumber(props.value).shiftedBy(-(contract?.contract_decimals || 6)).toNumber(), '0,0.00000000', true)}
                              </span>
                            )}
                            <span className="normal-case">{props.row.original.params?.symbol || asset?.symbol}</span>
                          </span>
                        </div>
                        :
                        props.row.original.params?.newThreshold ?
                          <div className="flex items-center space-x-1.5 mt-1 ml-auto mr-2.5">
                            <span className="font-semibold">Threshold:</span>
                            <span className="normal-case text-gray-700 dark:text-gray-300 text-xs font-medium">
                              {numberFormat(props.row.original.params.newThreshold, '0,0')}
                            </span>
                          </div>
                          :
                          null
                      }
                    </div>
                    :
                    <div className="skeleton w-28 h-5 ml-auto mr-4" />
                },
                headerClassName: 'justify-end text-right mr-4',
              },
              {
                Header: 'Max Gas Cost',
                accessor: 'max_gas_cost',
                disableSortBy: true,
                Cell: props => (
                  !props.row.original.skeleton ?
                    <div className="font-mono text-gray-700 dark:text-gray-300 text-right">
                      {props.value ? numberFormat(props.value, '0,0.00000000', true) : '-'}
                    </div>
                    :
                    <div className="skeleton w-24 h-5 ml-auto" />
                ),
                headerClassName: 'whitespace-nowrap justify-end text-right',
              },
            ]}
            data={batchData?.id === id && batchData?.data ?
              batchData?.data?.commands?.map((command, i) => { return { ...command, i } }) || []
              :
              [...Array(3).keys()].map(i => { return { i, skeleton: true } })
            }
            noPagination={batchData?.id !== id || batchData?.data?.commands?.length <= 10 ? true : false}
            defaultPageSize={10}
            className="min-h-full small no-border"
          />
          {batchData?.id === id && batchData?.data && !(batchData.data.commands?.length > 0) && (
            <div className="bg-gray-100 dark:bg-gray-900 rounded-xl text-gray-300 dark:text-gray-500 text-base font-medium italic text-center my-4 py-4">
              No Commands
            </div>
          )}
        </div>
        <div className="my-4">
          <div className="flex flex-col space-y-8">
            <div className="flex flex-col space-y-2.5">
              <span className="text-base font-semibold">Data</span>
              {batchData?.id === id ?
                batchData?.data?.data ?
                  <div className="flex items-start">
                    <div className="w-full bg-gray-100 dark:bg-gray-900 break-all rounded-xl text-gray-400 dark:text-gray-600 text-xs lg:text-sm mr-2 p-4">
                      {batchData.data.data}
                    </div>
                    <Copy size={20} text={batchData.data.data} className="mt-4" />
                  </div>
                  :
                  <span className="text-xs lg:text-base">-</span>
                :
                <div className="flex flex-col space-y-3">
                  {[...Array(8).keys()].map(i => (
                    <div key={i} className="skeleton w-full h-4 lg:h-6" />
                  ))}
                </div>
              }
            </div>
            <div className="flex flex-col space-y-2.5">
              <span className="text-base font-semibold">Execute Data</span>
              {batchData?.id === id ?
                batchData?.data?.execute_data ?
                  <div className="flex items-start">
                    <div className="w-full bg-gray-100 dark:bg-gray-900 break-all rounded-xl text-gray-400 dark:text-gray-600 text-xs lg:text-sm mr-2 p-4">
                      {batchData.data.execute_data}
                    </div>
                    <Copy size={20} text={batchData.data.execute_data} className="mt-4" />
                  </div>
                  :
                  <span className="text-xs lg:text-base">-</span>
                :
                <div className="flex flex-col space-y-3">
                  {[...Array(8).keys()].map(i => (
                    <div key={i} className="skeleton w-full h-4 lg:h-6" />
                  ))}
                </div>
              }
            </div>
            <div className="flex flex-col space-y-2.5">
              <span className="text-base font-semibold">Signature</span>
              {batchData?.id === id ?
                batchData?.data?.signature ?
                  <div className="flex flex-col space-y-2.5">
                    {batchData.data.signature.map((_signature, i) => (
                      <div key={i} className="max-w-min bg-gray-100 dark:bg-gray-900 rounded-xl py-1 px-2.5">
                        <Copy
                          text={_signature}
                          copyTitle={<span className="normal-case text-gray-600 dark:text-gray-400 text-xs font-medium">
                            <span className="lg:hidden">{ellipseAddress(_signature, 20)}</span>
                            <span className="hidden lg:block">{_signature}</span>
                          </span>}
                        />
                      </div>
                    ))}
                  </div>
                  :
                  <span className="text-xs lg:text-base">-</span>
                :
                <div className="flex flex-col space-y-3">
                  {[...Array(8).keys()].map(i => (
                    <div key={i} className="skeleton w-full sm:w-3/4 h-4 lg:h-6" />
                  ))}
                </div>
              }
            </div>
          </div>
        </div>
      </div>
      {batchData?.id === id && batchData?.data?.prev_batched_commands_id && (
        <SectionTitle
          title="Previous Batch Commands"
          subtitle={<div className="flex items-center space-x-2 mt-1">
            <Link href={`${pathname?.replace('[chain]', chain).replace('[id]', batchData.data.prev_batched_commands_id)}`}>
              <a className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-900 dark:hover:bg-gray-800 rounded-lg flex items-center space-x-2 py-2 px-3">
                <BiArrowBack size={20} className="mb-0.5" />
                <span className="uppercase text-sm">{ellipseAddress(batchData.data.prev_batched_commands_id, 12)}</span>
              </a>
            </Link>
            <Copy size={16} text={batchData.data.prev_batched_commands_id} />
          </div>}
          className="flex-col sm:flex-row items-start sm:items-center space-y-2"
        />
      )}
    </div>
  )
}