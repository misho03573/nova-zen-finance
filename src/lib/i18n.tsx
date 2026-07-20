import { useNova } from "@/lib/nova-store";

type Dict = Record<string, string>;

const en: Dict = {
  "nav.home": "Home",
  "nav.wallet": "Wallet",
  "nav.add": "Add",
  "nav.insights": "Insights",
  "nav.goals": "Goals",
  "settings.title": "Settings",
  "settings.subtitle": "Preferences",
  "settings.done": "Done",
  "settings.group.appearance": "Appearance",
  "settings.group.security": "Security",
  "settings.group.sync": "Sync",
  "settings.group.notifications": "Notifications",
  "settings.group.data": "Data",
  "settings.theme": "Theme",
  "settings.currency": "Currency",
  "settings.accent": "Accent",
  "settings.language": "Language",
};

const bg: Dict = {
  "nav.home": "Начало",
  "nav.wallet": "Портфейл",
  "nav.add": "Добави",
  "nav.insights": "Анализи",
  "nav.goals": "Цели",
  "settings.title": "Настройки",
  "settings.subtitle": "Предпочитания",
  "settings.done": "Готово",
  "settings.group.appearance": "Външен вид",
  "settings.group.security": "Сигурност",
  "settings.group.sync": "Синхронизация",
  "settings.group.notifications": "Известия",
  "settings.group.data": "Данни",
  "settings.theme": "Тема",
  "settings.currency": "Валута",
  "settings.accent": "Акцент",
  "settings.language": "Език",
};

const de: Dict = {
  "nav.home": "Start",
  "nav.wallet": "Konten",
  "nav.add": "Neu",
  "nav.insights": "Einblicke",
  "nav.goals": "Ziele",
  "settings.title": "Einstellungen",
  "settings.subtitle": "Präferenzen",
  "settings.done": "Fertig",
  "settings.group.appearance": "Darstellung",
  "settings.group.security": "Sicherheit",
  "settings.group.sync": "Synchronisierung",
  "settings.group.notifications": "Benachrichtigungen",
  "settings.group.data": "Daten",
  "settings.theme": "Design",
  "settings.currency": "Währung",
  "settings.accent": "Akzent",
  "settings.language": "Sprache",
};

const fr: Dict = {
  "nav.home": "Accueil",
  "nav.wallet": "Portefeuille",
  "nav.add": "Ajouter",
  "nav.insights": "Analyses",
  "nav.goals": "Objectifs",
  "settings.title": "Réglages",
  "settings.subtitle": "Préférences",
  "settings.done": "Terminé",
  "settings.group.appearance": "Apparence",
  "settings.group.security": "Sécurité",
  "settings.group.sync": "Synchronisation",
  "settings.group.notifications": "Notifications",
  "settings.group.data": "Données",
  "settings.theme": "Thème",
  "settings.currency": "Devise",
  "settings.accent": "Accent",
  "settings.language": "Langue",
};

const es: Dict = {
  "nav.home": "Inicio",
  "nav.wallet": "Cartera",
  "nav.add": "Añadir",
  "nav.insights": "Análisis",
  "nav.goals": "Metas",
  "settings.title": "Ajustes",
  "settings.subtitle": "Preferencias",
  "settings.done": "Listo",
  "settings.group.appearance": "Apariencia",
  "settings.group.security": "Seguridad",
  "settings.group.sync": "Sincronización",
  "settings.group.notifications": "Notificaciones",
  "settings.group.data": "Datos",
  "settings.theme": "Tema",
  "settings.currency": "Moneda",
  "settings.accent": "Acento",
  "settings.language": "Idioma",
};

const DICTS: Record<string, Dict> = { en, bg, de, fr, es };

export function useT() {
  const { state } = useNova();
  const lang = state.settings.language ?? "en";
  const dict = DICTS[lang] ?? en;
  return (key: string) => dict[key] ?? en[key] ?? key;
}

export const ACCENTS: Record<string, { primary: string; gradient: string }> = {
  default: {
    primary: "oklch(0.72 0.16 250)",
    gradient: "linear-gradient(135deg, oklch(0.78 0.14 260), oklch(0.62 0.18 300))",
  },
  sunset: {
    primary: "oklch(0.7 0.2 30)",
    gradient: "linear-gradient(135deg, oklch(0.72 0.19 30), oklch(0.6 0.22 350))",
  },
  ocean: {
    primary: "oklch(0.64 0.16 235)",
    gradient: "linear-gradient(135deg, oklch(0.68 0.15 220), oklch(0.5 0.16 260))",
  },
  matcha: {
    primary: "oklch(0.68 0.15 160)",
    gradient: "linear-gradient(135deg, oklch(0.78 0.16 155), oklch(0.5 0.14 175))",
  },
};