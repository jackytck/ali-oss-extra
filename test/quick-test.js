require('dotenv').config()
var AliOSS = require('../dst').default
var notifier = require('node-notifier')

var client = new AliOSS({
  accessKeyId: process.env.ALI_SDK_OSS_ID,
  accessKeySecret: process.env.ALI_SDK_OSS_SECRET,
  bucket: process.env.ALI_SDK_OSS_BUCKET,
  region: process.env.ALI_SDK_OSS_REGION,
  timeout: process.env.timeout
})

function onError (err) {
  console.error('Error', err)
  notifier.notify({
    title: 'ali-oss-extra',
    message: err.toString() || JSON.stringify(err)
  })
}

function onSuccess (name, result) {
  console.log(`Done ${name}`)
  if (result.put) {
    console.log('Uploaded:', result.put.length)
    // console.log('Uploaded:', result.put.map(f => f.name))
  }
  if (result.delete) {
    console.log('Removed:', result.delete.length)
    // console.log('Removed:', result.delete)
  }
  if (result.get) {
    console.log('Downloaded:', result.get.length)
  }
  notifier.notify({
    title: 'ali-oss-extra',
    message: `Done ${name}!`
  })
}

console.log('Begin test...')
// var project = process.env.testDir2

// var headersMap = new Map()
// var prefix = `${project}-test`
// headersMap.set(`${prefix}/7fe7985dfb7393e073b46873278ee98e`, {
//   'Content-Type': 'binary/octet-stream',
//   'Content-Disposition': `attachment; filename="${encodeURIComponent('stadium_paid_model.zip')}"`
// })
// headersMap.set(`${prefix}/b822a1236847dc06dfaeedae52538e42`, {
//   'Content-Type': 'binary/octet-stream',
//   'Content-Disposition': `attachment; filename="${encodeURIComponent('stadium_paid_orthomap.tif')}"`
// })
// headersMap.set(`${prefix}/f02b235dc204782ee880c4210ede13ea`, {
//   'Content-Type': 'binary/octet-stream',
//   'Content-Disposition': `attachment; filename="${encodeURIComponent('stadium_paid_dsm.tif')}"`
// })

// var ignoreList = [
//   'cp',
//   'editor',
//   'sfm',
//   'gcp_runtime'
// ]
//
// client.syncDir(`${process.env.dataWeb2}/${project}`, project + '-test', { ignoreList, verbose: true })
//   .then(onSuccess.bind(this, 'syncDir'))
//   .catch(onError)

// client.deleteDir(process.env.testDir1)
//   .then(onSuccess.bind(this, 'deleteDir'))
//   .catch(onError)

// client.putList([{}])
//   .then(onSuccess.bind(this, 'putList'))
//   .catch(onError)

// client.deleteList([{}])
//   .then(onSuccess.bind(this, 'deleteList'))
//   .catch(onError)

// client.setDownloadName('abc', {})
//   .then(onSuccess.bind(this, 'setDownloadName'))
//   .catch(onError)

// client.deleteDir({})
//   .then(onSuccess.bind(this, 'deleteDir'))
//   .catch(onError)

// client.listDir({})
//   .then(onSuccess.bind(this, 'listDir'))
//   .catch(onError)

// client.syncDirDown(process.env.ALI_SDK_OSS_TEST_PREFIX, '/tmp/abc', { verbose: true })
client.syncDirDown('ust-small', '/tmp/abc', { verbose: true })
  .then(onSuccess.bind(this, 'syncDirDown'))
  .catch(onError)
