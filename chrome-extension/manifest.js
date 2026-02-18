import fs from 'node:fs';
import deepmerge from 'deepmerge';

const packageJson = JSON.parse(fs.readFileSync('../package.json', 'utf8'));

const isFirefox = process.env.__FIREFOX__ === 'true';
const isOpera = process.env.__OPERA__ === 'true';

/**
 * If you want to disable the sidePanel, you can delete withSidePanel function and remove the sidePanel HoC on the manifest declaration.
 *
 * ```js
 * const manifest = { // remove `withSidePanel()`
 * ```
 */
function withSidePanel(manifest) {
  // Firefox does not support sidePanel
  if (isFirefox) {
    return manifest;
  }
  return deepmerge(manifest, {
    permissions: ['sidePanel'],
  });
}

/**
 * Adds Opera sidebar support using the sidebar_action API.
 * This is compatible with Chrome extensions and won't break Chrome Web Store validation.
 */
function withOperaSidebar(manifest) {
  // Only add Opera sidebar_action if building specifically for Opera
  if (isFirefox || !isOpera) {
    return manifest;
  }

  return deepmerge(manifest, {
    sidebar_action: {
      default_panel: 'side-panel/index.html',
      default_title: 'Autumn AI Co-Pilot',
      default_icon: 'icon-32.png',
    },
  });
}

/**
 * After changing, please reload the extension at `chrome://extensions`
 * @type {chrome.runtime.ManifestV3}
 */
const manifest = withOperaSidebar(
  withSidePanel({
    manifest_version: 3,
    name: 'Autumn AI Co-Pilot',
    version: packageJson.version,
    description:
      'Automate web tasks with AI! Autumn AI Co-Pilot is a browser extension that lets you extract data, fill forms, and more.',
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
  }),
);

export default manifest;
