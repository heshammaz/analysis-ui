/* global describe, expect, it */

import * as analysis from '../'

describe('actions > analysis', () => {
  it('clearIsochroneResults should work', () => {
    expect(analysis.clearIsochroneResults()).toMatchSnapshot()
  })

  it('setIsochroneCutoff should work', () => {
    expect(analysis.setIsochroneCutoff()).toMatchSnapshot()
  })

  it('setIsochroneFetchStatus should work', () => {
    expect(analysis.setIsochroneFetchStatus()).toMatchSnapshot()
  })

  it('setIsochroneLatLng should work', () => {
    expect(analysis.setIsochroneLatLng({ lat: 12, lon: 34 })).toMatchSnapshot()
  })

  it('setIsochroneResults should work', () => {
    expect(analysis.setIsochroneResults()).toMatchSnapshot()
  })

  it('fetchIsochrone should resolve error', (done) => {
    const actionArgs = {
      scenarioId: '1',
      bundleId: '1',
      modifications: [],
      isochroneCutoff: 1,
      origin: 1
    }
    const actionResults = analysis.fetchIsochrone(actionArgs)
    actionResults[2].catch((err) => {
      expect(err).toMatchSnapshot()
      done()
    })
  })

  /* Not sure how this thing works
  it('fetchIsochrone should work', (done) => {
    const actionArgs = {
      scenarioId: '1',
      bundleId: '1',
      modifications: [],
      isochroneCutoff: 1,
      origin: 1
    }
    setGrids([])
    const actionResults = analysis.fetchIsochrone(actionArgs)
    expect(actionResults.slice(0, 2)).toMatchSnapshot()
    console.log(actionResults[2])
    actionResults[2].then((result) => {
      console.log('resolved')
      expect(result).toMatchSnapshot()
      done()
    })
  })
  */
})