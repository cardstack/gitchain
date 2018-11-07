const { hash } = require('./signing');

const GITCHAIN_FAMILY    = 'GITCHAIN';
const GITCHAIN_VERSION   = '1.0';
const GITCHAIN_NAMESPACE = hash(GITCHAIN_FAMILY).slice(0, 6);


module.exports = {
  GITCHAIN_FAMILY, GITCHAIN_VERSION, GITCHAIN_NAMESPACE
};
