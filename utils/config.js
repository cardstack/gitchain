const { resolve } = require('url');

const API_BASE = process.env.GITCHAIN_REST_ENDPOINT || "http://localhost:8008/";
const BLOB_STORAGE = process.env.GITCHAIN_BLOB_STORAGE || 'tmpfile';
const BLOB_STORAGE_TEMP_PATH = process.env.BLOB_STORAGE_TEMP_PATH || 'tmp/blobs';
const SERVER_PORT = process.env.SERVER_PORT || 5000;

function restApiUrl(path) {
  return resolve(API_BASE, path);
}

module.exports = { API_BASE, restApiUrl, BLOB_STORAGE, SERVER_PORT, BLOB_STORAGE_TEMP_PATH };