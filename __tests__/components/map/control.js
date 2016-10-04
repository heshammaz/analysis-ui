/* global describe, it, expect, jest */

import React from 'react'
import renderer from 'react-test-renderer'

jest.mock('react-dom')

import Control from '../../../lib/components/map/control'

describe('Map > Control', () => {
  it('renders correctly', () => {
    const props = {
      addIsochroneLayerToMap: jest.fn(),
      center: {
        lat: 38.898,
        lon: -77.015
      },
      fetchIsochrone: jest.fn(),
      geocoderApiKey: 'MAPZEN_SEARCH_KEY',
      isochroneCutoff: 3600,
      isFetchingIsochrone: false,
      isShowingIsochrone: false,
      removeIsochroneLayerFromMap: jest.fn(),
      setIsochroneCutoff: jest.fn()
    }

    const tree = renderer.create(
      <Control
        {...props}
        />
    ).toJSON()
    expect(tree).toMatchSnapshot()
  })
})
