const Mocha  = require('mocha'),
  fs       = require('fs'),
  path     = require('path');


const options = require('options-parser').parse({grep: {default: null}});

const chai = require("chai");
const sinonChai = require("sinon-chai");
chai.use(sinonChai);

// Instantiate a Mocha instance.
const mocha = new Mocha({
  timeout:  10000,
  slow:     500,
  grep:     options.opt.grep
});

// Add each .js file to the mocha instance
fs.readdirSync('./node-tests')
  .filter(file => file.substr(-3) === '.js' && file !== "runner.js" && file !== "helpers.js")
  .forEach(file => mocha.addFile(path.join("./node-tests", file)));

// Run the tests.
mocha.run(failures => {
  process.on('exit', () => process.exit(failures));
});