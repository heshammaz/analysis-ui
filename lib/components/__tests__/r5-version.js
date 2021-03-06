/* global describe, it, expect, jest */

describe('Component > R5Version', () => {
  const renderer = require('react-test-renderer')
  const React = require('react')
  const R5Version = require('../r5-version')

  it('renders correctly', () => {
    const props = {
      fetch: jest.fn(),
      label: 'Label',
      name: 'Name',
      onChange: jest.fn()
    }

    // mount component
    const tree = renderer.create(
      <R5Version
        {...props}
        />
    ).toJSON()
    expect(tree).toMatchSnapshot()
  })
})
