import { useState, useEffect } from 'react'
import { useSelector, shallowEqual } from 'react-redux'

import _ from 'lodash'
import { VscFilterFilled, VscFilter } from 'react-icons/vsc'

import Modal from '../modals/modal-confirm'

export default function TransactionsFilter({ applied = false, disabled = false, initialFilter, updateFilter }) {
  const { chains, cosmos_chains, assets } = useSelector(state => ({ chains: state.chains, cosmos_chains: state.cosmos_chains, assets: state.assets }), shallowEqual)
  const { chains_data } = { ...chains }
  const { cosmos_chains_data } = { ...cosmos_chains }
  const { assets_data } = { ...assets }

  const [filter, setFilter] = useState(initialFilter)

  const axelarChain = cosmos_chains_data?.find(c => c.id === 'axelarnet')

  const items = [
    {
      label: 'Transaction ID',
      name: 'tx_id',
      type: 'text',
      placeholder: `${axelarChain?.short_name} / EVMs transaction ID`,
    },
    {
      label: 'From Chain',
      name: 'from_chain',
      type: 'select',
      placeholder: 'Select sending chain',
      options: _.concat({ value: '', title: 'All Chains' }, cosmos_chains_data?.map(c => { return { value: c.id, title: c.title } }) || [], chains_data?.map(c => { return { value: c.id, title: c.title } }) || []),
    },
    {
      label: 'To Chain',
      name: 'to_chain',
      type: 'select',
      placeholder: 'Select receiving chain',
      options: _.concat({ value: '', title: 'All Chains' }, cosmos_chains_data?.map(c => { return { value: c.id, title: c.title } }) || [], chains_data?.map(c => { return { value: c.id, title: c.title } }) || []),
    },
    {
      label: 'Token',
      name: 'denom',
      type: 'select',
      placeholder: 'Select token',
      options: _.concat({ value: '', title: 'All Tokens' }, assets_data?.map(a => { return { value: a?.id, title: a?.symbol } }) || []),
    },
    {
      label: 'Status',
      name: 'status',
      type: 'select',
      placeholder: 'Select transaction status',
      options: [
        { value: '', title: 'Any' },
        { value: 'unconfirmed', title: 'Unconfirmed' },
        { value: 'waiting_vote', title: 'Waiting for Votes' },
        { value: 'waiting_batch', title: 'Waiting for Batch' },
        { value: 'waiting_gateway', title: 'Waiting for Gateway' },
        { value: 'success', title: 'Success' },
      ],
    },
  ]

  useEffect(() => {
    setFilter(initialFilter)
  }, [initialFilter])

  return (
    <Modal
      disabled={disabled}
      buttonTitle={<>
        {applied ?
          <VscFilterFilled size={20} />
          :
          <VscFilter size={20} />
        }
        <span>Filter{applied && 'ed'}</span>
      </>}
      buttonClassName={`${applied ? 'bg-indigo-600 dark:bg-indigo-600 text-white font-semibold' : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-900 dark:hover:bg-gray-800 text-gray-700 hover:text-black dark:text-gray-300 dark:hover:text-white'} rounded-3xl shadow flex items-center justify-center text-base space-x-1.5 py-1.5 px-3`}
      title="Transactions Filter"
      body={<div className="form mt-2 -mb-3">
        {items.map((item, i) => (
          <div key={i} className="form-element">
            {item.label && (
              <div className="form-label text-gray-600 dark:text-gray-400 font-medium">{item.label}</div>
            )}
            {item.type === 'select' ?
              <select
                placeholder={item.placeholder}
                value={filter?.[item.name]}
                onChange={e => {
                  let value = e.target.value

                  const _filter = { ...filter, [`${item.name}`]: value }

                  // if (![axelarChain?.id].includes(value)) {
                  //   if (value) {
                  //     if (item.name === 'from_chain' && ![axelarChain?.id].includes(_filter.to_chain)) {
                  //       _filter.to_chain = axelarChain?.id
                  //     }
                  //     else if (item.name === 'to_chain' && ![axelarChain?.id].includes(_filter.from_chain)) {
                  //       _filter.from_chain = axelarChain?.id
                  //     }
                  //   }
                  //   else {
                  //     if (item.name === 'from_chain' && ![axelarChain?.id].includes(_filter.to_chain)) {
                  //       _filter.to_chain = ''
                  //     }
                  //     else if (item.name === 'to_chain' && ![axelarChain?.id].includes(_filter.from_chain)) {
                  //       _filter.from_chain = ''
                  //     }
                  //   }
                  // }
                  // else {
                  //   if (item.name === 'from_chain') {
                  //     _filter.to_chain = ''
                  //   }
                  //   else if (item.name === 'to_chain') {
                  //     _filter.from_chain = ''
                  //   }
                  // }

                  setFilter(_filter)
                }}
                className="form-select bg-gray-50 border-0 focus:ring-gray-200 dark:focus:ring-gray-700 rounded-lg"
              >
                {item.options?.map((option, i) => (
                  <option
                    key={i}
                    value={option.value}
                  >
                    {option.title}
                  </option>
                ))}
              </select>
              :
              <input
                type={item.type}
                placeholder={item.placeholder}
                value={filter?.[item.name]}
                onChange={e => setFilter({ ...filter, [`${item.name}`]: e.target.value })}
                className="form-input dark:border-0 focus:ring-gray-200 dark:focus:ring-gray-700 rounded-lg"
              />
            }
          </div>
        ))}
      </div>}
      onCancel={() => setFilter(initialFilter)}
      confirmButtonTitle="Search"
      onConfirm={() => {
        if (updateFilter) {
          updateFilter(filter)
        }
      }}
    />
  )
}