import dotenv from 'dotenv'
dotenv.config({ silent: true })

const env = process.env

const OSS = {
  accessKeyId: env.ALI_SDK_OSS_ID,
  accessKeySecret: env.ALI_SDK_OSS_SECRET,
  bucket: env.ALI_SDK_OSS_BUCKET,
  region: env.ALI_SDK_OSS_REGION,
  timeout: env.timeout
}

const TEST_PREFIX = env.ALI_SDK_OSS_TEST_PREFIX

const config = {
  OSS,
  TEST_PREFIX
}

export default config
