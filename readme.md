### Install

```bash
npm i -S ali-oss-extra
```

### Extra methods

* listDir (prefix, projection = [])
* syncDir (directory, prefix, options = { delete: true })
* putList (fileList, options = { thread: 20 })
* deleteList (fileList, options = { thread: 20 })

### Usage
Use as a drop-in replacement of 'ali-oss':

```js
import oss from 'ali-oss-extra'

const store = oss({
  accessKeyId: 'your access key',
  accessKeySecret: 'your access secret',
  bucket: 'your bucket name',
  region: 'oss-cn-hangzhou'
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
