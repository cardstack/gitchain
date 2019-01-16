const fsBlobStore                                     = require('fs-blob-store');
const { shellCommand }                                = require('../utils/async');
const { BLOB_STORAGE, BLOB_STORAGE_TEMP_PATH }        = require('../utils/config');
const { encrypt, decrypt }                            = require('../utils/encryption');
const { readFileSync, writeSync, createReadStream }   = require('fs');
const concat                                          = require('concat-stream');
const { hash }                                        = require('../utils/signing');
const aws                                             = require('aws-sdk');
const s3blobs                                         = require('s3-blob-store');
const tmp                                             = require('tmp');
const promisepipe                                     = require("promisepipe");


function blobStoreMeta() {
  let info = {};

  if (BLOB_STORAGE === 'tmpfile') {
    info.path = BLOB_STORAGE_TEMP_PATH;
  } else {
    info.bucket = process.env.S3_BUCKET;
  }

  return {
    type: BLOB_STORAGE,
    info
  };
}

async function blobStore() {
  if (BLOB_STORAGE === 'tmpfile') {
    await shellCommand(`mkdir -p ${BLOB_STORAGE_TEMP_PATH}`);
    return fsBlobStore(`${BLOB_STORAGE_TEMP_PATH}`);
  } else {
    let s3Client = new aws.S3({
      accessKeyId:      process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey:  process.env.AWS_SECRET_ACCESS_KEY
    });

    return s3blobs({
      client: s3Client,
      bucket: process.env.S3_BUCKET
    });
  }
}

async function encryptToBlobStore(filePath, storageKey, encryptionKey) {
  let blob = readFileSync(filePath, 'utf8');
  let encryptedBlob = encrypt(blob, encryptionKey);
  await writeToBlobStream(storageKey, encryptedBlob);
}

async function writeToBlobStream(key, blob) {
  let store = await blobStore();
  let writeStream = store.createWriteStream({ key });
  let tmpfile = tmp.fileSync();
  writeSync(tmpfile.fd, blob);
  let readStream = createReadStream(tmpfile.name);
  await promisepipe(readStream, writeStream);
}

async function readFromBlobStream(key) {
  let store = await blobStore();
  let readStream = store.createReadStream({ key });
  let buffer = await new Promise((resolve, reject) => {
    let concatStream = concat(resolve);
    readStream.pipe(concatStream);
    readStream.on('error', reject);
  });
  return buffer;
}

async function decryptBlob(storageKey, decryptionKey, sha) {
  let encryptedData = await readFromBlobStream(storageKey);
  if (sha === hash(encryptedData)) {
    // already decrypted
    return;
  }
  let decryptedData = decrypt(encryptedData, decryptionKey);

  if (sha !== hash(decryptedData)) {
    throw new Error("Decrypted data does not match expected hash");
  }

  await writeToBlobStream(storageKey, decryptedData);
}


module.exports = {
  blobStore, encryptToBlobStore, writeToBlobStream, readFromBlobStream, decryptBlob, blobStoreMeta
};

