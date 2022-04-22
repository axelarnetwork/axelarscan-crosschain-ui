import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { useSelector, useDispatch, shallowEqual } from 'react-redux'

import { FiMenu, FiMoon, FiSun } from 'react-icons/fi'
import { TiArrowRight } from 'react-icons/ti'

import Logo from './logo'
import DropdownNavigation from './navigation/dropdown'
import Navigation from './navigation'
import Search from './search'
import Network from './network'

import { chains as getChains, assets as getAssets } from '../../lib/api/config'
import { status } from '../../lib/api/rpc'
import { allValidators } from '../../lib/api/cosmos'

import { THEME, CHAINS_DATA, COSMOS_CHAINS_DATA, ASSETS_DATA, STATUS_DATA, VALIDATORS_DATA } from '../../reducers/types'

export default function Navbar() {
  const dispatch = useDispatch()
  const { preferences, assets } = useSelector(state => ({ preferences: state.preferences, assets: state.assets }), shallowEqual)
  const { theme } = { ...preferences }
  const { assets_data } = { ...assets }

  const router = useRouter()
  const { pathname } = { ...router }

  useEffect(() => {
    const getData = async () => {
      const response = await getChains()
      if (response) {
        dispatch({
          type: CHAINS_DATA,
          value: response.evm,
        })

        dispatch({
          type: COSMOS_CHAINS_DATA,
          value: response.cosmos,
        })
      }
    }

    getData()
  }, [])

  useEffect(() => {
    const getData = async () => {
      const response = await getAssets()
      if (response) {
        dispatch({
          type: ASSETS_DATA,
          value: response,
        })
      }
    }

    getData()
  }, [])

  useEffect(() => {
    const getData = async () => {
      const response = await status()
      if (response) {
        dispatch({
          type: STATUS_DATA,
          value: response,
        })
      }
    }

    getData()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    const getData = async () => {
      if (assets_data) {
        if (!controller.signal.aborted) {
          let response

          switch (pathname) {
            case '/tx/[tx]':
              response = await allValidators(null, assets_data)
              
              if (response) {
                dispatch({
                  type: VALIDATORS_DATA,
                  value: response?.data || [],
                })
              }
              break
            default:
              break
          }

          if (response) {
            dispatch({
              type: VALIDATORS_DATA,
              value: response?.data || [],
            })
          }
        }
      }
    }

    getData()

    const interval = setInterval(() => getData(), 5 * 60 * 1000)
    return () => {
      controller?.abort()
      clearInterval(interval)
    }
  }, [assets_data, pathname])

  return (
    <div className="navbar border-b">
      <div className="navbar-inner w-full flex items-center">
        <Logo />
        <DropdownNavigation />
        <Navigation />
        <div className="flex items-center ml-auto">
          {!['/'].includes(pathname) && (<Search />)}
          <Network />
          <button
            onClick={() => {
              dispatch({
                type: THEME,
                value: theme === 'light' ? 'dark' : 'light',
              })
            }}
            className="w-10 sm:w-12 h-16 btn-transparent flex items-center justify-center"
          >
            <div className="w-6 h-6 flex items-center justify-center">
              {theme === 'light' ? (
                <FiMoon size={16} />
              ) : (
                <FiSun size={16} />
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}