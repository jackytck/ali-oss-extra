require('dotenv').config()
var AliOSS = require('../dst')
var notifier = require('node-notifier')

var client = new AliOSS({
  accessKeyId: process.env.accessKeyId,
  accessKeySecret: process.env.accessKeySecret,
  bucket: process.env.bucket,
  region: process.env.region,
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
  console.log('Uploaded:', result.put.length)
  console.log('Removed:', result.delete.length)
  notifier.notify({
    title: 'ali-oss-extra',
    message: `Done ${name}!`
  })
}

console.log('Begin test...')
var project = process.env.testDir1

client.syncDir(`${process.env.dataWeb}/${project}`, project, { verbose: true })
  .then(onSuccess.bind(this, 'syncDir'))
  .catch(onError)

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
