const { defaultConfig }       = require('./utils/config');
const { submitAndPoll }       = require('./lib/send-transaction');
const { decodePayload }       = require('./utils/encryption');
const defaultLogger           = require('debug')('gitchain');
const request                 = require('request-promise-native');
const { get }                 = require('lodash');
const url                     = require('url');

const fs = require('fs');
const Git = require('isomorphic-git');
Git.plugins.set('fs', fs);

const { writeToBlobStream, readFromBlobStream, blobStoreMeta }   = require('./lib/blob-storage');
const { transactionAddress, commitAddress }  = require("./utils/address");
const { readFileSync, existsSync }        = require('fs');
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

  restApiUrl(path) {
    return url.resolve(this.apiBase, path);
  }


  // adapted from https://ai.googleblog.com/2006/06/extra-extra-read-all-about-it-nearly.html
  async _findFirstIndexOfCondition(haystack, assertion) {
    let mid, result;
    let low = 0;
    let high = haystack.length - 1;

    while(low <= high) {
      mid = low + (high - low >> 1);
      result = await assertion(haystack[mid]);

      if(result) {
        low  = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return low - 1;
  }

  async status() {
    let commits = await this.getCommits();

    let lastSyncedCommitIndex = await this._findFirstIndexOfCondition(commits, async (commit) => {
      let address = commitAddress(commit.oid);
      this.log(`Checking ${commit.oid} (${commits.indexOf(commit)})`);
      try {
        await request(this.restApiUrl(`state/${address}`), {json: true});
        return true;
      } catch(e) {
        return false;
      }
    });

    let totalCommits = commits.length;
    let syncedCommits = lastSyncedCommitIndex + 1;
    let percentage = Math.round(syncedCommits / totalCommits * 100);
    let lastCommitSha = commits[lastSyncedCommitIndex] && commits[lastSyncedCommitIndex].oid;
    let lastCommitAddress, lastCommitUrl;

    this.log(`Synced ${syncedCommits} of ${totalCommits}, ${percentage}% complete`);
    if (lastCommitSha) {
      this.log(`Last synced sha was ${lastCommitSha}`);
      lastCommitAddress = commitAddress(lastCommitSha);
      lastCommitUrl = this.restApiUrl(`state/${lastCommitAddress}`);
      this.log(`Last synced commit url is ${lastCommitUrl}`);
    }

    return {
      totalCommits,
      syncedCommits,
      percentage,
      lastCommitSha,
      lastCommitAddress,
      lastCommitUrl
    };
  }

  async storeCommit(commit) {
    this.log(`Storing commit ${commit.oid}`);

    await this.writeToBlobStream(commit.oid, await this.readObject(commit.oid));

    await this.storeTree(commit.tree);
  }

  async writeToBlobStream(key, blob) {
    await writeToBlobStream(key, blob, this.blobStorageConfig);
  }

  async storeTree(treeId) {
    await this.writeToBlobStream(treeId, await this.readObject(treeId));

    let treeInfo = await this.gitCommand('readObject', {oid: treeId, format: 'parsed'});

    for (let entry of treeInfo.object.entries) {
      if (entry.type === 'tree') {
        await this.storeTree(entry.oid);
      } else if (entry.type === 'blob') {
        this.log(`Writing blob ${entry.path} ${entry.oid}`);
        await this.writeToBlobStream(entry.oid, await this.readObject(entry.oid));
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
    let object = await readFromBlobStream(sha, this.blobStorageConfig);

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

    if (!opts.gitdir) {
      opts.gitdir = this.gitDir;
    }

    return await Git[cmd].call(Git, opts);
  }

  async pushSingleCommit(commit, previousCommit) {
    let commitPayload;
    if (!(commitPayload = this.cache.writtenToBlockchain[commit.oid])) {
      commitPayload = await this.writeCommitToBlockchain(commit, previousCommit);
      this.cache.writtenToBlockchain[commit.oid] = commitPayload;
    } else {
      this.log(`Commit ${commit.oid} is already written to the blockchain, skipping`);
    }

    if (!this.cache.writtenToBlobStore[commit.oid]) {
      await this.storeCommit(commit);
      this.cache.writtenToBlobStore[commit.oid] = true;
      this.log(`Commit ${commit.oid} is already written to the blob store, skipping`);
    }

    return commitPayload;
  }

  async writeCommitToBlockchain(commit, previousCommit) {
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
          'blob-store-info': blobStoreMeta(this.blobStorageConfig),
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

    this.log("Transaction address", this.restApiUrl(`state/${commitAddress}`));

    return commitPayload;
  }

  async push(commit) {
    let commits = await this.getCommits(commit);
    let previousCommit;
    let commitPayload;

    for (let commit of commits) {

      commitPayload = await this.pushSingleCommit(commit, previousCommit);

      previousCommit = commit;

    }
    return commitPayload;
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
    let commit = await request(this.restApiUrl(`state/${stateAddress}`), {json: true});
    let payload = decodePayload(commit.data);
    return payload;
  }

  async getCommits(commit) {
    return (await this.gitCommand('log', { ref: (commit || 'HEAD') })).reverse();
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