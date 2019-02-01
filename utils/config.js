
const fallbacks = {
  GITCHAIN_REST_ENDPOINT: "http://localhost:8008/",
  SERVER_PORT: 5000
};

function defaultConfig(env, explicit) {
  return explicit || process.env[env] || fallbacks[env];
}

module.exports = { defaultConfig };