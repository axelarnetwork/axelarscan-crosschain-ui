import Link from 'next/link'
import { useRouter } from 'next/router'

import { TiArrowRight } from 'react-icons/ti'

import { navigations } from '../../../lib/menus'

export default function Navigation() {
  const router = useRouter()
  const { pathname, query } = { ...router }

  return (
    <div className="hidden lg:flex items-center space-x-0 lg:space-x-2 mx-auto xl:ml-20">
      {navigations.filter(item => item?.path).map((item, i) => {
        const className = `${item.disabled ? 'cursor-not-allowed' : ''} bg-transparent hover:bg-gray-100 dark:hover:bg-gray-900 rounded-xl flex items-center uppercase text-xs xl:text-sm p-2 ${pathname === item.path || item.nav_keys?.includes(pathname) ? 'text-gray-900 hover:text-gray-800 dark:text-gray-50 dark:hover:text-gray-100 font-bold' : 'text-gray-800 hover:text-gray-900 dark:text-gray-100 dark:hover:text-white font-medium'}`

        let path = item.path
        const params = Object.keys(query || {})

        if (!item.use_path && item.nav_keys?.length > 0 && params?.length > 0) {
          for (let i = 0; i < item.nav_keys.length; i++) {
            let _path = item.nav_keys[i]

            let found = false
            let param = params.find(p => _path.includes(`[${p}]`))

            while (param) {
              _path = _path.replace(`[${param}]`, query[param])
              found = true
              param = params.find(p => _path.includes(`[${p}]`))
            }

            if (found) {
              path = _path
              break
            }
          }
        }

        return item.external ?
          <a key={i} href={item.path} target="_blank" rel="noopener noreferrer" className={className}>
            {item.icon}
            <span className="whitespace-nowrap">{item.title}</span>
            <TiArrowRight size={20} className="transform -rotate-45" />
          </a>
          :
          item.disabled ?
            <div key={i} title="Not available yet" className={className}>
              {item.icon}
              <span className="whitespace-nowrap">{item.title}</span>
            </div>
            :
            <Link key={i} href={path}>
              <a className={className}>
                {item.icon}
                <span className="whitespace-nowrap">{item.title}</span>
              </a>
            </Link>
      })}
    </div>
  )
}