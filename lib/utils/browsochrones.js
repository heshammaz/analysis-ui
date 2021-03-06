/** Handle interactions with Browsochrones and the cluster */

import Browsochrones, {createGrid} from 'browsochrones'
import {crc32} from 'crc'
import dbg from 'debug'
import uuid from 'uuid'
import isEqual from 'lodash.isequal'

import convertToR5Modification from './convert-to-r5-modification'
import authenticatedFetch from './authenticated-fetch'

const debug = dbg('scenario-editor:browsochrones')

const LOADING_GRID = 'LOADING_GRID'
const APPLYING_SCENARIO = 'APPLYING_SCENARIO'
const PERFORMING_ANALYSIS = 'PERFORMING_ANALYSIS'
const COMPUTING_ISOCHRONE = 'COMPUTING_ISOCHRONE'
const INITIALIZING_CLUSTER = 'INITIALIZING_CLUSTER'

export const status = {
  LOADING_GRID,
  APPLYING_SCENARIO,
  PERFORMING_ANALYSIS,
  COMPUTING_ISOCHRONE,
  INITIALIZING_CLUSTER
}

/**
 * Higher priority statuses first.
 * When performing a comparison, we show the status that appears earlier in this list.
 */
export const statusByPriority = [
  INITIALIZING_CLUSTER, // if either is initializing we should show that as it can take forever
  LOADING_GRID,
  APPLYING_SCENARIO,
  PERFORMING_ANALYSIS,
  COMPUTING_ISOCHRONE
]

function assert (value, msg) {
  if (!value) throw new Error(msg)
}

const resType = {
  JSON: 'JSON',
  ARRAY_BUFFER: 'ARRAY_BUFFER'
}

const handleResponse = (type) => async (res) => {
  if (res.status === 400) {
    // scenario application error, wait for JSON then throw error
    throw new ScenarioApplicationError(await res.json())
  } else if (!res.ok) {
    console.log(res.statusText)
    throw new AnalysisError(res.status, res.statusText, await res.text())
  } else {
    switch (type) {
      case resType.ARRAY_BUFFER:
        return res.arrayBuffer()
      case resType.JSON:
      default:
        return res.json()
    }
  }
}

// Map from scenario ID to object containing Browsochrones instance, hash of last used scenario
// x, y coords of origin
const instances = new Map()

// Grids are shared among all Browsochrones instances
// array should contain { name, grid }
let grids

/** { name: <Browsochrones grid object>}, TODO combine with grids, don't build these in every thread */
const processedGrids = new Map()

/** get a new Browsochrones instance with grids already loaded */
async function createInstanceAndPutGrids (grids) {
  assert(grids, 'Grids must be loaded to create a Browsochrones instance.')
  debug('no browsochrones instance for current scenario, creating one and loading grids')
  const browsochrones = new Browsochrones()
  await Promise.all(grids.map(({ grid, name }) => browsochrones.putGrid(name, grid)))
  debug('created browsochrones instance for scenario')
  return browsochrones
}

/** Ensure a grid has been loaded */
async function ensureGridLoaded (projectId, indicator, updateStatus) {
  if (!processedGrids.has(indicator)) {
    updateStatus(LOADING_GRID)
    const grid = await authenticatedFetch(`/api/grid/${projectId}/${indicator}`)
      .then(res => res.arrayBuffer())

    // put it in all instances
    const promises = []
    // Map does not have .map or .forEach
    for (const [, instance] of instances) {
      promises.push(instance.browsochrones.putGrid(indicator, grid))
    }
    await Promise.all(promises)

    // do this last to avoid race conditions where it's in processedGrids but hasn't hit the instances
    grids.push({ name: indicator, grid })
    processedGrids.set(indicator, createGrid(grid.slice(0)))
  }
}

/**
 * Get an R5 profile request for a scenario.
 * TODO we need to add a lot more options to this function (date, time, worker version)
 */
function getStaticSiteRequest ({ modifications, bundleId, scenarioUniqueId, workerVersion, profileRequest }) {
  return {
    transportNetworkId: bundleId, // TODO is this necessary?
    workerVersion,
    bucket: null, // don't save to S3
    jobId: uuid.v4(),
    request: {
      ...profileRequest,
      scenario: {
        id: scenarioUniqueId,
        modifications: modifications.map(convertToR5Modification)
      }
    }
  }
}

/** Make sure a scenario is loaded and we are ready to generate isochrones, paths, etc. with Browsochrones */
async function ensureScenarioLoadedForInstance ({
  bundleId,
  instance,
  modifications,
  scenarioId,
  workerVersion,
  profileRequest,
  updateStatus
}) {
  // hash the modifications to detect any changes that have taken place
  const scenarioHash = crc32(JSON.stringify(modifications))

  // Maybe one day we'll check if anything relevant (the street network) has changed,
  // that would be a performance win
  if (scenarioHash !== instance.scenarioHash || workerVersion !== instance.workerVersion) {
    debug(`scenario ${scenarioId} has changed, updating browsochrones`)
    updateStatus(APPLYING_SCENARIO)
    const scenarioUniqueId = `${scenarioId}-${scenarioHash}`
    const request = getStaticSiteRequest({ modifications, bundleId, scenarioUniqueId, workerVersion, profileRequest })
    // TODO don't duplicate these fields
    const { jobId } = request
    const body = {
      request,
      graphId: bundleId,
      workerVersion,
      jobId
    }

    const metadata = await authenticatedFetch('/api/analysis/enqueue/single', {
      method: 'POST',
      body: JSON.stringify({ ...body, type: 'static-metadata' })
    }, () => updateStatus(INITIALIZING_CLUSTER)).then(handleResponse(resType.JSON))

    // technically we shouldn't need to retry here as the worker is started once the above request
    // succeeds, but why not.
    const stopTrees = await authenticatedFetch('/api/analysis/enqueue/single', {
      method: 'POST',
      body: JSON.stringify({ ...body, type: 'static-stop-trees' })
    }, true).then(handleResponse(resType.ARRAY_BUFFER))

    const { browsochrones } = instance

    await Promise.all([
      browsochrones.setQuery(metadata),
      browsochrones.setStopTrees(stopTrees),
      browsochrones.setTransitiveNetwork(metadata.transitive) // TODO shouldn't have to do this.
    ])

    instance.staticSiteRequest = request
    instance.scenarioHash = scenarioHash
    instance.scenarioApplicationWarnings = metadata.scenarioApplicationWarnings
    instance.workerVersion = workerVersion
    instance.origin = { x: -1, y: -1 }

    instance.indicator = instance.spectrogramData = null

    debug(`(re-)loaded scenario ${scenarioId}`)
  }

  return instance
}

/**
 * Ensure that an origin is loaded and a surface has been generated.
 * Assumes that the proper scenario/stop trees have been loaded with ensureScenarioLoaded
 */
async function ensureOriginLoadedForInstance ({
  instance,
  indicator,
  origin,
  profileRequest,
  updateStatus
}) {
  // preserve existing scenario, which has a unique ID that has a hash added
  profileRequest = { ...profileRequest, scenario: instance.staticSiteRequest.request.scenario }
  const {x, y} = instance.browsochrones.latLonToOriginPoint(origin)
  if (!instance.origin || instance.origin.x !== x || instance.origin.y !== y ||
    // if the profile request params have changed, run a new request
    // TODO sometimes this should be considered a new scenario, e.g. when changing walk speed
    instance.indicator !== indicator || !isEqual(profileRequest, instance.staticSiteRequest.request)) {
    debug(`fetching origin (${x}, ${y}) for scenario ${instance.scenarioHash}`)
    updateStatus(PERFORMING_ANALYSIS)

    // TODO don't duplicate these fields
    const { workerVersion, jobId, transportNetworkId } = instance.staticSiteRequest
    const body = {
      request: {
        ...instance.staticSiteRequest,
        request: profileRequest
      },
      graphId: transportNetworkId,
      workerVersion,
      jobId,
      x,
      y,
      type: 'static'
    }

    // always possible that the worker has died in the meantime, use retryFetch
    const origin = await authenticatedFetch('/api/analysis/enqueue/single', {
      method: 'POST',
      body: JSON.stringify(body)
    }, () => updateStatus(INITIALIZING_CLUSTER)).then(handleResponse(resType.ARRAY_BUFFER))

    await instance.browsochrones.setOrigin(origin, { x, y })
    // overwrite things like the date so that they are equal when changing cutoff
    instance.staticSiteRequest.request = profileRequest
    const { spectrogramData } = await instance.browsochrones.generateSurface(indicator, 'AVERAGE')
    instance.origin = { x, y }
    instance.indicator = indicator
    instance.spectrogramData = spectrogramData
  }

  return instance
}

/** Get isochrones and accessibility numbers for a scenario and a given cutoff. Modifications is in scenario-editor format. */
export async function getIsochronesAndAccessibility ({
  bundleId,
  projectId,
  indicator,
  isochroneCutoff,
  modifications,
  origin,
  scenarioId,
  workerVersion,
  profileRequest,
  updateStatus = (status) => {} // don't require null checks in the program
}) {
  await ensureGridLoaded(projectId, indicator, updateStatus)

  const instance = instances.has(scenarioId)
    ? instances.get(scenarioId)
    : {browsochrones: await createInstanceAndPutGrids(grids)}
  instances.set(scenarioId, instance)

  try {
    await ensureScenarioLoadedForInstance({bundleId, grids, instance, modifications, scenarioId, workerVersion, profileRequest, updateStatus})
    await ensureOriginLoadedForInstance({instance, origin, indicator, profileRequest, updateStatus})
  } catch (e) {
    console.log(e)
    throw e // rethrow to caller
  }
  const {browsochrones, spectrogramData, scenarioApplicationWarnings} = instance

  // return the grid for map display
  const grid = processedGrids.get(indicator)

  return {
    // I don't believe parallelizing will help, they will be run in the same worker thread
    isochrone: await browsochrones.getIsochrone(isochroneCutoff, false),
    accessibility: await browsochrones.getAccessibilityForGrid(indicator, isochroneCutoff),
    spectrogramData,
    indicator,
    grid,
    isochroneCutoff,
    scenarioApplicationWarnings
  }
}

/** clear all browsochrones instances when changing projects */
export function clear () {
  instances.clear()
  grids = []
  processedGrids.clear()
}

/**
 * This is thrown when there is an error applying the scenario.
 * One might naïvely think this should be a subclass of Error, but if we do that instanceof
 * does not work so we can't verify where it is caught that it is indeed a scenario application
 * error and not some other kind of error (gateway timeout due to stalled cluster, for example).
 */
export class ScenarioApplicationError {
  constructor (errors) {
    this.errors = errors
  }
}

/** Thrown when there is a backend error that the user is not responsible for */
export class AnalysisError {
  constructor (status, statusText, errorText) {
    this.status = status
    this.statusText = statusText
    this.errorText = errorText
  }
}
