'use client';

import { useEffect } from 'react';
import * as CookieConsent from 'vanilla-cookieconsent';
import { config } from '@/lib/cookieconsent.config';
import 'vanilla-cookieconsent/dist/cookieconsent.css';

export default function CookieConsentBanner() {
  useEffect(() => {
    CookieConsent.run(config);
  }, []);

  return null;
}