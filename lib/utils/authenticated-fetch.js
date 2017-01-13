import dbg from 'debug'
import fetch from 'isomorphic-fetch'

import timeout from './timeout'
import store from '../store' // TODO: don't import store from anywhere but the root/bootstrap

/** How often to retry 202 response from the server */
const RETRY_TIMEOUT_MILLISECONDS = 10 * 1000

const debug = dbg('scenario-editor:authenticated-fetch')

export default async function authenticatedFetch (url, options = {}, retry = false) {
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
      await timeout(RETRY_TIMEOUT_MILLISECONDS)
      return authenticatedFetch(url, options, retry)
    }
    return response
  } catch (error) {
    debug(`${method} ${baseurl} error ${error.message}`)
    throw error
  }
}

/**
 * Use an XMLHttpRequest to make an authenticated request, with a progress callback. Wrap in a promise
 * Will resolve with { status, statusText, response } upon success. Response is decoded as JSON.
 */
export function authenticatedXhr (url, { method, body, progressCallback }) {
  const xhr = new window.XMLHttpRequest()
  xhr.responseType = 'text' // parse the JSON ourselves

  // add listeners
  if (progressCallback) xhr.upload.addEventListener('progress', progressCallback)
  const promise = new Promise((resolve, reject) => {
    xhr.addEventListener('load', (e) => resolve({
      status: xhr.status,
      statusText: xhr.statusText,
      response: JSON.parse(xhr.response)
    }))

    xhr.addEventListener('abort', reject)
    xhr.addEventListener('error', reject)
    xhr.addEventListener('timeout', reject)
  })

  xhr.open(method, url)

  const state = store.getState()
  if (state.user && state.user.idToken) {
    xhr.setRequestHeader('Authorization', `bearer ${state.user.idToken}`)
  }

  xhr.send(body)

  return promise
}

export function parseJSON (res) {
  if (res.ok) {
    return res.json()
  } else {
    window.alert(res.statusText)
    throw new Error(res.statusText)
  }
}
