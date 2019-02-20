const { makeSawtoothKey }   = require('./utils/keygen');
const { resolve }           = require('path');
const util                  = require('util');
const writeFile             = util.promisify(require('fs').writeFile);
const { shellCommand }      = require('./utils/async');
const options               = require('options-parser');
const logger                = require('debug')('gitchain-cli');
const { Gitchain }          = require('./gitchain');

class CLI {
  constructor(parsed, log=logger) {
    this.command    = parsed.args[0];
    this.arguments  = parsed.args.slice(1);
    this.options    = parsed.opt;
    this.log        = log;
  }

  async execute() {
    return await this[this.command].call(this);
  }

  async push () {
    let [repoPath] = this.arguments;

    let gitchain = new Gitchain(repoPath, { logger: this.log, keyDir: this.options.keydir });

    return await gitchain.push(this.options.commit);
  }

  async clone() {
    let [headSha, repoPath] = this.arguments;

    let gitchain = new Gitchain(repoPath, { logger: this.log, keyDir: this.options.keydir });

    await gitchain.clone(headSha);
  }

  async keygen() {
    await shellCommand(`mkdir -p "${this.options.keydir}"`);

    let privateKey = makeSawtoothKey();
    let privateKeyPath = resolve(this.options.keydir, 'sawtooth.priv');


    await writeFile(privateKeyPath, privateKey.privateKeyBytes.hexSlice());
  }

  async status() {
    let [repoPath] = this.arguments;

    let gitchain = new Gitchain(repoPath, { logger: this.log, keyDir: this.options.keydir });

    return await gitchain.status();
  }
}

const opts = {
  keydir: {
    required: false,
    short: 'k'
  },
  commit: {
    required: false,
    short: 'c'
  }
};

module.exports = { CLI, opts };

if (require.main.filename === __filename) {
  let parsedOpts = options.parse(opts);
  // eslint-disable-next-line no-console
  new CLI(parsedOpts, console.log).execute();
}