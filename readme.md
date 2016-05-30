[![NPM version][npm-image]][npm-url]
[![build status][travis-image]][travis-url]
[![codecov][codecov-image]][codecov-url]
[![Coverage Status][coverall-image]][coverall-url]
[![Codacy][codacy-image]][codacy-url]
[![devDependency Status][david-image]][david-url]
[![devDevDependency Status][david-image-dev]][david-url-dev]

[npm-image]: https://img.shields.io/npm/v/ali-oss-extra.svg
[npm-url]: https://npmjs.org/package/ali-oss-extra
[travis-image]: https://travis-ci.org/jackytck/ali-oss-extra.svg?branch=master
[travis-url]: https://travis-ci.org/jackytck/ali-oss-extra
[codecov-image]: https://codecov.io/gh/jackytck/ali-oss-extra/branch/master/graph/badge.svg
[codecov-url]: https://codecov.io/gh/jackytck/ali-oss-extra
[coverall-image]: https://coveralls.io/repos/github/jackytck/ali-oss-extra/badge.svg?branch=master
[coverall-url]: https://coveralls.io/github/jackytck/ali-oss-extra?branch=master
[codacy-image]: https://api.codacy.com/project/badge/Grade/17798fbc8e0341b890ccb3b6631c2770
[codacy-url]: https://www.codacy.com/app/jackytck/ali-oss-extra?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=jackytck/ali-oss-extra&amp;utm_campaign=Badge_Grade
[david-image]: https://david-dm.org/jackytck/ali-oss-extra.svg
[david-url]: https://david-dm.org/jackytck/ali-oss-extra
[david-image-dev]: https://david-dm.org/jackytck/ali-oss-extra/dev-status.svg
[david-url-dev]: https://david-dm.org/jackytck/ali-oss-extra#info=devDependencies

### Install

```bash
npm i -S ali-oss-extra
```

### Extra methods

* [`listDir`](#listDir)
* [`syncDir`](#syncDir)
* [`deleteDir`](#deleteDir)
* putList (fileList, options = { thread: 20, bigFile: 1024 * 500, partSize: 1024 * 500, timeout: 10 * 1000, ulimit: 512}, meta = { checkPointMap: new Map() })
* deleteList (fileList, options = { thread: 20 })
* setDownloadName (file, downloadName)

### Usage
Use as a drop-in replacement of 'ali-oss':

```js
import OSS from 'ali-oss-extra'

const store = new OSS({
  accessKeyId: 'your access key',
  accessKeySecret: 'your access secret',
  bucket: 'your bucket name',
  region: 'oss-cn-hongkong'
})
```

All methods from ali-oss are available. But every method returns a promise, which could be used in async/await:

```js
// List top 10 buckets
const result = await store.listBuckets({ 'max-keys': 10 })
```

Return:
```js
{ buckets:
   [ { name: 'my-bucket',
       region: 'oss-us-west-1',
       creationDate: '2016-05-29T12:13:03.000Z' },
     { name: 'my-data',
       region: 'oss-cn-shenzhen',
       creationDate: '2016-05-14T08:02:46.000Z' },
     { name: 'my-data-bj-dev',
       region: 'oss-cn-beijing',
       creationDate: '2016-05-24T15:17:53.000Z' },
     { name: 'my-data-dev2',
       region: 'oss-cn-shenzhen',
       creationDate: '2016-05-14T08:02:19.000Z' },
   ...
```

---------------------------------------

<a name="listDir"></a>
### listDir (prefix, projection = [])
List all files under a prefix. **Not** limited to 1000 files.
```js
// List all files in a prefix
const result = await store.listDir('user_data')
```
Return:
```js
[ { name: 'user_data/web/f44dc4cd8976c254362c251a5bc3cfc3.txt',
    url: 'http://my-bucket.oss-us-west-1.aliyuncs.com/user_data/web/f44dc4cd8976c254362c251a5bc3cfc3.txt',
    lastModified: '2016-05-29T12:14:15.000Z',
    etag: '"A81DD21E0322B643AB6F6782B5C96012"',
    type: 'Normal',
    size: 443,
    storageClass: 'Standard',
    owner: { id: '1400663040702136', displayName: '1400663040702136' } },
  { name: 'user_data/web/f460cb792b6c7fd5e21a2f311faaa3b0.ab.png',
    url: 'http://my-bucket.oss-us-west-1.aliyuncs.com/user_data/web/f460cb792b6c7fd5e21a2f311faaa3b0.ab.png',
    lastModified: '2016-05-29T12:14:16.000Z',
    etag: '"26D3700FCF7421B723A7AE2F794DC361"',
    type: 'Normal',
    size: 230547,
    storageClass: 'Standard',
    owner: { id: '1400663040702136', displayName: '1400663040702136' } },
...]
```

---------------------------------------

<a name="syncDir"></a>
### syncDir (directory, prefix, options)

__Options__
* `remove` - Remove file on OSS if it is not appeared in local directory
* `retryLimit` - Number of times to retry after timeout
* `verbose` - Print debug log

Synchronize a local directory to OSS recursively. Support uploading directory with large number of small or big files.

If a file of the same name exists and its last modified time is not older than the local one, then it will not be uploaded.
```js
const result = await store.syncDir('./localDir', 'a_dir')
```
Return:
```js
{
  "put": [
    {
      "name": "a_dir/fileA1.txt",
      "url": "http://my-bucket.oss-us-west-1.aliyuncs.com/a_dir/fileA1.txt",
      "res": {
        "status": 200,
        "statusCode": 200,
        "headers": {
          "server": "AliyunOSS",
          "date": "Mon, 30 May 2016 08:10:37 GMT",
          "content-length": "0",
          "connection": "keep-alive",
          "x-oss-request-id": "574BF57D16FDA15402D9D84C",
          "x-oss-bucket-storage-type": "standard",
          "etag": "\"7EED2CD60D1E86FE16B0F7AB89C89D0E\"",
          "x-oss-server-time": "4"
        },
        "size": 0,
        "aborted": false,
        "rt": 176,
        "keepAliveSocket": true,
        "data": {
          "type": "Buffer",
          "data": []
        },
        "requestUrls": [
          "http://my-bucket.oss-us-west-1.aliyuncs.com/a_dir/fileA1.txt"
        ]
      }
    },
    ...
  ],
  "delete": []
}
```

---------------------------------------

<a name="deleteDir"></a>
### deleteDir (prefix, options)

__Options__
* `retryLimit` - Number of times to retry after timeout

Delete a directory recursively. **Not** limited to 1000 files.
```js
const result = await store.deleteDir('a_dir')
```
Returns:
```js
[ 
  'a_dir/b/c/d/fileD1.txt',
  'a_dir/b/c/d/fileD2.txt',
  'a_dir/b/c/d/fileD3.txt',
  'a_dir/b/c/fileC1.txt',
  'a_dir/b/c/fileC2.txt',
  'a_dir/fileA1.txt',
  'a_dir/fileA2.txt',
  ...
]
```

### License

MIT
