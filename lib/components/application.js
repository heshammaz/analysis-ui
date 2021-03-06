import lonlat from '@conveyal/lonlat'
import {latLngBounds, Browser} from 'leaflet'
import React, {Component, PropTypes} from 'react'
import {Map as LeafletMap, TileLayer} from 'react-leaflet'
import {Link} from 'react-router'
import {sprintf} from 'sprintf-js'

import {authIsRequired} from '../utils/auth0'
import {Button} from './buttons'
import Icon from './icon'
import {EDIT_PROJECT_BOUNDS_COMPONENT, ISOCHRONE_COMPONENT, OPPORTUNITY_COMPONENT, REGIONAL_COMPONENT, REGIONAL_COMPARISON_COMPONENT} from '../constants/map'
import EditProjectBounds from '../containers/edit-project-bounds'
import messages from '../utils/messages'
import Modal from './modal'
import ModificationEditor from '../containers/modification-editor'
import ScenarioMap from './scenario-map'
import Isochrone from '../containers/isochrone'
import Opportunity from '../containers/opportunity'
import Regional from '../containers/regional-layer'
import RegionalComparison from '../containers/regional-comparison-layer'

// prefer to use canvas for rendering, improves speed significantly
// http://leafletjs.com/reference.html#global
// with this on we might be able to get rid of the stop layer
window.L_PREFER_CANVAS = true

export default class Application extends Component {
  static defaultProps = {
    variants: ['Default']
  }

  static propTypes = {
    children: PropTypes.any,

    // actions
    loadAllProjects: PropTypes.func.isRequired,
    login: PropTypes.func.isRequired,
    logout: PropTypes.func.isRequired,
    push: PropTypes.func.isRequired,

    // state
    center: PropTypes.object,
    error: PropTypes.string,
    errorMessage: PropTypes.string,
    feedsById: PropTypes.object.isRequired,
    hasError: PropTypes.bool.isRequired,
    hasScenario: PropTypes.bool.isRequired,
    mapComponents: PropTypes.array,
    projectId: PropTypes.string,
    outstandingRequests: PropTypes.number,
    scenarioIsLoaded: PropTypes.bool.isRequired,
    userIsLoggedIn: PropTypes.bool.isRequired,
    username: PropTypes.string,
    zoom: PropTypes.number
  }

  state = {
    bounds: getModificationBounds({feedsById: this.props.feedsById, modification: this.props.activeModification}),
    center: this.props.center,
    zoom: this.props.zoom
  }

  componentWillReceiveProps (nextProps) {
    if (!lonlat.isEqual(nextProps.center, this.props.center)) {
      this.setState({
        ...this.state,
        center: nextProps.center
      })
    }

    const newBounds = getModificationBounds({feedsById: nextProps.feedsById, modification: nextProps.activeModification})

    if (newBounds) {
      this.setState({
        ...this.state,
        bounds: newBounds
      })
    }
  }

  componentWillMount () {
    const {loadAllProjects} = this.props
    document.body.classList.add('Editor')

    loadAllProjects()
  }

  componentWillUnmount () {
    document.body.classList.remove('Editor')
  }

  _setMapCenter = (feature) => {
    this.props.setMapCenter(feature.geometry.coordinates)
  }

  render () {
    const {activeModification, analysisMode, children, error, errorMessage, hasError, hasScenario, login, logout, mapComponents, outstandingRequests, projectId, scenarioIsLoaded, userIsLoggedIn, username} = this.props
    const {bounds, center} = this.state

    return (
      <div id='editor'>
        {hasError &&
          <UiLock
            error={error}
            errorMessage={errorMessage}
            />
        }

        <div
          className={`Fullscreen ${activeModification ? 'hasActiveModification' : ''} ${analysisMode ? 'analysisMode' : ''}`}
          >
          <LeafletMap
            bounds={bounds}
            center={center}
            zoom={12}
            ref={this.mapIsMounted}
            >
            <TileLayer
              url={Browser.retina && process.env.LEAFLET_RETINA_URL ? process.env.LEAFLET_RETINA_URL : process.env.LEAFLET_TILE_URL}
              attribution={process.env.LEAFLET_ATTRIBUTION}
              zIndex={-10}
              />

            {mapComponents.map((type, i) => {
              switch (type) {
                case EDIT_PROJECT_BOUNDS_COMPONENT:
                  return <EditProjectBounds
                    key={`map-component-${i}`}
                    projectId={projectId}
                    />
                case ISOCHRONE_COMPONENT:
                  return <Isochrone
                    zIndex={30}
                    key={`map-component-${i}`}
                    />
                case OPPORTUNITY_COMPONENT:
                  return <Opportunity
                    key={`map-component-${i}`}
                    />
                case REGIONAL_COMPONENT:
                  return <Regional
                    key={`map-component-${i}`}
                    />
                case REGIONAL_COMPARISON_COMPONENT:
                  return <RegionalComparison
                    key={`map-component-${i}`}
                    />
              }
            })}

            { process.env.LABEL_TILE_URL && <TileLayer
              zIndex={40}
              url={Browser.retina && process.env.LABEL_RETINA_URL
                  ? process.env.LABEL_RETINA_URL
                  : process.env.LABEL_TILE_URL} />}

            {/* Scenario should go on top of labels */}
            {hasScenario && scenarioIsLoaded && <ScenarioMap zIndex={50} activeModification={activeModification} />}
          </LeafletMap>
        </div>

        <div className={`ApplicationDock ${analysisMode ? 'analysisMode' : ''}`}>
          <div className='ApplicationTitle'>
            <Link className='logo' to='/'>analysis </Link>
            <span className='badge'>beta</span>
            {outstandingRequests > 0 && <Icon type='spinner' className='fa-spin' />}

            <div className='pull-right'>
              <a href='http://docs.analysis.conveyal.com/' target='_blank' className='HelpLink'>
                {messages.common.help}
              </a>
              &nbsp;
              {authIsRequired && <LogInLogOut
                login={login}
                logout={logout}
                userIsLoggedIn={userIsLoggedIn}
                />}
            </div>

            {authIsRequired &&
              <div className='LoggedInAs'>
                {sprintf(messages.authentication.username, username)}
              </div>
            }
          </div>

          <div className='InnerDock'>
            {children}
          </div>
        </div>

        {activeModification &&
          // Use the modification key to force a replacement so that we can use
          // on mount and un-mount when switching between modifications
          <ModificationEditor
            modification={activeModification}
            key={activeModification.id}
            />}
      </div>
    )
  }
}

function LogInLogOut ({
  login,
  logout,
  userIsLoggedIn
}) {
  if (userIsLoggedIn) {
    return <Button className='btn-xs' onClick={logout}>{messages.authentication.logOut}</Button>
  } else {
    return <Button className='btn-xs' onClick={login}>{messages.authentication.logIn}</Button>
  }
}

function UiLock ({
  error,
  errorMessage
}) {
  return <Modal>
    <h1>{error}</h1>
    <h3>{errorMessage}</h3>
  </Modal>
}

function getModificationBounds ({feedsById, modification}) {
  if (modification) {
    const {routes} = modification
    if (feedsById && feedsById[modification.feed] && routes && routes.length === 1) {
      const route = feedsById[modification.feed].routesById[routes[0]]
      if (route && route.patterns) {
        return getRouteBounds(route)
      }
    }
  }
}

function getRouteBounds (route) {
  const geometries = route.patterns.map((pattern) => pattern.geometry)
  const coordinates = geometries.reduce((coordinates, geometry) => coordinates.concat(geometry.coordinates), [])
  if (coordinates.length > 0) {
    const bounds = latLngBounds(lonlat(coordinates[0]))
    coordinates.forEach((coordinate) => bounds.extend(lonlat(coordinate)))
    bounds.pad(1.25)
    return bounds
  }
}
