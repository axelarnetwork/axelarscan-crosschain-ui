const routes = [
  { pathname: '/' },
  { pathname: '/account/[address]' },
  { pathname: '/transactions' },
  { pathname: '/tx/[tx]' },
  { pathname: '/batches' },
  { pathname: '/batch/[chain]/[id]' },
  { pathname: '/key-rotations' },
]

export const isMatchRoute = pathname => {
  return routes.findIndex((route, i) => {
    if (route.pathname === pathname) {
      return true
    }
    else if (route.pathname.split('/').filter(path => path).length === pathname.split('/').filter(path => path).length) {
      const routePathnameSplit = route.pathname.split('/').filter(path => path)
      const pathnameSplit = pathname.split('/').filter(path => path)

      return routePathnameSplit.findIndex((path, j) => !(path.startsWith('[') && path.endsWith(']')) && path !== pathnameSplit[j]) > -1 ? false : true
    }
    else {
      return false
    }
  }) > -1
}