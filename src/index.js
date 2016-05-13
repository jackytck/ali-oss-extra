import { Wrapper as OSS } from 'ali-oss'
import { pick, find } from 'lodash'
import walk from 'walk'
import Async from 'async'
import isThere from 'is-there'
import path from 'path'
import moment from 'moment'

class OSSSyncDir extends OSS {
  constructor (props) {
    super(props)
  }

  putList (fileList, options = { thread: 20 }) {
    return new Promise((resolve, reject) => {
      async function putFile (file, done) {
        try {
          const result = await this.put(file.dst, file.src)
          done(null, result)
        } catch (err) {
          done(err)
        }
      }
      Async.mapLimit(fileList, options.thread, putFile.bind(this), (err, results) => {
        if (err) {
          return reject(err)
        }
        resolve(results)
      })
    })
  }

  deleteList (fileList, options = { thread: 20 }) {
    return new Promise((resolve, reject) => {
      async function deleteFile (file, done) {
        try {
          const result = await this.delete(file.name)
          done(null, result)
        } catch (err) {
          done(err)
        }
      }
      Async.mapLimit(fileList, options.thread, deleteFile.bind(this), (err, results) => {
        if (err) {
          return reject(err)
        }
        resolve(results)
      })
    })
  }

  /**
   * As in:
   * s3 sync ${directory} s3://bucket/${prefix} --delete
   */
  syncDir (directory, prefix, options = { delete: true }) {
    return new Promise((resolve, reject) => {
      let putResults = []
      let deleteResults = []

      // 1. Prepare local files
      // a. check if directory exists
      if (!isThere(directory)) {
        return reject(new Error(`Path ${directory} does not exist!`))
      }
      // b. construct list of local files
      const dirname = path.dirname(directory)
      let localFiles = []
      const walker = walk.walk(directory)
      walker.on('file', (root, stat, next) => {
        const dst = `${prefix}${root.substr(directory.length)}/${stat.name}`
        const src = `${root}/${stat.name}`
        localFiles.push({
          dst,
          src,
          mtime: stat.mtime.toISOString()
        })
        next()
      })

      walker.on('end', async () => {
        console.log('local:', localFiles.length)

        // 2. Check exiting files on OSS
        const cloudFiles = await this.listDir(prefix, ['name', 'lastModified'])
        console.log('oss:', cloudFiles.length)

        // 3. Construct a list of files to upload
        let uploadFiles = []
        localFiles.forEach(f => {
          const existed = find(cloudFiles, { name: f.dst })
          if (existed) {
            if (moment(f.mtime).isAfter(moment(existed.lastModified))) {
              uploadFiles.push(f)
            }
          } else {
            uploadFiles.push(f)
          }
        })
        console.log('upload:', uploadFiles.length)

        // 4. Put a list of files to OSS
        putResults = await this.putList(uploadFiles)
        console.log('done uploading')

        // 5. Construct a list of files to delete
        let deleteFiles = []
        if (options.delete) {
          cloudFiles.forEach(f => {
            const existed = find(localFiles, { dst: f.name })
            if (!existed) {
              deleteFiles.push(f)
            }
          })
          console.log('delete:', deleteFiles.length)

          // 6. Delete a list of files from OSS
          deleteResults = await this.deleteList(deleteFiles)
          console.log('done deleting')
        }

        resolve({
          put: putResults,
          delete: deleteResults
        })
      })
    })
  }

  /**
   * Get all the files of a directory recursively.
   * Return [] if not found.
   */
  async listDir (prefix, projection = []) {
    const query = {
      prefix,
      'max-keys': 1000
    }
    let result = await this.list(query)
    if (!result.objects) {
      return []
    }
    function project (files) {
      if (projection.length) {
        return files.map(f => pick(f, projection))
      }
      return files
    }
    let allFiles = [...project(result.objects)]
    while (result.nextMarker) {
      query.marker = result.nextMarker
      result = await this.list(query)
      allFiles = [...allFiles, ...project(result.objects)]
    }
    return allFiles
  }
}

// export default OSSSyncDir
module.exports = OSSSyncDir
