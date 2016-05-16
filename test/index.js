require('dotenv').config()
var aliOSS = require('../dst')

var client = new aliOSS({
  accessKeyId: process.env.accessKeyId,
  accessKeySecret: process.env.accessKeySecret,
  bucket: process.env.bucket,
  region: process.env.region,
  timeout: process.env.timeout
})

console.log('Begin test...')

// client.syncDir(`${process.env.dataWeb}/${process.env.testDir2}`, process.env.testDir2)
//   .then(result => {
//     console.log('Done syncDir')
//   })
//   .catch(console.error)

client.deleteDir(process.env.testDir2)
  .then(result => {
    console.log(result)
  })
  .catch(console.error)
