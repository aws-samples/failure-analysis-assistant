import { I18nProvider, Language } from "./i18n-provider.js";

/**
 * Singleton instance of I18nProvider
 */
let instance: I18nProvider | null = null;

/**
 * Get the singleton instance of I18nProvider
 * @param language Language setting (default is Japanese)
 * @returns I18nProvider instance
 */
export function getI18nProvider(language?: Language): I18nProvider {
  if (!instance) {
    instance = new I18nProvider(language || "ja");
  }
  return instance;
}

/**
 * Set the singleton instance of I18nProvider
 * @param i18nProvider I18nProvider instance to set
 */
export function setI18nProvider(i18nProvider: I18nProvider): void {
  instance = i18nProvider;
}
