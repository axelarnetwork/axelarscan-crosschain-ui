import { BsWallet2 } from 'react-icons/bs'
import { BiFileBlank } from 'react-icons/bi'
import { RiFileSearchLine, RiStackLine, RiRadioButtonLine } from 'react-icons/ri'
import { HiCode } from 'react-icons/hi'

export const navigations = [
  {
    id: 'account',
    title: 'Account',
    icon: <BsWallet2 size={20} className="mb-0.5 mr-1.5" />,
    path: '/',
    nav_keys: ['/account/[address]'],
  },
  {
    id: 'transactions',
    title: 'Transactions',
    icon: <BiFileBlank size={20} className="mb-0.5 mr-0.5" />,
    path: '/transactions',
    nav_keys: ['/tx/[tx]'],
    use_path: true,
  },
  {
    id: 'batches',
    title: 'Batches',
    icon: <RiStackLine size={20} className="mb-0.5 mr-1.5" />,
    path: '/batches',
    nav_keys: ['/batch/[chain]/[id]'],
    use_path: true,
  },
  {
    id: 'explorer',
    title: 'Explorer',
    icon: <RiFileSearchLine size={20} className="mb-0.5 mr-1.5" />,
    path: process.env.NEXT_PUBLIC_EXPLORER_URL,
    external: true,
  },
]

export const networks = [
  {
    id: 'mainnet',
    title: 'Mainnet',
    icon: <RiRadioButtonLine size={20} className="stroke-current" />,
    url: process.env.NEXT_PUBLIC_SITE_URL?.replace('testnet.', ''),
  },
  {
    id: 'testnet',
    title: 'Testnet',
    icon: <HiCode size={20} className="stroke-current" />,
    url: process.env.NEXT_PUBLIC_SITE_URL?.replace('staging.', '').replace('://', `://${process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? 'testnet.' : ''}`),
  },
]