const { createRequire } = require('module');
const r = createRequire(process.cwd() + '/foo.js');
console.log(typeof r('archiver'));
console.log(Object.keys(r('archiver')));
