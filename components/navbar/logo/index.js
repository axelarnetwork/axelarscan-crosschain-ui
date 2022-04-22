import Link from 'next/link'
import { useSelector, shallowEqual } from 'react-redux'

import { Img } from 'react-image'

export default function Logo() {
  const { status } = useSelector(state => ({ status: state.status }), shallowEqual)
  const { status_data } = { ...status }

  return (
    <div className="logo ml-2.5 mr-1 sm:mx-3">
      <Link href="/">
        <a className="w-full flex items-center">
          <div className="min-w-max sm:mr-3">
            <Img
              src="/logos/logo.png"
              alt=""
              className="block dark:hidden w-8 h-8"
            />
            <Img
              src="/logos/logo_white.png"
              alt=""
              className="hidden dark:block w-8 h-8"
            />
          </div>
          <div className="hidden sm:block lg:block xl:block">
            {/*<div className="normal-case text-base font-semibold">{process.env.NEXT_PUBLIC_APP_NAME}</div>*/}
            <div className="flex items-center space-x-1.5">
              <div className="whitespace-nowrap normal-case text-sm font-semibold">{process.env.NEXT_PUBLIC_APP_NAME}</div>
              <div className="bg-gray-100 dark:bg-gray-900 rounded-xl text-xs font-medium py-0.5 px-2">Beta</div>
            </div>
            {status_data?.chain_id && (
              <div className="whitespace-nowrap font-mono text-gray-400 dark:text-gray-500 text-xs">{status_data.chain_id}</div>
            )}
          </div>
        </a>
      </Link>
    </div>
  )
}