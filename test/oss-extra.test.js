/* global describe, it */
import chai from 'chai'
import OSS from '..'
import config from './config'
import chaiThings from 'chai-things'

chai.should()
chai.use(chaiThings)

describe('Ali-OSS-Extra', () => {
  const store = new OSS(config.OSS)

  it('initialize', done => {
    const opts = store.options
    opts.accessKeyId.should.be.a('string')
    opts.accessKeySecret.should.be.a('string')
    opts.bucket.should.be.a('string')
    opts.region.should.be.a('string')
    done()
  })

  it('list top 10 buckets', async (done) => {
    const result = await store.listBuckets({ 'max-keys': 10 })
    result.should.have.property('buckets')
    result.should.have.property('res')
    result.res.should.have.property('status')
    result.res.status.should.equal(200)
    done()
  })

  it('list all files of prefix recursively', async (done) => {
    const result = await store.listDir(config.TEST_PREFIX)
    result.should.be.instanceof(Array)
    result.should.all.have.property('name')
    result.should.all.have.property('url')
    result.should.all.have.property('lastModified')
    result.should.all.have.property('etag')
    result.should.all.have.property('type')
    result.should.all.have.property('size')
    result.should.all.have.property('storageClass')
    result.should.all.have.property('owner')
    done()
  })

  it('get an empty list if prefix is not found', async (done) => {
    const result = await store.listDir('not-existing')
    result.should.be.instanceof(Array)
    result.length.should.equal(0)
    done()
  })
})
