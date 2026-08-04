# CI reference

`deploy-pages.yml.reference` — це workflow для публікації через **GitHub Actions**
(Source: GitHub Actions). Він НЕ активний у цій гілці, бо токен, яким виконувалася
поточна публікація, має лише scope `repo` (без `workflow`), і GitHub забороняє
пушити файли в `.github/workflows/` без scope `workflow`.

Поточна публікація виконана через **deploy-from-branch** (гілка `gh-pages`), що
працює з токеном scope `repo`. Це надійний і простий варіант для статичної PWA.

## Як перейти на Actions-публікацію (за бажанням)

1. Створіть Personal Access Token зі scope `repo` **та** `workflow`.
2. Поверніть файл у активне розташування:
   ```bash
   mkdir -p .github/workflows
   git mv docs/ci/deploy-pages.yml.reference .github/workflows/deploy-pages.yml
   git commit -m "ci: enable GitHub Actions Pages deploy"
   git push
   ```
3. У GitHub: Settings → Pages → Source: **GitHub Actions**.
