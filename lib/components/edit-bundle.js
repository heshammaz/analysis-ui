import React, {PropTypes} from 'react'
import {sprintf} from 'sprintf-js'

import {Button} from './buttons'
import DeepEqualComponent from './deep-equal'
import {Body, Heading, Panel} from './panel'
import Icon from './icon'
import {File, Text} from './input'
import messages from '../utils/messages'
import authenticatedFetch, {authenticatedXhr, parseJSON} from '../utils/authenticated-fetch'

// how often to poll when waiting for a bundle to be read on the server.
const POLL_TIMEOUT_MS = 1000

export default class EditBundle extends DeepEqualComponent {
  static propTypes = {
    addBundle: PropTypes.func.isRequired,
    bundle: PropTypes.object,
    bundleId: PropTypes.string,
    deleteBundle: PropTypes.func.isRequired,
    name: PropTypes.string,
    projectId: PropTypes.string.isRequired,
    saveBundle: PropTypes.func.isRequired
  }

  state = {
    files: undefined,
    name: this.props.name,
    updloading: false,
    uploadFailed: false,
    bundleId: null
  }

  componentWillReceiveProps (nextProps) {
    this.setState({
      ...this.state,
      name: nextProps.name
    })
  }

  _submit = (e) => {
    // don't submit the form
    e.preventDefault()
    const {bundle, saveBundle} = this.props
    const {files, name} = this.state
    if (bundle && name) {
      bundle.name = name
      saveBundle(bundle)
    } else if (name && files) {
      const data = new window.FormData(e.target)

      authenticatedXhr('/api/bundle', {
        method: 'post',
        body: data,
        progressCallback: this._setUploadProgress
      })
      .then(({ response }) => {
        this.setState({...this.state, bundleId: response.id})
        setTimeout(this._checkUploadState, POLL_TIMEOUT_MS)
      }, (err) => {
        console.error(err)
        console.error(err.stack)
        this.setState({...this.state, uploading: false, uploadFailed: true})
      })

      this.setState({...this.state, uploading: true, uploadFailed: false})
    }
  }

  /** handle XHR progress events */
  _setUploadProgress = ({ loaded, total, lengthComputable }) => {
    const statusMessage = lengthComputable
      ? sprintf(messages.common.uploadProgress, Math.round(loaded / total * 100))
      : messages.common.uploading
    this.setState({ ...this.state, statusMessage })
  }

  /** check if the upload/processing of the bundle has completed */
  _checkUploadState = () => {
    authenticatedFetch(`/api/bundle/${this.state.bundleId}`)
    .then(parseJSON)
    .then((res) => {
      if (res.status === 'DONE') {
        this.setState({files: undefined, name: undefined, uploading: false, uploadFailed: false, bundleId: undefined})
        this.props.addBundle(res)
      } else if (res.status === 'PROCESSING_GTFS') {
        const { feedsComplete, totalFeeds } = res
        this.setState({ ...this.state, statusMessage: sprintf(messages.bundle.processingFeed, feedsComplete + 1, totalFeeds) })
        setTimeout(this._checkUploadState, POLL_TIMEOUT_MS)
      } else if (res.status === 'ERROR') {
        this.setState({ ...this.state, uploading: false, uploadFailed: true })
      }
    }, (err) => {
      console.error(err, err.stack)
      // this request failing does not imply that the bundle failed to upload
      setTimeout(this._checkUploadState, POLL_TIMEOUT_MS)
    })
  }

  _deleteBundle = () => {
    if (window.confirm(messages.bundle.deleteConfirmation)) {
      this.props.deleteBundle()
    }
  }

  _setName = (e) => {
    this.setState({...this.state, name: e.target.value})
  }

  render () {
    const {bundleId, projectId} = this.props
    const {files, name, uploadFailed, uploading, statusMessage} = this.state
    return (
      <Panel>
        <Heading>{bundleId ? messages.bundle.edit : messages.bundle.create}</Heading>
        <Body>
          <form
            encType='multipart/form-data'
            method='post'
            onSubmit={this._submit}
            >

            {uploadFailed &&
              <div className='alert alert-danger'>Upload failed</div>
            }

            <Text
              name='Name'
              onChange={this._setName}
              placeholder='Bundle name'
              value={name}
              />

            {!bundleId &&
              <File
                label='GTFS files'
                multiple
                name='files'
                onChange={(e) => this.setState({...this.state, files: e.target.value})}
                value={files}
                />
            }

            <input type='hidden' name='projectId' value={projectId} />
            <input
              className='btn btn-block btn-success'
              disabled={uploading || !name || (!bundleId && !files)}
              type='submit'
              value={bundleId ? messages.bundle.edit : messages.bundle.create}
              />
            {bundleId &&
              <Button
                block
                style='danger'
                onClick={this._deleteBundle}
                ><Icon type='trash' /> {messages.bundle.delete}
              </Button>
            }
            {uploading && <span><Icon className='fa-spin' type='spinner' /> {statusMessage}</span>}
          </form>
        </Body>
      </Panel>
    )
  }
}
