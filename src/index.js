import { cloneDeep, pick, sortBy, uniqBy } from 'lodash'

import Async from 'async'
import OSS from 'ali-oss'
import fs from 'fs-extra-promise'
import isThere from 'is-there'
import moment from 'moment'
import walk from 'walk'

class OSSExtra extends OSS {
  putList (fileList, { thread = 10, defaultHeader = {}, headersMap = new Map(), bigFile = 1024 * 500, partSize = 1024 * 500, timeout = 120 * 1000, ulimit = 1024, verbose = false } = {}, { putResultsMap = new Map(), checkPointMap = new Map(), uploadFilesMap = new Map() } = {}) {
    return new Promise((resolve, reject) => {
      if (fileList.some(f => typeof (f) !== 'object' || !f.src || !f.dst || typeof (f.src) !== 'string' || typeof (f.dst) !== 'string' || typeof (f.size) !== 'number')) {
        return reject(new Error('putList: Incorrect input!'))
      }
      async function putFile (file, done) {
        if (putResultsMap.has(file.dst)) {
          return done()
        }
        try {
          const headers = Object.assign({}, defaultHeader, headersMap.get(file.dst))
          if (file.size >= bigFile) {
            const multiOptions = {
              headers,
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
            putResultsMap.set(file.dst, result)
            if (verbose) {
              console.log(`Uploaded: ${file.dst}, Remaining: ${uploadFilesMap.size}`)
            }
            done()
          } else {
            const result = await this.put(file.dst, file.src, { headers, timeout })
            uploadFilesMap.delete(file.dst)
            putResultsMap.set(file.dst, result)
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
        resolve([...putResultsMap.values()])
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
  _getLocalFilesMap (directory, prefix, ignoreList = []) {
    function isIgnore (src) {
      return ignoreList.some(dir => src.startsWith(`${directory}/${dir}/`) || src === `${directory}/${dir}`)
    }

    return new Promise((resolve, reject) => {
      // a. check if directory exists
      if (!isThere(directory)) {
        return reject(new Error(`Path ${directory} does not exist!`))
      }

      // b. construct list of local files
      const localFiles = new Map()
      const walker = walk.walk(directory)
      walker.on('file', (root, stat, next) => {
        const dst = `${prefix}${root.substr(directory.length)}/${stat.name}`
        const src = `${root}/${stat.name}`
        if (!isIgnore(src)) {
          localFiles.set(dst, {
            dst,
            src,
            mtime: stat.mtime.toISOString(),
            size: stat.size
          })
        }
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
  async _getCloudFilesMap (prefix, options = { retryLimit: null }, meta = {}) {
    const cloudFiles = new Map()
    const trial = (meta.trial || 0) + 1
    try {
      const cloudFileList = await this.listDir(prefix, ['name', 'lastModified'])
      cloudFileList.forEach(f => cloudFiles.set(f.name, f))
      return cloudFiles
    } catch (err) {
      if (err && (err.name === 'ResponseTimeoutError' || err.name === 'ConnectionTimeoutError' || err.name === 'RequestError' || err.name === 'ResponseError')) {
        const { retryLimit } = options
        if (retryLimit && Number.isInteger(retryLimit)) {
          if (trial < retryLimit) {
            return this._getCloudFilesMap(prefix, options, { trial })
          } else {
            throw new Error('Retry limit exceeded!')
          }
        } else {
          return this._getCloudFilesMap(prefix)
        }
      } else {
        throw err
      }
    }
  }

  /**
   * As in:
   * s3 sync ${directory} s3://bucket/${prefix} --delete
   */
  async syncDir (directory, prefix,
    { remove = true, ignoreList = [], defaultHeader = {}, headersMap = new Map(), retryLimit = null, thread = 10, timeout = 120 * 1000, ulimit = 1024, verbose = false } = {},
    { retrying = false, putResultsMap = new Map(), deleteResults = [], checkPointMap = new Map(), uploadFilesMap = new Map(), deleteFilesMap = new Map(), trial = 0 } = {}) {
    const options = { remove, ignoreList, defaultHeader, headersMap, retryLimit, thread, timeout, ulimit, verbose }
    // return new Promise(async (resolve, reject) => {
    if (typeof (directory) !== 'string' || typeof (prefix) !== 'string') {
      // return reject(new Error('syncDir: Incorrect input!'))
      throw new Error('syncDir: Incorrect input!')
    }
    if (retryLimit && Number.isInteger(retryLimit) && trial > retryLimit) {
      if (verbose) {
        console.error('syncDir: Retry limit exceeded!')
      }
      throw new Error('Retry limit exceeded!')
    }

    let localFilesMap = new Map()
    let cloudFilesMap = new Map()

    // 1. Get local and cloud files, if not retrying
    if (!retrying) {
      localFilesMap = await this._getLocalFilesMap(directory, prefix, ignoreList)
      cloudFilesMap = await this._getCloudFilesMap(prefix, options)
      if (verbose) {
        console.log(`Local files: ${localFilesMap.size}`)
        console.log(`Cloud files: ${cloudFilesMap.size}`)
      }

      // 2. Prepare a list of files to upload
      for (const f of localFilesMap.values()) {
        const existed = cloudFilesMap.get(f.dst)
        if (existed) {
          // sometimes, clocks in oss servers are 2s slower,
          // adding the round off error, so about 5s is needed
          if (moment(f.mtime).isAfter(moment(existed.lastModified).add(5, 's'))) {
            uploadFilesMap.set(f.dst, f)
          }
        } else {
          uploadFilesMap.set(f.dst, f)
        }
      }

      // 3. Prepare a list of files to remove
      if (remove) {
        for (const f of cloudFilesMap.values()) {
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
      await this.putList([...uploadFilesMap.values()], options, { putResultsMap, checkPointMap, uploadFilesMap })
    } catch (err) {
      // catch the request or response or timeout errors, and re-try
      if (err && (err.name === 'ResponseTimeoutError' || err.name === 'ConnectionTimeoutError' || err.name === 'RequestError' || err.name === 'ResponseError' || err.name === 'NoSuchUploadError')) {
        if (verbose) {
          console.log(`Upload ${err.name}, retrying...`)
        }
        if (err.name === 'NoSuchUploadError') {
          err.checkPointMap.delete(err.params.object)
        }
        trial++
        return this.syncDir(directory, prefix, options, { retrying: true, trial, putResultsMap, checkPointMap: err.checkPointMap, uploadFilesMap, deleteFilesMap })
      } else {
        throw err
      }
    }

    if (remove) {
      if (verbose) {
        console.log(`Files to delete: ${deleteFilesMap.size}`)
      }
      // 5. Delete a list of files from OSS
      try {
        await this.deleteList([...deleteFilesMap.values()], options, { deleteResults, deleteFilesMap })
      } catch (err) {
        // catch the request or response or timeout errors, and re-try
        if (err && (err.name === 'ResponseTimeoutError' || err.name === 'ConnectionTimeoutError' || err.name === 'RequestError' || err.name === 'ResponseError')) {
          if (verbose) {
            console.log(`Delete ${err.name}, retrying...`)
          }
          trial++
          return this.syncDir(directory, prefix, options, { retrying: true, trial, putResultsMap, deleteResults, checkPointMap, uploadFilesMap, deleteFilesMap })
        } else {
          throw err
        }
      }
    }

    return {
      put: uniqBy([...putResultsMap.values()], 'name'),
      delete: uniqBy(deleteResults, 'res.requestUrls[0]')
    }
  }

  /**
   * Recursively download from the prefix and store all files in a local directory.
   */
  async syncDirDown (prefix, directory,
    { remove = true, thread = 10, timeout = 120 * 1000, ulimit = 1024, verbose = false } = {}
  ) {
    const options = { remove, thread, timeout, ulimit, verbose }
    let localFilesMap = new Map()
    let cloudFilesMap = new Map()
    const downloadFilesMap = new Map()
    const deleteFilesMap = new Map()

    async function getFile (file, done) {
      const localFilePath = `${directory}${file.name.substr(prefix.length)}`
      try {
        await fs.ensureFileAsync(localFilePath)
        await this.get(file.name, localFilePath)
        if (verbose) {
          downloadFilesMap.delete(file.name)
          console.log(`Downloaded: ${localFilePath}, Remaining: ${downloadFilesMap.size}`)
        }
        done(null, file.name)
      } catch (err) {
        done(err)
      }
    }

    async function deleteFile (file, done) {
      try {
        await fs.removeAsync(file.src)
        if (verbose) {
          deleteFilesMap.delete(file.dst)
          console.log(`Deleted: ${file.src}, Remaining: ${deleteFilesMap.size}`)
        }
        done(null, file.src)
      } catch (err) {
        done(err)
      }
    }

    if (typeof (directory) !== 'string' || typeof (prefix) !== 'string') {
      throw new Error('syncDirDown: Incorrect input!')
    }
    // 1. Get local and cloud files
    cloudFilesMap = await this._getCloudFilesMap(prefix, options)
    await fs.ensureDirAsync(directory)
    localFilesMap = await this._getLocalFilesMap(directory, prefix)

    // 2. Prepare a list of cloud files to download
    for (const f of cloudFilesMap.values()) {
      const existed = localFilesMap.get(f.name)
      if (existed) {
        if (moment(f.lastModified).isAfter(moment(existed.mtime).add(1, 's'))) {
          downloadFilesMap.set(f.name, f)
        }
      } else {
        downloadFilesMap.set(f.name, f)
      }
    }

    // 3. Prepare a list of local files to remove
    if (remove) {
      for (const f of localFilesMap.values()) {
        const existed = cloudFilesMap.get(f.dst)
        if (!existed) {
          deleteFilesMap.set(f.dst, f)
        }
      }
    }

    const downloadFiles = sortBy([...downloadFilesMap.values()], 'name')
    const getResults = await Async.mapLimit(downloadFiles, thread, getFile.bind(this))

    if (remove) {
      const deleteResults = await Async.mapLimit(deleteFilesMap.values(), thread, deleteFile.bind(this))
      return {
        get: getResults,
        delete: deleteResults
      }
    } else {
      return {
        get: getResults
      }
    }
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
  async deleteDir (prefix, { retryLimit = null } = {}, meta = {}) {
    // return new Promise(async (resolve, reject) => {
    if (typeof (prefix) !== 'string') {
      throw new Error('deleteDir: Incorrect input!')
    }
    const trial = (meta.trial || 0) + 1
    if (retryLimit && Number.isInteger(retryLimit) && trial > retryLimit) {
      throw new Error('Retry limit exceeded!')
    }

    let objects = []
    try {
      objects = (await this.listDir(prefix, ['name'])).map(x => x.name)
    } catch (err) {
      if (err && (err.name === 'ResponseTimeoutError' || err.name === 'ConnectionTimeoutError' || err.name === 'RequestError' || err.name === 'ResponseError')) {
        return this.deleteDir(prefix, { retryLimit }, { trial })
      } else {
        throw err
      }
    }
    let results = []
    const cargo = Async.cargo(async (tasks, done) => {
      try {
        const data = await this.deleteMulti(tasks)
        results = [...results, ...data.deleted]
        done(null, data)
      } catch (err) {
        if (err && (err.name === 'ResponseTimeoutError' || err.name === 'ConnectionTimeoutError' || err.name === 'RequestError' || err.name === 'ResponseError')) {
          return this.deleteDir(prefix, { retryLimit }, { trial })
        } else {
          throw err
        }
      }
    }, 1000)

    cargo.push(objects)
    await cargo.drain()
    return results
  }

  /**
   * Set the content-disposition header of a file.
   */
  async setDownloadName (file, downloadName) {
    if (typeof (file) !== 'string' || typeof (downloadName) !== 'string') {
      throw new Error('setDownloadName: Incorrect input!')
    }
    const options = {
      headers: {
        'Content-Type': 'binary/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadName)}"`
      }
    }
    return this.copy(file, file, options)
  }
}

export default OSSExtra
