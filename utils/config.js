const { resolve } = require('url');

const API_BASE = process.env.GITCHAIN_REST_ENDPOINT || "http://localhost:8008/";
const SERVER_PORT = process.env.SERVER_PORT || 5000;

function restApiUrl(path) {
  return resolve(API_BASE, path);
}

module.exports = { API_BASE, restApiUrl, SERVER_PORT };