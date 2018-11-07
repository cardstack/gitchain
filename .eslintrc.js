module.exports = {
  "parserOptions": {
    "ecmaVersion": 2017
  },
  "extends": "eslint:recommended",
  "env": {
    "node": true,
    "mocha": true,
    "es6": true
  },
  "rules": {
    "indent": [
        "error",
        2
    ],
    "linebreak-style": [
        "error",
        "unix"
    ],
    "semi": [
        "error",
        "always"
    ]
  }
};
