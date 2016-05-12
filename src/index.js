import { Wrapper as OSS } from 'ali-oss'
import dotenv from 'dotenv'
dotenv.config()

class OSSSyncDir extends OSS {
  constructor (props) {
    super(props)
  }

  /**
   * As in:
   * s3 sync ${directory} s3://bucket/${prefix} --delete
   */
  async syncDir (directory, prefix) {
  }

  /**
   * Get all the files of a directory recursively.
   * Return [] if not found.
   */
  async listDir (prefix) {
    const query = {
      prefix,
      'max-keys': 1000
    }
    let result = await this.list(query)
    if (!result.objects) {
      return []
    }
    let allFiles = [...result.objects]
    while (result.nextMarker) {
      query.marker = result.nextMarker
      result = await this.list(query)
      allFiles = [...allFiles, ...result.objects]
    }
    return allFiles
  }
}

async function test () {
  const client = new OSSSyncDir({
    accessKeyId: process.env.accessKeyId,
    accessKeySecret: process.env.accessKeySecret,
    bucket: process.env.bucket,
    region: process.env.region,
    timeout: process.env.timeout
  })

  const result = await client.listDir(process.env.testDir)
  console.log(result.slice(0, 3))
  console.log(result.length)
}
test()

export default OSSSyncDir
