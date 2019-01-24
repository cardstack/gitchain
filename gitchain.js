const { restApiUrl }          = require('./utils/config');
const { submitAndPoll }       = require('./lib/send-transaction');
const { decodePayload }       = require('./utils/encryption');
const defaultLogger           = require('debug')('gitchain');
const request                 = require('request-promise-native');
const { get }                 = require('lodash');

const fs = require('fs');
const Git = require('isomorphic-git');
Git.plugins.set('fs', fs);

const { writeToBlobStream, readFromBlobStream, blobStoreMeta }   = require('./lib/blob-storage');
const { transactionAddress, commitAddress }  = require("./utils/address");
const { readFileSync, existsSync }        = require('fs');
const { resolve, join }             = require('path');

class Gitchain {
  constructor(repoPath, keydir, { logger }) {
    this.repoPath   = repoPath;
    this.gitDir     = join(this.repoPath, '.git');
    this.keydir     = keydir;
    this.log        = logger || defaultLogger;
  }

  async storeCommit(commit) {
    this.log(`Storing commit ${commit.oid}`);
    await writeToBlobStream(commit.oid, await this.readObject(commit.oid));


    await this.storeTree(commit.tree);
  }

  async storeTree(treeId) {
    await writeToBlobStream(treeId, await this.readObject(treeId));

    let treeInfo = await this.gitCommand('readObject', {oid: treeId, format: 'parsed'});

    for (let entry of treeInfo.object.entries) {
      if (entry.type === 'tree') {
        await this.storeTree(entry.oid);
      } else if (entry.type === 'blob') {
        this.log(`Writing blob ${entry.path} ${entry.oid}`);
        await writeToBlobStream(entry.oid, await this.readObject(entry.oid));
      }
    }
  }

  async downloadCommit(sha) {
    await this.downloadObject('commit', sha);

    let commitInfo = await this.gitCommand('readObject', {oid: sha, format: 'parsed'});


    await this.downloadTree(commitInfo.object.tree);
  }

  async downloadObject(type, sha) {
    this.log(`Downloading ${type} ${sha}`);
    let object = await readFromBlobStream(sha);

    await this.gitCommand('writeObject', { type, object, format: 'content' });
  }

  async downloadTree(treeId) {
    await this.downloadObject('tree', treeId);

    let treeInfo =  await this.gitCommand('readObject', { oid: treeId, format: 'parsed' });

    for (let entry of treeInfo.object.entries) {
      await this.downloadObject(entry.type, entry.oid);
      if (entry.type === 'tree') {
        await this.downloadTree(entry.oid);
      }
    }
  }

  async gitCommand(cmd, opts={}) {
    if(!opts.dir) {
      opts.dir = this.repoPath;
    }

    return await Git[cmd].call(Git, opts);
  }

  async push(commit) {
    let commits = await this.getCommits(this.gitDir, commit);
    let previousCommit;

    for (let commit of commits) {
      let previousCommitData;
      if (previousCommit) {
        previousCommitData = {
          type: 'COMMIT',
          id: previousCommit.oid
        };
      }

      let transaction = {
        "type": "COMMIT",
        "id": commit.oid,
        data: {
          attributes: {
            'blob-store-info': blobStoreMeta(),
          },
          relationships: {
            'previous-commit': {
              data: previousCommitData
            }
          }
        }
      };

      let privateKey = this.readPrivateKey();
      let batchData = await submitAndPoll({ privateKey, transaction });

      let commitTransaction = batchData.data.transactions[0];
      let commitPayload = decodePayload(commitTransaction.payload);
      let commitAddress = transactionAddress(commitPayload);

      await this.storeCommit(commit);

      previousCommit = commit;

      this.log("Transaction address", restApiUrl(`state/${commitAddress}`));
    }
  }

  async clone(headSha) {
    if (existsSync(this.repoPath)) {
      throw new Error(`Path ${this.repoPath} already exists!`);
    }

    this.repo = await this.gitCommand('init');

    let currentSha = headSha;

    let commitData;
    do {
      commitData = await this.getCommitDataFromBlockchain(currentSha);
      await this.downloadCommit(commitData.id);
      currentSha = get(commitData, 'data.relationships.previous-commit.data.id');
    } while (currentSha);

    await this.gitCommand('writeRef', { ref: 'refs/heads/master', value: headSha });
    await this.gitCommand('checkout', { ref: 'master' });
  }

  async getCommitDataFromBlockchain(sha) {
    let stateAddress = commitAddress(sha);
    let commit = await request(restApiUrl(`state/${stateAddress}`), {json: true});
    let payload = decodePayload(commit.data);
    return payload;
  }

  async getCommits(repoPath, commit) {
    return (await this.gitCommand('log', { ref: (commit || 'master') })).reverse();
  }

  readPrivateKey() {
    if (process.env.SAWTOOTH_PRIVATE_KEY) {
      return process.env.SAWTOOTH_PRIVATE_KEY;
    } else {
      return readFileSync(resolve(this.keydir, 'sawtooth.priv'), 'utf8');
    }
  }

  objectPath(sha) {
    return join(this.gitDir, 'objects', sha.slice(0,2), sha.slice(2));
  }

  async readObject(sha) {
    let { object } = await this.gitCommand('readObject', { oid: sha, format: 'content'});
    return object;
  }

}

module.exports = { Gitchain };