/** Create a grid by uploading files */

import React, { Component, PropTypes } from 'react'
import {sprintf} from 'sprintf-js'
import {format} from 'd3-format'

import authenticatedFetch, {authenticatedXhr, parseJSON} from '../utils/authenticated-fetch'
import Icon from './icon'
import {File, Text} from './input'
import {Body, Heading, Panel} from './panel'
import messages from '../utils/messages'

export default class CreateGrid extends Component {
  static propTypes = {
    projectId: PropTypes.string.isRequired,
    finish: PropTypes.func.isRequired
  }

  state = {
    uploading: false,
    csv: false,
    id: null,
    statusMessage: null
  }

  render () {
    const { uploading } = this.state

    return <Panel>
      <Heading>{messages.analysis.createGrid}</Heading>
      { uploading ? this.renderUploading() : this.renderForm()}
    </Panel>
  }

  renderUploading () {
    const { statusMessage } = this.state
    return <Body>
      <Icon type='spinner' className='fa-spin pull-left' />
      {statusMessage}
    </Body>
  }

  onSubmit = async (e) => {
    e.preventDefault()

    this.setState({ ...this.state, uploading: true })

    const { projectId } = this.props

    const body = new window.FormData(e.target)

    const { response } = await authenticatedXhr(`/api/grid/${projectId}`, {
      method: 'post',
      body,
      progressCallback: this.setProgress
    })

    // TODO handle error
    this.setState({ ...this.state, uploadHandle: response.handle })
    this.interval = setInterval(this.updateGridStatus, 3000)
  }

  updateGridStatus = async () => {
    const { uploadHandle } = this.state
    const { finish, projectId } = this.props
    const response = await authenticatedFetch(`/api/grid/status/${uploadHandle}`).then(parseJSON)

    const { status, totalFeatures, completedFeatures } = response

    const formatter = format(',')

    if (status === 'DONE') {
      finish(projectId)
    } else if (status === 'ERROR') {
      this.setState({ ...this.state, statusMessage: messages.analysis.gridProcessingFailed })
    } else {
      // if we don't know the total size yet, just say we're processing
      const statusMessage = totalFeatures < 0
        ? messages.common.processing
        : sprintf(
          messages.analysis.processingGridFeatures,
          formatter(completedFeatures),
          formatter(totalFeatures)
        )
      this.setState({
        ...this.state,
        statusMessage
      })
    }

    // TODO error
  }

  setProgress = ({ loaded, total, lengthComputable }) => {
    // once the upload par
    const statusMessage = lengthComputable
      ? loaded < total
        ? sprintf(messages.common.uploadProgress, Math.round(loaded / total * 100))
        : messages.common.processing
      : messages.common.uploading

    this.setState({ ...this.state, statusMessage })
  }

  setFiles = (e) => {
    const files = e.target.files
    // signal if it's a CSV file; if so, we need to show extra fields
    // if it's a shapefile, this is not needed
    const csv = files.length === 1 && files[0].name.toLowerCase().endsWith('.csv')
    this.setState({...this.state, files, csv})
  }

  renderForm () {
    let { name, files, uploading, csv } = this.state

    return <Body>
      <form onSubmit={this.onSubmit} method='post' encType='multipart/form-data'>
        <Text name='Name'
          label={messages.analysis.gridName}
          placeholder={messages.analysis.gridName}
          value={name}
          onChange={e => this.setState({...this.state, name: e.target.value})}
          />

        <File
          multiple
          label={messages.analysis.gridFiles}
          name='files'
          onChange={this.setFiles}
          value={files}
          />

        {csv && this.renderCsvFields()}

        <input
          className='btn btn-block btn-success'
          disabled={uploading || !name || !files}
          type='submit'
          value={messages.analysis.createGrid}
          />
      </form>
    </Body>
  }

  /** CSV files don't have standard lat and lon column names, so make the user specify them */
  renderCsvFields () {
    const { latField, lonField } = this.state
    return <span>
      <Text name='latField'
        label={messages.analysis.latField}
        placeholder={messages.analysis.latField}
        value={latField}
        onChange={e => this.setState({...this.state, latField: e.target.value})}
        />

      <Text name='lonField'
        label={messages.analysis.lonField}
        placeholder={messages.analysis.lonField}
        value={lonField}
        onChange={e => this.setState({...this.state, lonField: e.target.value})}
        />
    </span>
  }

  componentWillUnmount () {
    if (this.interval != null) clearInterval(this.interval)
  }
}
