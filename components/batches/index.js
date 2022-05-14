import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { useSelector, useDispatch, shallowEqual } from 'react-redux'

import _ from 'lodash'
import moment from 'moment'
import BigNumber from 'bignumber.js'
import { Img } from 'react-image'
import { Oval } from 'react-loader-spinner'
import { TiArrowRight } from 'react-icons/ti'
import { MdRefresh } from 'react-icons/md'
import { RiKeyFill } from 'react-icons/ri'
import { BsArrowRightShort, BsDash } from 'react-icons/bs'

import PendingCommands from './pending-commands'
import Datatable from '../datatable'
import Copy from '../copy'
import Popover from '../popover'
import SectionTitle from '../section-title'

import { axelard } from '../../lib/api/executor'
import { batches } from '../../lib/api/opensearch'
import { domains, getENS } from '../../lib/api/ens'
import { type } from '../../lib/object/id'
import { chainTitle } from '../../lib/object/chain'
import { numberFormat, ellipseAddress, convertToJson, sleep } from '../../lib/utils'

import { ENS_DATA } from '../../reducers/types'

BigNumber.config({ DECIMAL_PLACES: Number(process.env.NEXT_PUBLIC_MAX_BIGNUMBER_EXPONENTIAL_AT), EXPONENTIAL_AT: [-7, Number(process.env.NEXT_PUBLIC_MAX_BIGNUMBER_EXPONENTIAL_AT)] })

export default function Batches() {
  const dispatch = useDispatch()
  const { preferences, chains, assets, ens } = useSelector(state => ({ preferences: state.preferences, chains: state.chains, assets: state.assets, ens: state.ens }), shallowEqual)
  const { theme } = { ...preferences }
  const { chains_data } = { ...chains }
  const { assets_data } = { ...assets }
  const { ens_data } = { ...ens }

  const router = useRouter()
  const { query } = { ...router }
  const { command_id } = { ...query }

  const [filterChains, setFilterChains] = useState(null)
  const [refreshTrigger, setRefreshTrigger] = useState(null)
  const [batchesData, setBatchesData] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    const getData = async is_interval => {
      if (chains_data) {
        if (!controller.signal.aborted) {
          const should = chains_data.filter(c => !filterChains || filterChains.includes(c.id)).map(c => {
            return {
              match: { chain: c.id },
            }
          })

          if (!is_interval) {
            setBatchesData(null)
          }

          /*await */updateSigningBatches(batchesData?.data)

          const query = {
            query: {
              bool: {
                should,
                minimum_should_match: `${Math.floor(100 / (should.length || 1))}%`,
              },
            },
            sort: [
              { 'created_at.ms': 'desc' },
            ],
            _source: false,
            fields: ['batch_id', 'chain', 'key_id', 'commands.*', 'status', 'signature', 'created_at.*'],
            size: 500,
          }

          if (command_id) {
            query.query.bool.must = [{ term: { 'command_ids': command_id } }]
          }

          const response = await batches(query)

          // const data = await updateSigningBatches(response?.data || [], true)
          const data = response?.data || []
          updateSigningBatches(data, true)

          setBatchesData({ data })

          /*if (data.length > 0) {
            if (!controller.signal.aborted && !is_interval) {
              const evmAddresses = _.uniq(data.flatMap(_batch => _batch?.commands || []).flatMap(_command => _.concat(_command?.params?.account, _command?.params?.newOwners?.split(';'), _command?.params?.newOperators?.split(';'))).filter(_address => type(_address) === 'evm' && !ens_data?.[_address?.toLowerCase()]))
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
          }*/
        }
      }
    }

    getData()

    const interval = setInterval(() => getData(true), 0.5 * 60 * 1000)
    return () => {
      controller?.abort()
      clearInterval(interval)
    }
  }, [command_id, chains_data, filterChains, refreshTrigger])

  const updateSigningBatches = async (data, is_after_search) => {
    const _data = _.cloneDeep(data)
    const signingBatches = _data?.filter(_batch => ['BATCHED_COMMANDS_STATUS_SIGNING'].includes(_batch?.status))

    if (signingBatches?.length > 0) {
      if (is_after_search) {
        await sleep(0.5 * 1000)
      }

      for (let i = 0; i < signingBatches.length; i++) {
        const signingBatch = signingBatches[i]

        const params = { cmd: `axelard q evm batched-commands ${signingBatch.chain} ${signingBatch.batch_id} -oj`, cache: true, cache_timeout: 1 }

        if (signingBatch.created_at?.ms) {
          params.created_at = signingBatch.created_at.ms / 1000
        }

        const response = await axelard(params)
        const batchData = convertToJson(response?.stdout)

        if (batchData && _data.findIndex(_batch => _batch?.batch_id === batchData.batch_id) > -1) {
          _data[_data.findIndex(_batch => _batch?.batch_id === batchData.batch_id)] = batchData
        }

        await sleep(0.5 * 1000)
      }

      if (!is_after_search) {
        await sleep(0.5 * 1000)
      }
    }

    return _data
  }

  return (
    <div className="max-w-7xl min-h-screen mx-auto">
      <SectionTitle
        title={<div className="mt-3">A list of the latest</div>}
        subtitle={<div className="mt-1">
          <span className="text-sm lg:text-lg">Batches Commands</span>
        </div>}
        right={<div className="max-w-4xl flex flex-wrap items-center sm:justify-end">
          {chains_data?.map((c, i) => (
            <div
              key={i}
              onClick={() => {
                if (batchesData) {
                  setFilterChains(_.uniq(_.concat(filterChains || [], c.id)).filter(cid => cid !== c.id || !filterChains?.includes(cid)))
                }
              }}
              className={`${filterChains?.includes(c.id) ? 'bg-blue-600 hover:shadow-lg text-white' : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-900 dark:hover:bg-gray-800 hover:shadow'} cursor-${batchesData ? 'pointer' : 'not-allowed'} rounded-xl flex items-center space-x-1.5 mb-2 ml-0 sm:ml-2 mr-2 sm:mr-0 py-1 px-2.5`}
            >
              <Img
                src={c.image}
                alt=""
                className="w-6 h-6 rounded-full"
              />
              <span className="text-xs font-semibold">{chainTitle(c)}</span>
            </div>
          ))}
        </div>}
        className="flex-col sm:flex-row items-start sm:items-start space-y-2 mx-2.5"
      />
      <div className="my-6">
        <div className="flex items-center ml-3 mr-0.5 mb-2">
          <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0">
            <span className="flex items-center text-gray-400 dark:text-gray-600 font-medium sm:mr-2 mb-2 sm:mb-0">
              <span>Pending Commands</span>
              <span className="hidden sm:block">:</span>
            </span>
            <div className="flex flex-wrap items-center">
              {chains_data?.map((c, i) => (
                <div key={i} className="my-1 mr-2">
                  <PendingCommands chain={c} />
                </div>
              ))}
            </div>
          </div>
          <button
            disabled={!batchesData}
            onClick={() => setRefreshTrigger(moment().valueOf())}
            className={`${!batchesData ? 'cursor-not-allowed text-gray-400 dark:text-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'} rounded-xl flex items-center font-medium space-x-1.5 ml-auto py-1 px-3`}
          >
            {batchesData ?
              <MdRefresh size={16} />
              :
              <Oval color={theme === 'dark' ? '#F9FAFB' : '#3B82F6'} width="16" height="16" />
            }
            <span>{batchesData ? 'Refresh' : 'Fetching'}</span>
          </button>
        </div>
        <Datatable
          columns={[
            {
              Header: 'Batch ID',
              accessor: 'batch_id',
              disableSortBy: true,
              Cell: props => (
                !props.row.original.skeleton ?
                  <>
                    <div className="flex items-center space-x-1.5">
                      <Link href={`/batch/${props.row.original.chain}/${props.value}`}>
                        <a className="uppercase text-blue-500 dark:text-blue-600 font-medium">
                          {ellipseAddress(props.value, 10)}
                        </a>
                      </Link>
                      <Copy size={20} text={props.value} />
                    </div>
                    <div className="flex items-center space-x-1.5 mt-1 mb-3">
                      {props.row.original.data && (
                        <div className="max-w-min bg-gray-100 dark:bg-gray-900 rounded-xl py-1.5 px-2.5">
                          <Copy
                            size={12}
                            text={props.row.original.data}
                            copyTitle={<div className="uppercase text-gray-700 dark:text-gray-300 text-3xs font-semibold">
                              Data
                            </div>}
                          />
                        </div>
                      )}
                      {props.row.original.execute_data && (
                        <div className="max-w-min bg-gray-100 dark:bg-gray-900 rounded-xl py-1.5 px-2.5">
                          <Copy
                            size={12}
                            text={props.row.original.execute_data}
                            copyTitle={<div className="uppercase text-gray-700 dark:text-gray-300 text-3xs font-semibold">
                              Execute Data
                            </div>}
                          />
                        </div>
                      )}
                    </div>
                  </>
                  :
                  <div className="skeleton w-52 h-5" />
              ),
            },
            {
              Header: 'Chain',
              accessor: 'chain',
              disableSortBy: true,
              Cell: props => {
                const chain = chains_data?.find(c => c.id === props.value)

                return !props.row.original.skeleton ?
                  props.value ?
                    <div className="min-w-max">
                      <div className="flex items-center space-x-2">
                        {chain?.image && (
                          <Img
                            src={chain.image}
                            alt=""
                            className="w-6 h-6 rounded-full"
                          />
                        )}
                        <span className="text-gray-700 dark:text-gray-300 text-xs font-medium">{chain ? null/*chainTitle(chain)*/ : props.value}</span>
                      </div>
                    </div>
                    :
                    <span className="text-gray-400 dark:text-gray-600 font-light">Unknown</span>
                  :
                  <div className="skeleton w-8 h-5" />
              },
            },
            {
              Header: 'Key ID',
              accessor: 'key_id',
              disableSortBy: true,
              Cell: props => (
                !props.row.original.skeleton ?
                  <div className="flex items-center text-gray-600 dark:text-gray-400 space-x-1.5">
                    <RiKeyFill size={16} />
                    <span className="font-mono text-xs font-medium">{props.value || 'Unknown'}</span>
                  </div>
                  :
                  <div className="skeleton w-32 h-5" />
              ),
            },
            {
              Header: 'Commands',
              accessor: 'commands',
              disableSortBy: true,
              Cell: props => {
                const chain = chains_data?.find(c => c.id === props.row.original.chain)

                return !props.row.original.skeleton ?
                  <div className="mb-6 mr-4">
                    {props.value?.length > 0 ?
                      <div className="flex flex-col space-y-2.5 mb-6">
                        {props.value.filter(_command => _command).map((_command, i) => {
                          const asset = assets_data?.find(a => a?.symbol?.toLowerCase() === _command.params?.symbol?.toLowerCase() || a?.contracts?.findIndex(c => c?.chain_id === chain?.chain_id && c.symbol?.toLowerCase() === _command.params?.symbol?.toLowerCase()) > -1)
                          const contract = asset?.contracts?.find(c => c.chain_id === chain?.chain_id)

                          return (
                            <div key={i} className="flex items-center space-x-2 -mt-1 -ml-1.5">
                              <div className="max-w-min bg-gray-100 dark:bg-gray-900 rounded-xl capitalize font-semibold py-1 px-2.5">
                                {_command.type}
                              </div>
                              {_command.params?.symbol && (
                                <div className="min-w-max max-w-min bg-gray-100 dark:bg-gray-900 rounded-2xl flex items-center justify-center sm:justify-end space-x-2 py-1 px-2.5">
                                  {asset?.image && (
                                    <Img
                                      src={asset.image}
                                      alt=""
                                      className="w-5 h-5 rounded-full"
                                    />
                                  )}
                                  <span className="flex items-center text-gray-700 dark:text-gray-300 text-sm font-semibold">
                                    {_command.params?.amount && (
                                      <span className="font-mono mr-1.5">
                                        {numberFormat(BigNumber(_command.params.amount).shiftedBy(-(contract?.contract_decimals || 6)).toNumber(), '0,0.00000000', true)}
                                      </span>
                                    )}
                                    <span className="normal-case">{_command.params?.symbol || asset?.symbol}</span>
                                  </span>
                                </div>
                              )}
                              {_command.params?.name && (
                                <div className="flex flex-col">
                                  <span className="font-semibold">{_command.params.name}</span>
                                  <div className="flex items-center space-x-1.5">
                                    {_command.params.decimals && (
                                      <span className="text-gray-400 dark:text-gray-600 text-xs">decimals: {numberFormat(_command.params.decimals, '0,0')}</span>
                                    )}
                                    {_command.params.cap && (
                                      <span className="text-gray-400 dark:text-gray-600 text-xs">cap: {numberFormat(_command.params.cap, '0,0')}</span>
                                    )}
                                  </div>
                                </div>
                              )}
                              {_command.params?.account ?
                                <>
                                  <BsArrowRightShort size={20} className="text-gray-800 dark:text-gray-200" />
                                  <div className="flex items-center space-x-1">
                                    <Copy
                                      text={_command.params.account}
                                      copyTitle={<span className="normal-case text-gray-700 dark:text-gray-300 text-2xs font-medium">
                                        {ellipseAddress(ens_data?.[_command.params.account.toLowerCase()]?.name || _command.params.account, 8)}
                                      </span>}
                                    />
                                    {chain?.explorer?.url && (
                                      <a
                                        href={`${chain.explorer.url}${chain.explorer.address_path?.replace('{address}', _command.params.account)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="min-w-max text-blue-600 dark:text-white"
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
                                _command.params?.salt ?
                                  <>
                                    <BsDash size={20} className="text-gray-800 dark:text-gray-200" />
                                    <div className="flex items-center space-x-1.5">
                                      <span className="font-semibold">Salt:</span>
                                      <Copy
                                        text={_command.params.salt}
                                        copyTitle={<span className="normal-case text-gray-700 dark:text-gray-300 text-xs font-medium">
                                          {ellipseAddress(_command.params.salt, 8)}
                                        </span>}
                                      />
                                    </div>
                                  </>
                                  :
                                  null
                              }
                              {_command.params?.newOwners && (
                                <div className="max-w-min bg-gray-100 dark:bg-gray-900 rounded-xl space-x-1 py-1 px-2.5">
                                  <span>{numberFormat(_command.params.newOwners.split(';').length, '0,0')}</span>
                                  <span className="font-semibold">New Owners</span>
                                </div>
                              )}
                              {_command.params?.newOperators && (
                                <div className="max-w-min bg-gray-100 dark:bg-gray-900 rounded-xl space-x-1 py-1 px-2.5">
                                  <span>{numberFormat(_command.params.newOperators.split(';').length, '0,0')}</span>
                                  <span className="font-semibold">New Operators</span>
                                </div>
                              )}
                              {_command.params?.newThreshold && (
                                <div className="flex items-center space-x-1.5">
                                  <span className="font-semibold">Threshold:</span>
                                  <span className="normal-case text-gray-700 dark:text-gray-300 text-xs font-medium">
                                    {numberFormat(_command.params.newThreshold, '0,0')}
                                  </span>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      :
                      <span className="text-gray-400 dark:text-gray-600 font-light">Unknown</span>
                    }
                  </div>
                  :
                  <div className="flex-col space-y-3 mb-6 mr-4">
                    {[...Array(3).keys()].map(i => (
                      <div key={i} className="skeleton w-60 h-5" />
                    ))}
                  </div>
              },
              headerClassName: 'mr-4',
            },
            {
              Header: 'Status',
              accessor: 'status',
              disableSortBy: true,
              Cell: props => (
                !props.row.original.skeleton ?
                  props.value ?
                    <>
                      <div className={`max-w-min ${['BATCHED_COMMANDS_STATUS_SIGNED'].includes(props.value) ? 'bg-green-500 dark:bg-green-600' : ['BATCHED_COMMANDS_STATUS_SIGNING'].includes(props.value) ? 'bg-blue-500 dark:bg-blue-600' : 'bg-red-500 dark:bg-red-600'} rounded-xl capitalize text-white font-semibold -mt-1 ml-auto py-1 px-2.5`}>
                        {_.last(props.value?.split('_'))}
                      </div>
                      {props.row.original.signature?.length > 0 && (
                        <div className="text-gray-400 dark:text-gray-500 text-xs font-light text-right space-x-1 mt-1 mb-4">
                          <span>{numberFormat(props.row.original.signature.length, '0,0')}</span>
                          <span>signature{props.row.original.signature.length > 1 ? 's' : ''}</span>
                        </div>
                      )}
                    </>
                    :
                    <div className="text-gray-400 dark:text-gray-600 font-light text-right">Unknown</div>
                  :
                  <div className="skeleton w-20 h-5 ml-auto" />
              ),
              headerClassName: 'justify-end text-right',
            },
            {
              Header: 'Time',
              accessor: 'created_at.ms',
              disableSortBy: true,
              Cell: props => (
                !props.row.original.skeleton ?
                  <Popover
                    placement="top"
                    title={<span className="normal-case">Time</span>}
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
          data={batchesData ?
            batchesData.data?.map((batch, i) => { return { ...batch, i } }) || []
            :
            [...Array(25).keys()].map(i => { return { i, skeleton: true } })
          }
          noPagination={!batchesData || batchesData.data?.length <= 10 ? true : false}
          defaultPageSize={25}
          className="min-h-full small no-border"
        />
        {batchesData && !(batchesData.data?.length > 0) && (
          <div className="bg-gray-100 dark:bg-gray-900 rounded-xl text-gray-300 dark:text-gray-500 text-base font-medium italic text-center my-4 py-4">
            No Batches Commands
          </div>
        )}
      </div>
    </div>
  )
}