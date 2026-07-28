'use strict';

const patchedBraceExpansion = require('brace-expansion-v5');
const expand = patchedBraceExpansion.expand;

// minimatch <=9 requires brace-expansion as a callable CommonJS export,
// while minimatch >=10 reads the named `expand` export.
module.exports = expand;
module.exports.expand = expand;
module.exports.EXPANSION_MAX = patchedBraceExpansion.EXPANSION_MAX;
module.exports.EXPANSION_MAX_LENGTH = patchedBraceExpansion.EXPANSION_MAX_LENGTH;
