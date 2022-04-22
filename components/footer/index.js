import { useSelector, shallowEqual } from 'react-redux'

import moment from 'moment'
import { FaHeart, FaDiscord } from 'react-icons/fa'
import { BsTwitter, BsTelegram, BsGithub } from 'react-icons/bs'

export default function Footer() {
  const { preferences } = useSelector(state => ({ preferences: state.preferences }), shallowEqual)
  const { theme } = { ...preferences }

  return (
    <div className={`footer flex flex-col md:flex-row items-center text-xs font-light space-y-2 sm:space-y-0 p-3 ${theme}`}>
      <span className="w-full md:w-1/2 lg:w-1/3 flex items-center justify-center md:justify-start text-gray-400 space-x-2">
        {process.env.NEXT_PUBLIC_TWITTER_USERNAME && (
          <a
            href={`https://twitter.com/${process.env.NEXT_PUBLIC_TWITTER_USERNAME}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BsTwitter className="text-blue-400 dark:text-white text-base" />
          </a>
        )}
        {process.env.NEXT_PUBLIC_TELEGRAM_USERNAME && (
          <a
            href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_USERNAME}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BsTelegram className="text-blue-500 dark:text-white text-base" />
          </a>
        )}
        {process.env.NEXT_PUBLIC_DISCORD_URL && (
          <a
            href={process.env.NEXT_PUBLIC_DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FaDiscord className="text-blue-600 dark:text-white text-base" />
          </a>
        )}
        {process.env.NEXT_PUBLIC_GITHUB_URL && (
          <a
            href={process.env.NEXT_PUBLIC_GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BsGithub className="text-black dark:text-white text-base" />
          </a>
        )}
      </span>
      <span className="hidden lg:flex w-full lg:w-1/3 items-center justify-center text-gray-400">
      </span>
      <span className="w-full md:w-1/2 lg:w-1/3 flex items-center justify-center md:justify-end text-gray-400 space-x-1">
        <span>© {moment().format('YYYY')} made with</span>
        <FaHeart className="text-red-400 text-xl pr-0.5" />
        <span>
          {"by "}
          <a
            href={process.env.NEXT_PUBLIC_TEAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 dark:text-white font-semibold"
          >
            {process.env.NEXT_PUBLIC_TEAM_NAME}
          </a>
          {" team."}
        </span>
      </span>
    </div>
  )
}