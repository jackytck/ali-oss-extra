require('dotenv').config()
var OSSSyncDir = require('../dst').default

var client = new OSSSyncDir({
  accessKeyId: process.env.accessKeyId,
  accessKeySecret: process.env.accessKeySecret,
  bucket: process.env.bucket,
  region: process.env.region,
  timeout: process.env.timeout
})

console.log('Begin test...')

// client.put('hello', new Buffer('world!'))
//   .then(result => {
//     console.log(result)
//     console.log('End')
//   })

// const result = await client.listDir(process.env.testDir2, ['name', 'lastModified'])
client.syncDir(`${process.env.dataWeb}/${process.env.testDir1}`, process.env.testDir1)
  .then(result => {
    // console.log(result)
  })
  .catch(console.error)
