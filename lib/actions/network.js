import {BadRequest, RequestTimeout} from 'http-errors'
import {createAction} from 'redux-actions'

import {lockUiWithError} from './'
import authenticatedFetch from '../utils/authenticated-fetch'
import messages from '../utils/messages'

const REQUEST_TIMEOUT_MS = 5 * 60 * 1000 // if things take more than 60s to save we have a problem

export const decrementOutstandingRequests = createAction('decrement outstanding requests')
export const incrementOutstandingRequests = createAction('increment outstanding requests')

function fetchAction ({
  url,
  options,
  retry
}) {
  return new Promise((resolve, reject) => {
    const timeoutid = setTimeout(() => {
      reject(new RequestTimeout())
    }, REQUEST_TIMEOUT_MS)
    authenticatedFetch(url, options, retry)
      .then((res) => {
        clearTimeout(timeoutid)
        if (res.ok) {
          resolve(res)
        } else {
          reject(new BadRequest(res.statusText), res)
        }
      })
      .catch((e) => {
        clearTimeout(timeoutid)
        reject(e)
      })
  })
}

export function serverAction ({
  next = false,
  onError = false,
  options,
  retry = false,
  url
}) {
  return [
    incrementOutstandingRequests(),
    fetchAction({url, options, retry})
      .then((res) => {
        const actions = [decrementOutstandingRequests()]
        if (next) actions.push(next(res))
        return actions
      })
      .catch((err, res) => {
        const actions = [decrementOutstandingRequests()]
        if (onError) {
          actions.push(onError(err, res))
        } else {
          actions.push(lockUiWithError({
            error: messages.network.error,
            detailMessage: err.message
          }))
        }
        return actions
      })
  ]
}
