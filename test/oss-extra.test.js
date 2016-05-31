/* global describe, it */
import chai from 'chai'
import OSS from '..'
import config from './config'
import chaiThings from 'chai-things'
import fs from 'fs-extra'
import crypto from 'crypto'
import chaiAsPromised from 'chai-as-promised'

chai.should()
chai.use(chaiThings)
chai.use(chaiAsPromised)

describe('Ali-OSS-Extra', () => {
  const store = new OSS(config.OSS)
  const store1s = new OSS(Object.assign({}, config.OSS, { timeout: '1s' }))
  const store5s = new OSS(Object.assign({}, config.OSS, { timeout: '5s' }))
  const jobId = process.env.TRAVIS_JOB_ID || '0'
  const testDir = `general_test_${jobId}`

  it('initialize', done => {
    const opts = store.options
    opts.accessKeyId.should.be.a('string')
    opts.accessKeySecret.should.be.a('string')
    opts.bucket.should.be.a('string')
    opts.region.should.be.a('string')
    done()
  })

  it('list top 10 buckets', async () => {
    const result = await store.listBuckets({ 'max-keys': 10 })
    result.should.have.property('buckets')
    result.should.have.property('res')
    result.res.should.have.property('status')
    result.res.status.should.equal(200)
  })

  it('throw if prefix in listDir is not a string', async () => {
    return store.listDir({}).should.be.rejectedWith(Error)
  })

  it('list all files of prefix recursively', async () => {
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
  })

  it('get an empty list if prefix is not found', async () => {
    const result = await store.listDir('not-existing')
    result.should.be.instanceof(Array)
    result.length.should.equal(0)
  })

  it('list all files of prefix recursively with projection', async () => {
    const result = await store.listDir(config.TEST_PREFIX, ['name', 'lastModified', 'size'])
    result.should.be.instanceof(Array)
    result.should.all.have.property('name')
    result.should.all.not.have.property('url')
    result.should.all.have.property('lastModified')
    result.should.all.not.have.property('etag')
    result.should.all.not.have.property('type')
    result.should.all.have.property('size')
    result.should.all.not.have.property('storageClass')
    result.should.all.not.have.property('owner')
  })

  // putList
  it('throw if file list passed in putList is not correct', async () => {
    return store.putList([{ src: 'abc', dst: 'abc' }]).should.be.rejectedWith(Error)
  })

  it('put files via putList', async () => {
    fs.mkdirsSync('./a')
    fs.writeFileSync('./a/data1.txt', 'data1 content')
    fs.writeFileSync('./a/data2.txt', 'data2 content')
    const result = await store.putList([
      {
        src: './a/data1.txt',
        dst: 'a/data1.txt',
        size: 100
      },
      {
        src: './a/data2.txt',
        dst: 'a/data2.txt',
        size: 200
      }
    ], { thread: 10 })
    fs.removeSync('./a')
    result.should.be.instanceof(Array)
    result.length.should.equal(2)
    result[0].res.status.should.equal(200)
    result[1].res.status.should.equal(200)
  })

  // deleteList
  it('throw if file list passed in deleteList is not correct', async () => {
    return store.deleteList([{ name: 3 }]).should.be.rejectedWith(Error)
  })

  it('delete files via deleteList', async () => {
    const result = await store.deleteList([
      {
        name: 'a/data1.txt'
      },
      {
        name: 'a/data2.txt'
      }
    ], { thread: 25 })
    result.should.be.instanceof(Array)
    result.length.should.equal(2)
    result[0].res.status.should.equal(204)
    result[1].res.status.should.equal(204)
  })

  it('throw if prefix in syncDir is not a string', async () => {
    return store.syncDir({}, testDir).should.be.rejectedWith(Error)
  })

  it('throw if local directory does not exist', async () => {
    const p = store.syncDir('./abc', testDir, { verbose: true })
    return p.should.be.rejectedWith(Error)
  })

  it('sync a directory', async () => {
    fs.mkdirsSync('./a/b/c/d/')
    fs.writeFileSync('./a/fileA1.txt', 'fileA1 content')
    fs.writeFileSync('./a/fileA2.txt', 'fileA2 content')
    fs.writeFileSync('./a/b/c/fileC1.txt', 'fileC1 content')
    fs.writeFileSync('./a/b/c/fileC2.txt', 'fileC2 content')
    fs.writeFileSync('./a/b/c/d/fileD1.txt', 'fileD1 content')
    fs.writeFileSync('./a/b/c/d/fileD2.txt', 'fileD2 content')
    fs.writeFileSync('./a/b/c/d/fileD3.txt', 'fileD3 content')
    const result = await store.syncDir('./a', testDir, { verbose: true })

    result.should.be.instanceof(Object)
    result.should.have.property('put')
    result.should.have.property('delete')
    result.put.should.be.instanceof(Array)
    result.delete.should.be.instanceof(Array)
    result.put.length.should.equal(7)
    result.put.should.all.have.property('name')
    result.put.should.all.have.property('url')
    result.put.should.all.have.property('res')
    result.delete.length.should.equal(0)

    const fileD1 = result.put.filter(f => f.name === `${testDir}/b/c/d/fileD1.txt`)
    fileD1.length.should.equal(1)
    fileD1[0].res.status.should.equal(200)

    fs.removeSync('./a/b/c/fileC1.txt')
    fs.removeSync('./a/b/c/d/fileD2.txt')
    const result2 = await store.syncDir('./a', testDir, { verbose: true })
    result2.put.length.should.equal(0)
    result2.delete.length.should.equal(2)

    fs.removeSync('./a/fileA1.txt')
    const result3 = await store.syncDir('./a', testDir)
    result3.put.length.should.equal(0)
    result3.delete.length.should.equal(1)
  })

  it('not upload if synchronizing same directory again', async () => {
    const result = await store.syncDir('./a', testDir)
    result.put.length.should.equal(0)
    result.delete.length.should.equal(0)
  })

  it('sync in multipart fashion', async () => {
    const buffer = crypto.randomBytes(1000000)
    fs.writeFileSync('./a/random.dat', buffer)
    const result = await store.syncDir('./a', testDir, { verbose: true })
    result.put[0].res.status.should.equal(200)
  })

  it('throw if download name is not a string', async () => {
    return store.setDownloadName(`${testDir}/random.dat`, {}).should.be.rejectedWith(Error)
  })

  it('set download name', async () => {
    const result = await store.setDownloadName(`${testDir}/random.dat`, 'random.dat')
    result.res.status.should.equal(200)
  })

  it('throw if prefix in deleteDir is not a string', async () => {
    return store.deleteDir({}).should.be.rejectedWith(Error)
  })

  it('delete a directory', async () => {
    const result = await store.deleteDir(testDir)
    result.should.be.instanceof(Array)
    result.length.should.equal(5)
    result.should.include(`${testDir}/b/c/d/fileD1.txt`)
    fs.removeSync('./a')
  })

  it('delete a non-existing directory without error', async () => {
    const result = await store.deleteDir(testDir)
    result.should.be.instanceof(Array)
    result.length.should.equal(0)
  })

  describe('timeout tests', () => {
    const dir = `timeout_test_${jobId}`

    it('throw retry limit exceeded', async () => {
      return store1s._getCloudFilesMap(config.TEST_PREFIX, { retryLimit: 5 }).should.be.rejectedWith(Error)
    })

    it('catch timeout in syncDir and retry', async () => {
      fs.mkdirsSync(`./${dir}`)
      const buffer = crypto.randomBytes(20000000)
      fs.writeFileSync(`./${dir}/random.dat`, buffer)
      const result = await store5s.syncDir(`./${dir}`, dir, { verbose: true })
      result.put[0].res.status.should.equal(200)
      await store.deleteDir(dir)
      fs.removeSync(`./${dir}`)
    })

    it('upload large number of small files', async () => {
      fs.mkdirsSync(`./${dir}`)
      const size = process.env.TRAVIS ? 50000 : 5000
      for (let i = 0; i < size; i++) {
        const buffer = crypto.randomBytes(1)
        fs.writeFileSync(`./${dir}/${i}.bin`, buffer)
      }
      const result = await store5s.syncDir(`./${dir}`, dir)
      result.put.length.should.equal(size)
      result.delete.length.should.equal(0)
      await store.deleteDir(dir)
      fs.removeSync(`./${dir}`)
    })
  })
})
