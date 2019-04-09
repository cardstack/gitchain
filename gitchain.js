const { defaultConfig }   = require('./utils/config');
const { submitAndPoll }   = require('./lib/send-transaction');
const defaultLogger       = require('debug')('gitchain');
const request             = require('request-promise-native');
const url                 = require('url');
const { decodePayload }   = require('./utils/encryption');
const { get }             = require('lodash');


const fs = require('fs');
const Git = require('isomorphic-git');
Git.plugins.set('fs', fs);

const { writeToBlobStream, readFromBlobStream, blobStoreMeta }   = require('./lib/blob-storage');
const { tagAddress, commitAddress }  = require("./utils/address");
const { readFileSync, writeFileSync, existsSync }        = require('fs');
const { resolve, join }             = require('path');


class Gitchain {
  constructor(repoPath, { logger, cache, apiBase, blobStorage, privateKey, keyDir }={}) {
    this.repoPath   = repoPath;
    this.gitDir     = join(this.repoPath, '.git');
    if(existsSync(repoPath) && !existsSync(this.gitDir)) {
      // treat it as a bare repo because it exists buts it doesn't have a .git dir in it
      this.gitDir = this.repoPath;
    }
    this.keyDir     = keyDir;
    this.log        = logger || defaultLogger;
    this.apiBase    = defaultConfig('GITCHAIN_REST_ENDPOINT', apiBase);
    this.cache      = cache || {
      writtenToBlockchain: {},
      writtenToBlobStore: {}
    };

    this.blobStorageConfig = blobStorage || {
      type: 'tmpfile',
      path: 'tmp/blobs'
    };

    this.privateKey = privateKey;
  }

  static async head(tag, { logger, apiBase } = {}) {
    let log = logger || defaultLogger;

    apiBase = apiBase || defaultConfig('GITCHAIN_REST_ENDPOINT', apiBase);

    log(`Checking status of tag ${tag}`);


    let address = tagAddress(tag);
    let push = await request(Gitchain.restApiUrl(`state/${address}`, apiBase), {json: true});

    let payload = decodePayload(push.data);
    let headSha = payload.data.attributes['head-sha'];

    log(`Sha of ${tag} is ${headSha}`);

    return headSha;
  }

  static async tagUrl(tag, { logger, apiBase } = {}) {
    let log = logger || defaultLogger;


    apiBase = apiBase || defaultConfig('GITCHAIN_REST_ENDPOINT', apiBase);

    let address = tagAddress(tag);
    let url = Gitchain.restApiUrl(`state/${address}`, apiBase);
    log(`Address of tag ${tag} is ${url}`);
  }

  static restApiUrl(path, apiBase = defaultConfig('GITCHAIN_REST_ENDPOINT')) {
    return url.resolve(apiBase, path);
  }

  restApiUrl(path) {
    return Gitchain.restApiUrl(path, this.apiBase);
  }

  async storeTree(treeId) {
    await this.writeToPackfile(treeId);

    let treeInfo = await this.gitCommand('readObject', {oid: treeId, format: 'parsed'});

    for (let entry of treeInfo.object.entries) {
      if (entry.type === 'tree') {
        await this.storeTree(entry.oid);
      } else if (entry.type === 'blob') {
        await this.writeToPackfile(entry.oid);
      }
    }
  }

  async downloadPush(tag) {

    let stateAddress = tagAddress(tag);
    let push = await request(this.restApiUrl(`state/${stateAddress}`), {json: true});
    let payload = decodePayload(push.data);

    let headSha = payload.data.attributes['head-sha'];

    await this.downloadAllPackfiles(headSha);

    await this.gitCommand('writeRef', { ref: 'refs/heads/master', value: headSha, force: true });
    await this.gitCommand('checkout', { ref: 'master' });
  }

  async downloadAllPackfiles(sha) {

    while (sha) {
      let commit = await request(this.restApiUrl(`state/${commitAddress(sha)}`), {json: true});
      let payload = decodePayload(commit.data);

      let packSha = get(payload, 'data.attributes.pack-sha');
      let packFile = await readFromBlobStream(packSha, this.blobStorageConfig);

      let path = join(this.gitDir, "objects/pack", packSha);

      writeFileSync(path, packFile);

      await this.gitCommand('indexPack', { filepath: join('.git/objects/pack', packSha) });

      sha = get(payload, 'data.relationships.previous-commit.data.id');
    }

  }

  async loadCommitFromPack(sha) {
    await this.loadObjectFromPack('commit', sha);
    let commitInfo = await this.gitCommand('readObject', {oid: sha, format: 'parsed'});


    await this.downloadTree(commitInfo.object.tree);

    for (let parent of commitInfo.object.parent) {
      await this.loadCommitFromPack(parent);
    }
  }

  async loadObjectFromPack(type, sha) {
    this.log(`Loading ${type} ${sha}`);
    let object = await readFileSync(join(this.tmpdir.path, sha));

    await this.gitCommand('writeObject', { type, object, format: 'content' });
  }

  async downloadTree(treeId) {
    await this.loadObjectFromPack('tree', treeId);

    let treeInfo =  await this.gitCommand('readObject', { oid: treeId, format: 'parsed' });

    for (let entry of treeInfo.object.entries) {
      await this.loadObjectFromPack(entry.type, entry.oid);
      if (entry.type === 'tree') {
        await this.downloadTree(entry.oid);
      }
    }
  }

  async gitCommand(cmd, opts={}) {
    if(!opts.dir) {
      opts.dir = this.repoPath;
    }

    if (!opts.gitdir) {
      opts.gitdir = this.gitDir;
    }

    return await Git[cmd].call(Git, opts);
  }

  async writePushToBlockchain(commit, tag, packSha) {
    let transaction = {
      "type": "PUSH",
      "id": tag,
      data: {
        attributes: {
          'blob-store-info': blobStoreMeta(this.blobStorageConfig),
          'pack-sha': packSha,
          'head-sha': commit.oid,
          'timestamp': (new Date()).toISOString()
        }
      }
    };

    let privateKey = this.readPrivateKey();
    let batchData = await submitAndPoll({ privateKey, transaction });

    let pushTransaction = batchData.data.transactions[0];
    let pushPayload = decodePayload(pushTransaction.payload);

    this.log("Transaction address", this.restApiUrl(`state/${tagAddress(tag)}`));

    return pushPayload;
  }

  async push(tag) {
    let head;

    try {
      head = await Gitchain.head(tag, {logger: this.logger, apiBase: this.apiBase});
    } catch(e) {
      // There is no head for this tag
    }

    let commits = await this.getCommits(head);

    if (commits.length === 0) {
      this.log(`Nothing to push, tag ${tag} is already at sha ${head}`);
      return;
    }

    let { filename, packfile } = await this.makePackFile(async () => {
      for (let commit of commits) {
        this.log(`Storing commit ${commit.oid}`);
        await this.writeToPackfile(commit.oid);
        await this.storeTree(commit.tree);
      }
    });

    await this.writeToBlobStream(filename, packfile);

    let pushPayload = await this.writePushToBlockchain(commits[commits.length-1], tag, filename);

    return pushPayload;
  }

  async clone(tag) {
    if (existsSync(this.repoPath)) {
      throw new Error(`Path ${this.repoPath} already exists!`);
    }

    this.repo = await this.gitCommand('init');


    await this.downloadPush(tag);
  }

  async pull(tag) {
    if (!existsSync(this.repoPath)) {
      throw new Error(`Path ${this.repoPath} doesn't exist!`);
    }

    await this.downloadPush(tag);

  }

  async getCommits(since) {
    let orderedCommits = (await this.gitCommand('log', { ref: 'HEAD' })).reverse();

    if (since) {
      let index = orderedCommits.findIndex(c => c.oid === since);
      orderedCommits = orderedCommits.slice(index + 1);
    }

    return orderedCommits;
  }

  async makePackFile(callback) {

    this.oidsToPack = [];

    await callback();


    return await this.gitCommand('packObjects', {
      oids: this.oidsToPack
    });
  }

  async writeToPackfile(oid) {
    this.oidsToPack.push(oid);
  }

  async writeToBlobStream(key, blob) {
    await writeToBlobStream(key, blob, this.blobStorageConfig);
  }


  readPrivateKey() {
    let explicitKey = defaultConfig('SAWTOOTH_PRIVATE_KEY', this.privateKey);

    if (explicitKey) {
      return explicitKey;
    } else {
      return readFileSync(resolve(this.keyDir, 'sawtooth.priv'), 'utf8');
    }
  }

  async readObject(sha) {
    let { object } = await this.gitCommand('readObject', { oid: sha, format: 'content'});
    return object;
  }

}

module.exports = { Gitchain };