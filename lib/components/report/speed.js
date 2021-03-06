/** render speed in appropriate units */

import React from 'react'

import {pure} from '../deep-equal'
import messages from '../../utils/messages'

/** conversions from km/h to appropriate units */
const conversions = {
  kmh: 1,
  mph: 1 / 1.609,
  ff: 4.907 * 24 * 14 // furlongs per fortnight
}

export default pure(function Speed ({ kmh, units = ['kmh', 'mph'] }) {
  const main = `${Math.round(kmh * conversions[units[0]] * 10) / 10} ${messages.report.units[units[0]]}`

  const addl = units.slice(1).map(unit => `${Math.round(kmh * conversions[unit] * 10) / 10} ${messages.report.units[unit]}`).join(',')

  return <span>{`${main} (${addl})`}</span>
})
