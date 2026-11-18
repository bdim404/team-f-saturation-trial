import type { Lang } from '../i18n'

// A testing convenience, never enabled on the participant production origin.
export function canRestartTest(flag: string | undefined, origin: string, demo: boolean | undefined) {
  return flag === 'true' && origin === 'https://staging.soundandmusic.eu' && demo === true
}

export const newTestLabel: Record<Lang, string> = {
  en: 'New test', es: 'Nueva prueba', ca: 'Nova prova', fr: 'Nouveau test',
  de: 'Neuer Test', it: 'Nuova prova', pt: 'Novo teste', nl: 'Nieuwe test',
  pl: 'Nowy test', sv: 'Nytt test', el: 'Νέα δοκιμή', tr: 'Yeni test', zh: '新测试',
}
