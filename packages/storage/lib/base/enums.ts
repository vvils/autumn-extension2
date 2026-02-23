/**
 * Storage area type for persisting and exchanging data.
 * @see https://developer.chrome.com/docs/extensions/reference/storage/#overview
 */
export enum StorageEnum {
  /**
   * Persist data locally against browser restarts. Will be deleted by uninstalling the extension.
   * @default
   */
  Local = 'local',
  /**
   * Only persist data until the browser is closed. Recommended for service workers which can shutdown anytime and
   * therefore need to restore their state. Set {@link SessionAccessLevelEnum} for permitting content scripts access.
   * @implements Chromes [Session Storage](https://developer.chrome.com/docs/extensions/reference/storage/#property-session)
   */
  Session = 'session',
}

/**
 * Global access level requirement for the {@link StorageEnum.Session} Storage Area.
 * @implements Chromes [Session Access Level](https://developer.chrome.com/docs/extensions/reference/storage/#method-StorageArea-setAccessLevel)
 */
export enum SessionAccessLevelEnum {
  /**
   * Storage can only be accessed by Extension pages (not Content scripts).
   * @default
   */
  ExtensionPagesOnly = 'TRUSTED_CONTEXTS',
  /**
   * Storage can be accessed by both Extension pages and Content scripts.
   */
  ExtensionPagesAndContentScripts = 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
}
