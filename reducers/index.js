import { combineReducers } from 'redux'

import preferences from './preferences'
import chains from './chains'
import cosmos_chains from './cosmos-chains'
import assets from './assets'
import status from './status'
import ens from './ens'
import validators from './validators'

export default combineReducers({
  preferences,
  chains,
  cosmos_chains,
  assets,
  status,
  ens,
  validators,
})