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
    let [repoPath, tag] = this.arguments;

    let gitchain = new Gitchain(repoPath, { logger: this.log, keyDir: this.options.keydir, bundle: this.options.bundle });

    return await gitchain.push(tag);
  }

  async clone() {
    let [tag, repoPath] = this.arguments;

    let gitchain = new Gitchain(repoPath, { logger: this.log, keyDir: this.options.keydir });

    await gitchain.clone(tag);
  }

  async keygen() {
    await shellCommand(`mkdir -p "${this.options.keydir}"`);

    let privateKey = makeSawtoothKey();
    let privateKeyPath = resolve(this.options.keydir, 'sawtooth.priv');


    await writeFile(privateKeyPath, privateKey.privateKeyBytes.hexSlice());
  }

  async head() {
    let [tag] = this.arguments;

    return await Gitchain.head(tag || "", { logger: this.log});
  }

  async pull() {
    let [tag, repoPath] = this.arguments;

    let gitchain = new Gitchain(repoPath, { logger: this.log, keyDir: this.options.keydir });

    await gitchain.pull(tag);
  }
}

const opts = {
  keydir: {
    required: false,
    short: 'k'
  }
};

module.exports = { CLI, opts };

if (require.main.filename === __filename) {
  let parsedOpts = options.parse(opts);
  // eslint-disable-next-line no-console
  new CLI(parsedOpts, console.log).execute();
}