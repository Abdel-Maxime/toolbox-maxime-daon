import type { CookieConsentConfig } from 'vanilla-cookieconsent';

export const config: CookieConsentConfig = {
  guiOptions: {
    consentModal: {
      layout: 'bar',
      position: 'bottom center',
    },
    preferencesModal: {
      layout: 'box',
    },
  },

  categories: {
    necessary: {
      enabled: true,
      readOnly: true,
    },
    analytics: {
      autoClear: {
        cookies: [
          { name: /^_ga/ },
          { name: '_gid' },
        ],
      },
    },
  },

  language: {
    default: 'en',
    translations: {
      en: {
        consentModal: {
          title: 'We use cookies 🍪',
          description:
            'This site uses cookies to improve your experience. You can choose which ones to accept.',
          acceptAllBtn: 'Accept all',
          acceptNecessaryBtn: 'Decline',
          showPreferencesBtn: 'Customize',
        },
        preferencesModal: {
          title: 'Cookie preferences',
          acceptAllBtn: 'Accept all',
          acceptNecessaryBtn: 'Decline all',
          savePreferencesBtn: 'Save preferences',
          sections: [
            {
              title: 'Necessary cookies',
              description: 'Essential for the website to function properly.',
              linkedCategory: 'necessary',
            },
            {
              title: 'Analytics cookies',
              description: 'Help us understand how you use the site (GA4).',
              linkedCategory: 'analytics',
            },
          ],
        },
      },
    },
  },
};