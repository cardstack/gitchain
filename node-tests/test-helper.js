const options           = require('options-parser');
const { shellCommand }  = require("../utils/async");
const { CLI, opts }     = require('../cli');

async function cli(commandStr) {
  let parsedOpts = options.parse(opts, commandStr);
  return await new CLI(parsedOpts).execute();
}

async function setupFixtureRepo(repo) {
  // can't store git repos in fixtures if git recognizes them as repos
  await shellCommand(`cp -r node-tests/fixtures/${repo} tmp/${repo}`);
  await shellCommand(`mv tmp/${repo}/git tmp/${repo}/.git`);
}

async function setupBareFixtureRepo(repo) {
  // can't store git repos in fixtures if git recognizes them as repos
  await shellCommand(`cp -r node-tests/fixtures/${repo}/git tmp/${repo}`);
}

module.exports = { cli, setupFixtureRepo, setupBareFixtureRepo };