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
  const store20ms = new OSS(Object.assign({}, config.OSS, { timeout: '20ms' }))
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

  it('set chinese download name', async () => {
    const result = await store.setDownloadName(`${testDir}/random.dat`, '荒地_final.zip')
    result.res.status.should.equal(200)
  })

  it('set japanese download name', async () => {
    const result = await store.setDownloadName(`${testDir}/random.dat`, 'こんにちは.dat')
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

  it('sync a directory with customized headers', async () => {
    fs.mkdirsSync('./a/b/c/d/')
    fs.writeFileSync('./a/fileA1.txt', 'fileA1 content')
    fs.writeFileSync('./a/fileA2.txt', 'fileA2 content')
    fs.writeFileSync('./a/b/c/fileC1.txt', 'fileC1 content')
    fs.writeFileSync('./a/b/c/fileC2.txt', 'fileC2 content')
    fs.writeFileSync('./a/b/c/d/fileD1.txt', 'fileD1 content')
    fs.writeFileSync('./a/b/c/d/fileD2.txt', 'fileD2 content')
    fs.writeFileSync('./a/b/c/d/fileD3.dmg', 'fileD3 content')
    const headersMap = new Map()
    headersMap.set(`${testDir}/b/c/fileC1.txt`, {
      'Content-Type': 'text/plain',
      'Content-Disposition': `attachment; filename="${encodeURIComponent('BR Ubatuba-SP Área Saco da Riberia.txt')}"`
    })
    headersMap.set(`${testDir}/b/c/d/fileD3.dmg`, {
      'Content-Type': 'binary/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent('Estupa.dmg')}"`
    })
    await store.syncDir('./a', testDir, { headersMap, verbose: true })
    const fileC1 = await store.head(`${testDir}/b/c/fileC1.txt`)
    const fileD3 = await store.head(`${testDir}/b/c/d/fileD3.dmg`)

    fileC1.res.headers['content-type'].should.equal('text/plain')
    fileC1.res.headers['content-disposition'].should.equal(`attachment; filename="${encodeURIComponent('BR Ubatuba-SP Área Saco da Riberia.txt')}"`)
    fileD3.res.headers['content-type'].should.equal('binary/octet-stream')
    fileD3.res.headers['content-disposition'].should.equal(`attachment; filename="${encodeURIComponent('Estupa.dmg')}"`)

    await store.deleteDir(testDir)
    fs.removeSync('./a')
  })

  it('sync a directory with ignoreList', async () => {
    fs.mkdirsSync('./a/b/c/d/')
    fs.writeFileSync('./a/top1.txt', 'top1 content')
    fs.writeFileSync('./a/top2.txt', 'top2 content')
    fs.writeFileSync('./a/fileA1.txt', 'fileA1 content')
    fs.writeFileSync('./a/fileA2.txt', 'fileA2 content')
    fs.writeFileSync('./a/b/c/fileC1.txt', 'fileC1 content')
    fs.writeFileSync('./a/b/c/fileC2.txt', 'fileC2 content')
    fs.writeFileSync('./a/b/c/d/fileD1.txt', 'fileD1 content')
    fs.writeFileSync('./a/b/c/d/fileD2.txt', 'fileD2 content')
    fs.writeFileSync('./a/b/c/d/fileD3.dmg', 'fileD3 content')
    fs.writeFileSync('./a/b/c/d/fileD2.txt', 'fileD2 content')
    fs.mkdirsSync('./a/cp')
    fs.writeFileSync('./a/cp/fileCP1.txt', 'fileCP1 content')
    fs.writeFileSync('./a/cp/fileCP2.txt', 'fileCP2 content')
    fs.writeFileSync('./a/cp/fileCP3.txt', 'fileCP3 content')
    fs.mkdirsSync('./a/sfm')
    fs.writeFileSync('./a/sfm/fileSFM1.txt', 'fileSFM1 content')

    const ignoreList = [
      'top1.txt',
      'b/c/d',
      'cp'
    ]
    const result = await store.syncDir('./a', testDir, { ignoreList, verbose: true })
    result.put.length.should.equal(6)
    result.delete.length.should.equal(0)

    await store.deleteDir(testDir)
    fs.removeSync('./a')
  })

  describe('timeout tests', () => {
    const dir = `timeout_test_${jobId}`

    it('throw retry limit exceeded in _getCloudFilesMap', async () => {
      return store20ms._getCloudFilesMap(config.TEST_PREFIX, { retryLimit: 5 }).should.be.rejectedWith(Error)
    })

    it('catch timeout in syncDir and retry', async () => {
      fs.mkdirsSync(`./${dir}`)
      const buffer = crypto.randomBytes(20000000)
      fs.writeFileSync(`./${dir}/random.dat`, buffer)
      const result = await store5s.syncDir(`./${dir}`, dir, { verbose: true })
      result.put[0].res.status.should.equal(200)
    })

    it('throw retry limit exceeded in syncDir: upload', async () => {
      const buffer = crypto.randomBytes(100000000)
      fs.writeFileSync(`./${dir}/random2.dat`, buffer)
      const localFilesMap = await store5s._getLocalFilesMap(`./${dir}`, dir)
      let uploadFilesMap = new Map()
      for (let f of localFilesMap.values()) {
        uploadFilesMap.set(f.dst, f)
      }
      return store20ms.syncDir(`./${dir}`, dir, { retryLimit: 3, verbose: true }, { retrying: true, uploadFilesMap, trial: 1 }).should.be.rejectedWith(Error)
    })

    it('throw retry limit exceeded in syncDir: delete', async () => {
      const cloudFilesMap = await store5s._getCloudFilesMap(dir)
      let deleteFilesMap = new Map()
      for (let f of cloudFilesMap.values()) {
        deleteFilesMap.set(f.name, f)
      }
      return store20ms.syncDir(`./${dir}`, dir, { retryLimit: 3, verbose: true }, { retrying: true, deleteFilesMap, trial: 1 }).should.be.rejectedWith(Error)
    })

    it('delete dir without timeout error 1', async () => {
      await store.deleteDir(dir)
      fs.removeSync(`./${dir}`)
    })

    it('upload large number of small files', async () => {
      fs.mkdirsSync(`./${dir}`)
      const size = process.env.TRAVIS ? 25000 : 5000
      for (let i = 0; i < size; i++) {
        const buffer = crypto.randomBytes(1)
        fs.writeFileSync(`./${dir}/${i}.bin`, buffer)
      }
      const result = await store5s.syncDir(`./${dir}`, dir)
      result.put.length.should.equal(size)
      result.delete.length.should.equal(0)
    })

    it('throw retry limit exceeded in deleteDir', async () => {
      return store20ms.deleteDir(dir, { retryLimit: 3, verbose: true }).should.be.rejectedWith(Error)
    })

    it('delete dir without timeout error 2', async () => {
      await store.deleteDir(dir)
      fs.removeSync(`./${dir}`)
    })
  })
})
