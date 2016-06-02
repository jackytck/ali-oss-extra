import { Wrapper as OSS } from 'ali-oss'
import { pick, cloneDeep, uniqBy, sortBy } from 'lodash'
import walk from 'walk'
import Async from 'async'
import isThere from 'is-there'
import moment from 'moment'

class OSSExtra extends OSS {
  putList (fileList, { thread = 10, bigFile = 1024 * 500, partSize = 1024 * 500, timeout = 60 * 1000, ulimit = 512, verbose = false } = {}, { putResults = [], checkPointMap = new Map(), uploadFilesMap = new Map() } = {}) {
    return new Promise((resolve, reject) => {
      if (fileList.some(f => typeof (f) !== 'object' || !f.src || !f.dst || typeof (f.src) !== 'string' || typeof (f.dst) !== 'string' || typeof (f.size) !== 'number')) {
        return reject(new Error('putList: Incorrect input!'))
      }
      async function putFile (file, done) {
        try {
          if (file.size >= bigFile) {
            let multiOptions = {
              progress: function * (_, checkPoint) {
                checkPointMap.set(file.dst, checkPoint)
              }
            }
            if (checkPointMap.has(file.dst)) {
              multiOptions.checkpoint = cloneDeep(checkPointMap.get(file.dst))
            } else {
              multiOptions.partSize = Math.max(Math.ceil(file.size / ulimit), partSize)
            }
            const result = await this.multipartUpload(file.dst, file.src, multiOptions)
            checkPointMap.delete(file.dst)
            uploadFilesMap.delete(file.dst)
            putResults.push(result)
            if (verbose) {
              console.log(`Uploaded: ${file.dst}, Remaining: ${uploadFilesMap.size}`)
            }
            done()
          } else {
            const result = await this.put(file.dst, file.src, { timeout: timeout })
            uploadFilesMap.delete(file.dst)
            putResults.push(result)
            if (verbose) {
              console.log(`Uploaded: ${file.dst}, Remaining: ${uploadFilesMap.size}`)
            }
            done()
          }
        } catch (err) {
          err.checkPointMap = checkPointMap
          done(err)
        }
      }
      fileList = sortBy(fileList, 'size')
      Async.mapLimit(fileList, thread, putFile.bind(this), (err, results) => {
        if (err) {
          return reject(err)
        }
        resolve(putResults)
      })
    })
  }

  deleteList (fileList, { thread = 20, verbose = false } = {}, { deleteResults = [], deleteFilesMap = new Map() } = {}) {
    return new Promise((resolve, reject) => {
      if (fileList.some(f => typeof (f) !== 'object' || !f.name || typeof (f.name) !== 'string')) {
        return reject(new Error('deleteList: Incorrect input!'))
      }
      async function deleteFile (file, done) {
        try {
          const result = await this.delete(file.name)
          deleteFilesMap.delete(file.name)
          deleteResults.push(result)
          if (verbose) {
            console.log(`Deleted: ${file.name}, Remaining: ${deleteFilesMap.size}`)
          }
          done()
        } catch (err) {
          done(err)
        }
      }
      Async.mapLimit(fileList, thread, deleteFile.bind(this), (err, results) => {
        if (err) {
          return reject(err)
        }
        resolve(deleteResults)
      })
    })
  }

  /**
   * Get a map of local files.
   */
  _getLocalFilesMap (directory, prefix) {
    return new Promise((resolve, reject) => {
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
        resolve(localFiles)
      })
    })
  }

  /**
   * Get a map of cloud files.
   */
  _getCloudFilesMap (prefix, options = { retryLimit: null }, meta = {}) {
    return new Promise(async (resolve, reject) => {
      let cloudFiles = new Map()
      const trial = (meta.trial || 0) + 1
      try {
        const cloudFileList = await this.listDir(prefix, ['name', 'lastModified'])
        cloudFileList.forEach(f => cloudFiles.set(f.name, f))
        resolve(cloudFiles)
      } catch (err) {
        // catch the ResponseTimeoutError, and re-try
        if (err && err.name === 'ResponseTimeoutError' || err.name === 'ConnectionTimeoutError' || err.name === 'RequestError' || err.name === 'ResponseError') {
          const { retryLimit } = options
          if (retryLimit && Number.isInteger(retryLimit)) {
            if (trial < retryLimit) {
              setTimeout(() => resolve(this._getCloudFilesMap(prefix, options, { trial })), 3000)
            } else {
              reject(new Error('Retry limit exceeded!'))
            }
          } else {
            setTimeout(() => resolve(this._getCloudFilesMap(prefix)), 3000)
          }
        } else {
          reject(err)
        }
      }
    })
  }

  /**
   * As in:
   * s3 sync ${directory} s3://bucket/${prefix} --delete
   */
  syncDir (directory, prefix, { remove = true, retryLimit = null, verbose = false } = {}, { retrying = false, lastResolve = null, lastReject = null, putResults = [], deleteResults = [], checkPointMap = new Map(), uploadFilesMap = new Map(), deleteFilesMap = new Map(), trial = 0 } = {}) {
    const options = { remove, retryLimit, verbose }
    return new Promise(async (resolve, reject) => {
      if (typeof (directory) !== 'string' || typeof (prefix) !== 'string') {
        return reject(new Error('syncDir: Incorrect input!'))
      }
      if (lastResolve) {
        resolve = lastResolve
      }
      if (lastReject) {
        reject = lastReject
      }
      if (retryLimit && Number.isInteger(retryLimit) && trial > retryLimit) {
        if (verbose) {
          console.error('syncDir: Retry limit exceeded!')
        }
        return reject(new Error('Retry limit exceeded!'))
      }

      let localFilesMap = new Map()
      let cloudFilesMap = new Map()

      // 1. Get local and cloud files, if not retrying
      if (!retrying) {
        try {
          localFilesMap = await this._getLocalFilesMap(directory, prefix)
          cloudFilesMap = await this._getCloudFilesMap(prefix, options)
          if (verbose) {
            console.log(`Local files: ${localFilesMap.size}`)
            console.log(`Cloud files: ${cloudFilesMap.size}`)
          }
        } catch (err) {
          return reject(err)
        }

        // 2. Prepare a list of files to upload
        for (let f of localFilesMap.values()) {
          const existed = cloudFilesMap.get(f.dst)
          if (existed) {
            if (moment(f.mtime).isAfter(moment(existed.lastModified).add(1, 's'))) {
              uploadFilesMap.set(f.dst, f)
            }
          } else {
            uploadFilesMap.set(f.dst, f)
          }
        }

        // 3. Prepare a list of files to remove
        if (remove) {
          for (let f of cloudFilesMap.values()) {
            const existed = localFilesMap.get(f.name)
            if (!existed) {
              deleteFilesMap.set(f.name, f)
            }
          }
        }
      }

      // 3. Put a list of files to OSS
      if (verbose) {
        console.log(`Files to upload: ${uploadFilesMap.size}`)
      }
      try {
        await this.putList([...uploadFilesMap.values()], { verbose }, { putResults, checkPointMap, uploadFilesMap })
      } catch (err) {
        // catch the request or response or timeout errors, and re-try
        if (err && err.name === 'ResponseTimeoutError' || err.name === 'ConnectionTimeoutError' || err.name === 'RequestError' || err.name === 'ResponseError' || err.name === 'NoSuchUploadError') {
          if (verbose) {
            console.log(`Upload ${err.name}, retrying...`)
          }
          if (err.name === 'NoSuchUploadError') {
            err.checkPointMap.delete(err.params.object)
          }
          trial++
          return this.syncDir(directory, prefix, options, { retrying: true, lastResolve: resolve, lastReject: reject, trial, putResults, checkPointMap: err.checkPointMap, uploadFilesMap, deleteFilesMap })
        } else {
          return reject(err)
        }
      }

      if (remove) {
        if (verbose) {
          console.log(`Files to delete: ${deleteFilesMap.size}`)
        }
        // 5. Delete a list of files from OSS
        try {
          await this.deleteList([...deleteFilesMap.values()], { verbose }, { deleteResults, deleteFilesMap })
        } catch (err) {
          // catch the request or response or timeout errors, and re-try
          if (err && err.name === 'ResponseTimeoutError' || err.name === 'ConnectionTimeoutError' || err.name === 'RequestError' || err.name === 'ResponseError') {
            if (verbose) {
              console.log(`Delete ${err.name}, retrying...`)
            }
            trial++
            return this.syncDir(directory, prefix, options, { retrying: true, lastResolve: resolve, lastReject: reject, trial, putResults, deleteResults, checkPointMap, uploadFilesMap, deleteFilesMap })
          } else {
            return reject(err)
          }
        }
      }

      resolve({
        put: uniqBy(putResults, 'name'),
        delete: uniqBy(deleteResults, 'res.requestUrls[0]')
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
  deleteDir (prefix, { retryLimit = null } = {}, meta = {}) {
    return new Promise(async (resolve, reject) => {
      if (typeof (prefix) !== 'string') {
        return reject(new Error('deleteDir: Incorrect input!'))
      }
      resolve = meta.resolve || resolve
      reject = meta.reject || reject
      const trial = (meta.trial || 0) + 1
      if (retryLimit && Number.isInteger(retryLimit) && trial > retryLimit) {
        return reject(new Error('Retry limit exceeded!'))
      }

      let objects = []
      try {
        objects = (await this.listDir(prefix, ['name'])).map(x => x.name)
      } catch (err) {
        if (err && err.name === 'ResponseTimeoutError' || err.name === 'ConnectionTimeoutError' || err.name === 'RequestError' || err.name === 'ResponseError') {
          return this.deleteDir(prefix, { retryLimit }, { resolve, reject, trial })
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
          if (err && err.name === 'ResponseTimeoutError' || err.name === 'ConnectionTimeoutError' || err.name === 'RequestError' || err.name === 'ResponseError') {
            return this.deleteDir(prefix, { retryLimit }, { resolve, reject, trial })
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

export default OSSExtra
