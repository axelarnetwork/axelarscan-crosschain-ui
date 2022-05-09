import { useRouter } from 'next/router'

import Account from '../components/account'

import { isMatchRoute } from '../lib/routes'

export default function Index() {
  const router = useRouter()
  const { pathname, asPath } = { ...router }
  const _asPath = asPath.includes('?') ? asPath.substring(0, asPath.indexOf('?')) : asPath

  if (typeof window !== 'undefined' && pathname !== _asPath) {
    router.push(isMatchRoute(_asPath) ? asPath : '/')
  }

  if (typeof window === 'undefined' || pathname !== _asPath) {
    return (
      <span className="min-h-screen" />
    )
  }

  return (
    <>
      <div className="max-w-full mx-auto">
        <Account />
      </div>
      <div className="dark:bg-black dark:bg-blue-500 dark:bg-yellow-500 dark:bg-green-400 dark:bg-green-600 dark:bg-red-700 dark:bg-gray-700 text-red-500 text-green-500 w-48 sm:w-80 xl:w-80 xl:w-96" />
    </>
  )
}