const lint = require('mocha-eslint');

lint([
  '**/*.js',
  '!node_modules/**/*.js'
]);
