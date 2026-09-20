// Some restricted sandboxes do not expose os.userInfo(); normal Node installs
// can run the smoke test without this shim.
const os = require('node:os');
Object.defineProperty(os, 'userInfo', { value: () => ({ username: 'test', uid: 0, gid: 0, shell: '', homedir: '' }), configurable: true });
