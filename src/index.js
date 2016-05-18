import { Wrapper as OSS } from 'ali-oss'
import { pick } from 'lodash'
import walk from 'walk'
import Async from 'async'
import isThere from 'is-there'
import moment from 'moment'

class OSSSyncDir extends OSS {
  putList (fileList, options = { thread: 20, bigFile: 1024 * 100, timeout: 10 * 1000 }, meta = { checkPointMap: new Map() }) {
    let { checkPointMap } = meta
    return new Promise((resolve, reject) => {
      if (fileList.some(f => typeof (f) !== 'object' || !f.src || !f.dst || typeof (f.src) !== 'string' || typeof (f.dst) !== 'string')) {
        return reject(new Error('putList: Incorrect input!'))
      }
      async function putFile (file, done) {
        try {
          if (file.size >= options.bigFile) {
            let multiOptions = {
              progress: function * (_, checkPoint) {
                checkPointMap.set(file.dst, checkPoint)
              }
            }
            if (checkPointMap.has(file.dst)) {
              options.checkpoint = checkPointMap.get(file.dst)
            } else {
              options.partSize = 1024 * 100
            }
            const result = await this.multipartUpload(file.dst, file.src, multiOptions)
            checkPointMap.delete(file.dst)
            done(null, result)
          } else {
            const result = await this.put(file.dst, file.src, { timeout: options.timeout })
            done(null, result)
          }
        } catch (err) {
          err.checkPointMap = checkPointMap
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
      if (fileList.some(f => typeof (f) !== 'string')) {
        return reject(new Error('deleteList: Incorrect input!'))
      }
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
  syncDir (directory, prefix, options = { delete: true, retryLimit: null }, meta = { checkPointMap: new Map() }) {
    return new Promise((resolve, reject) => {
      if (typeof (directory) !== 'string' || typeof (prefix) !== 'string') {
        return reject(new Error('syncDir: Incorrect input!'))
      }
      resolve = meta.resolve || resolve
      reject = meta.reject || reject
      const tried = (meta.tried || 0) + 1
      const { retryLimit } = options
      let { checkPointMap } = meta
      if (retryLimit && Number.isInteger(retryLimit) && tried > retryLimit) {
        return reject(new Error('Retry limit exceeded!'))
      }

      let putResults = []
      let deleteResults = []

      // 1. Prepare local files
      // a. check if directory exists
      if (!isThere(directory)) {
        return reject(new Error(`Path ${directory} does not exist!`))
      }
      // b. construct list of local files
      let localFiles = new Map()
      const walker = walk.walk(directory)
      walker.on('file', (root, stat, next) => {
        const dst = `${prefix}${root.substr(directory.length)}/${stat.name}`
        const src = `${root}/${stat.name}`
        localFiles.set(dst, {
          dst,
          src,
          mtime: stat.mtime.toISOString(),
          size: stat.size
        })
        next()
      })

      walker.on('end', async () => {
        // 2. Check exiting files on OSS
        let cloudFiles = new Map()
        try {
          const cloudFileList = await this.listDir(prefix, ['name', 'lastModified'])
          cloudFileList.forEach(f => cloudFiles.set(f.name, f))
        } catch (err) {
          // catch the ResponseTimeoutError, and re-try
          if (err && err.name === 'ResponseTimeoutError' || err.name === 'ConnectionTimeoutError') {
            return setTimeout(() => this.syncDir(directory, prefix, options, { resolve, reject, tried, checkPointMap }), 3000)
          } else {
            return reject(err)
          }
        }

        // 3. Construct a list of files to upload
        let uploadFiles = []
        for (let f of localFiles.values()) {
          const existed = cloudFiles.get(f.dst)
          if (existed) {
            if (moment(f.mtime).isAfter(moment(existed.lastModified))) {
              uploadFiles.push(f)
            }
          } else {
            uploadFiles.push(f)
          }
        }

        // 4. Put a list of files to OSS
        try {
          putResults = await this.putList(uploadFiles, undefined, { checkPointMap })
        } catch (err) {
          // catch the ResponseTimeoutError, and re-try
          if (err && err.name === 'ResponseTimeoutError' || err.name === 'ConnectionTimeoutError') {
            return setTimeout(() => this.syncDir(directory, prefix, options, { resolve, reject, tried, checkPointMap: err.checkPointMap }), 3000)
          } else {
            return reject(err)
          }
        }

        // 5. Construct a list of files to delete
        let deleteFiles = []
        if (options.delete) {
          for (let f of cloudFiles.values()) {
            const existed = localFiles.get(f.name)
            if (!existed) {
              deleteFiles.push(f)
            }
          }

          // 6. Delete a list of files from OSS
          try {
            deleteResults = await this.deleteList(deleteFiles)
          } catch (err) {
            // catch the ResponseTimeoutError, and re-try
            if (err && err.name === 'ResponseTimeoutError' || err.name === 'ConnectionTimeoutError') {
              return setTimeout(() => this.syncDir(directory, prefix, options, { resolve, reject, tried, checkPointMap }), 3000)
            } else {
              return reject(err)
            }
          }
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
    if (typeof (prefix) !== 'string') {
      throw new Error('listDir: Incorrect input!')
    }
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

  /**
   * Delete a directory on OSS recursively.
   */
  deleteDir (prefix, options = { retryLimit: null }, meta = {}) {
    return new Promise(async (resolve, reject) => {
      if (typeof (prefix) !== 'string') {
        return reject(new Error('deleteDir: Incorrect input!'))
      }
      resolve = meta.resolve || resolve
      reject = meta.reject || reject
      const tried = (meta.tried || 0) + 1
      const { retryLimit } = options
      if (retryLimit && Number.isInteger(retryLimit) && tried > retryLimit) {
        return reject(new Error('Retry limit exceeded!'))
      }

      let objects = []
      try {
        objects = (await this.listDir(prefix, ['name'])).map(x => x.name)
      } catch (err) {
        if (err && err.name === 'ResponseTimeoutError' || err.name === 'ConnectionTimeoutError') {
          return setTimeout(() => this.deleteDir(prefix, { resolve, reject, tried }), 3000)
        } else {
          return reject(err)
        }
      }
      let results = []
      let cargo = Async.cargo(async (tasks, done) => {
        try {
          const data = await this.deleteMulti(tasks)
          results = [...results, ...data.deleted]
          done(null, data)
        } catch (err) {
          if (err && err.name === 'ResponseTimeoutError' || err.name === 'ConnectionTimeoutError') {
            return setTimeout(() => this.deleteDir(prefix, { resolve, reject, tried }), 3000)
          } else {
            return reject(err)
          }
        }
      }, 1000)

      cargo.push(objects, (err, data) => {
        if (err) {
          return reject(err)
        }
      })

      cargo.drain = (err, data) => {
        if (err) {
          return reject(err)
        }
        resolve(results)
      }
    })
  }

  /**
   * Set the content-disposition header of a file.
   */
  async setDownloadName (file, downloadName) {
    if (typeof (file) !== 'string' || typeof (downloadName) !== 'string') {
      throw new Error('setDownloadName: Incorrect input!')
    }
    return await this.copy(file, file, {
      headers: {
        'Content-Type': 'binary/octet-stream',
        'Content-Disposition': `attachment; filename="${downloadName}"`
      }
    })
  }
}

// export default OSSSyncDir
module.exports = OSSSyncDir
