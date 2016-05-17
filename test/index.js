require('dotenv').config()
var aliOSS = require('../dst')
var notifier = require('node-notifier')

var client = new aliOSS({
  accessKeyId: process.env.accessKeyId,
  accessKeySecret: process.env.accessKeySecret,
  bucket: process.env.bucket,
  region: process.env.region,
  timeout: process.env.timeout
})

console.log('Begin test...')

client.syncDir(`${process.env.dataWeb2}/${process.env.testDir2}`, process.env.testDir2)
  .then(result => {
    console.log('done syncDir')
    // console.log(result)
    notifier.notify({
      title: 'ali-oss-extra',
      message: 'Done syncDir!'
    })
  })
  .catch(err => {
    console.error('Error', err)
    notifier.notify({
      title: 'ali-oss-extra',
      message: 'Error!'
    })
  })

// client.deleteDir(process.env.hkust)
//   .then(result => {
//     console.log(`Deleted ${result.length} files`)
//   })
//   .catch(err => {
//     console.error('error')
//     console.error(err)
//   })
