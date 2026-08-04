#!/usr/bin/env bash
#
# Одноразове налаштування публікації PWA на GitHub Pages.
# Безпечний скрипт: НЕ виконує деструктивних дій, лише допомагає створити
# репозиторій і ввімкнути Pages. Запускати з кореня проєкту.
#
# Використання:
#   ./scripts/setup-github-pages.sh <github-username> <repo-name>
#
# Приклад:
#   ./scripts/setup-github-pages.sh myuser budget-pwa
#
set -euo pipefail

USER="${1:-}"
REPO="${2:-}"

if [[ -z "$USER" || -z "$REPO" ]]; then
  echo "Використання: $0 <github-username> <repo-name>"
  exit 1
fi

echo "==> Перевірка git-репозиторію…"
if [[ ! -d .git ]]; then
  git init
  git add -A
  git commit -m "init: budget PWA"
fi

# Гілка main
git branch -M main

echo "==> Налаштування remote origin…"
if git remote get-url origin >/dev/null 2>&1; then
  echo "    origin вже існує: $(git remote get-url origin)"
else
  git remote add origin "https://github.com/${USER}/${REPO}.git"
  echo "    Додано origin: https://github.com/${USER}/${REPO}.git"
fi

cat <<EOF

==> Далі виконайте вручну (потрібна ваша авторизація в GitHub):

  1. Створіть репозиторій «${REPO}» на GitHub (порожній, без README).

  2. Відправте код:
       git push -u origin main

  3. У налаштуваннях репозиторію: Settings → Pages →
       Build and deployment → Source: «GitHub Actions».

  4. Workflow .github/workflows/deploy-pages.yml запуститься автоматично
     після push і опублікує застосунок.

  5. Публічна адреса буде:
       https://${USER}.github.io/${REPO}/
     (для user-site репозиторію виду ${USER}.github.io — просто https://${USER}.github.io/)

  Base path обчислюється автоматично з імені репозиторію (VITE_BASE_PATH),
  нічого хардкодити не потрібно.

EOF

echo "✅ Підготовку завершено."
