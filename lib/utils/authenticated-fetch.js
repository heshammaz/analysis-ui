import dbg from 'debug'
import fetch from 'isomorphic-fetch'

import timeout from './timeout'
import store from '../store' // TODO: don't import store from anywhere but the root/bootstrap

/** How often to retry 202 response from the server */
const RETRY_TIMEOUT_MILLISECONDS = 10 * 1000

const debug = dbg('scenario-editor:authenticated-fetch')

/**
 * When retry = true, 202 responses will cause the fetch to be retried, and retryCallback will be
 * called with the 202 response
 */
export default async function authenticatedFetch (
  url,
  options = {},
  retry = false,
  retryCallback = null
) {
  if (process.env.NODE_ENV === 'test') {
    url = `http://mockhost.com${url}`
  }
  const method = options.method || 'get'
  const baseurl = url.split('?')[0]
  debug(`${method} ${baseurl}`)
  const headers = options.headers || {}
  const state = store.getState()
  if (state.user && state.user.idToken) {
    headers.Authorization = `bearer ${state.user.idToken}`
  }
  try {
    const response = await fetch(url, Object.assign({}, options, {headers}))
    debug(`${method} ${baseurl} is ${response.status} ${response.statusText}`)
    if (retry && response.status === 202) {
      if (retryCallback) retryCallback(response)
      await timeout(RETRY_TIMEOUT_MILLISECONDS)
      return authenticatedFetch(url, options, retry)
    }
    return response
  } catch (error) {
    debug(`${method} ${baseurl} error ${error.message}`)
    throw error
  }
}

export function parseJSON (res) {
  if (res.ok) {
    return res.json()
  } else {
    window.alert(res.statusText)
    throw new Error(res.statusText)
  }
}
