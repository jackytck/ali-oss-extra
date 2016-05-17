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
    message: 'Error!'
  })
}

function onSuccess (name, result) {
  console.log(`Done ${name}`)
  // console.log(result)
  notifier.notify({
    title: 'ali-oss-extra',
    message: `Done ${name}!`
  })
}

console.log('Begin test...')

client.syncDir(`${process.env.dataWeb}/${process.env.testDir1}`, process.env.testDir1)
  .then(onSuccess.bind(this, 'syncDir'))
  .catch(onError)

// client.deleteDir(process.env.austin)
//   .then(onSuccess.bind(this, 'deleteDir'))
//   .catch(onError)
