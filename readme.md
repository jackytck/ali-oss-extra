[![NPM version][npm-image]][npm-url]
[![build status][travis-image]][travis-url]
[![codecov][codecov-image]][codecov-url]
[![Codacy][codacy-image]][codacy-url]
[![devDependency Status][david-image]][david-url]
[![devDevDependency Status][david-image-dev]][david-url-dev]

[npm-image]: https://img.shields.io/npm/v/ali-oss-extra.svg
[npm-url]: https://npmjs.org/package/ali-oss-extra
[travis-image]: https://travis-ci.org/jackytck/ali-oss-extra.svg?branch=master
[travis-url]: https://travis-ci.org/jackytck/ali-oss-extra
[codecov-image]: https://codecov.io/gh/jackytck/ali-oss-extra/branch/master/graph/badge.svg
[codecov-url]: https://codecov.io/gh/jackytck/ali-oss-extra
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

* listDir (prefix, projection = [])
* syncDir (directory, prefix, options = { delete: true, retryLimit: null }, meta = { checkPointMap: new Map() })
* deleteDir (prefix, meta = { retryLimit: null })
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

But every method returns the promised version, which could be combined with async/await:

```js
// List top 10 buckets
const result = await store.listBuckets({ 'max-keys': 10 })
console.log(result);
```
### License

MIT
