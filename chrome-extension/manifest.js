import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync('../package.json', 'utf8'));

/**
 * After changing, please reload the extension at `chrome://extensions`
 * @type {chrome.runtime.ManifestV3}
 */
const manifest = {
  manifest_version: 3,
  name: 'Autumn AI Co-Pilot',
  version: packageJson.version,
  description: 'AI-powered browser automation for hospitality teams',
  host_permissions: ['<all_urls>'],
  permissions: [
    'storage',
    'scripting',
    'tabs',
    'activeTab',
    'debugger',
    'unlimitedStorage',
    'webNavigation',
    'tabGroups',
    'offscreen',
    'sidePanel',
  ],
  options_page: 'options/index.html',
  background: {
    service_worker: 'background.iife.js',
    type: 'module',
  },
  action: {
    default_icon: 'icon-32.png',
  },
  icons: {
    16: 'icon-16.png',
    48: 'icon-48.png',
    96: 'icon-96.png',
    128: 'icon-128.png',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*', '<all_urls>'],
      all_frames: true,
      js: ['content/index.iife.js'],
    },
  ],
  web_accessible_resources: [
    {
      resources: [
        '*.js',
        '*.css',
        '*.svg',
        'icon-16.png',
        'icon-32.png',
        'icon-48.png',
        'icon-96.png',
        'icon-128.png',
        'permission/index.html',
        'permission/permission.js',
      ],
      matches: ['*://*/*'],
    },
  ],
};

export default manifest;
