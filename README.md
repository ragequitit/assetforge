# Asset Generator — cloud (Railway)

Molnversion av asset-generatorn. Allt körs i molnet på **Railway** — ingenting på din
dator, och du (eller andra du ger lösenordet) når den från vilken webbläsare som helst.

**Delar:** en Next.js-webapp, en **Postgres-kö**, och en **worker** som genererar bilder +
kör Python-bearbetningen. Färdiga PNG:er sparas i databasen. Ingen Supabase.

## Funktioner

- **Single** — skapa en asset i taget, med **variations** (1–4 versioner på en gång).
- **Batch** — klistra in en lista och kör allt; **avbryt kö** när som helst; vyn **återupptar**
  automatiskt en pågående körning om du laddar om sidan.
- **Gallery** — bläddra, **re-roll** (skapa ny version), **ta bort**, ladda ner allt som **zip**,
  eller markera flera och packa ihop dem till ett **sprite sheet** (atlas-PNG + JSON-karta).
- **Settings** — sätt en **master-prompt** (husstil på varje bild), en **referensbild**
  (stil-ankare så nya bilder matchar en befintlig look), och **category defaults** (extra stil
  per kategori, t.ex. isometrisk vy för alla Buildings).
- Filnamn taggas med rarity; togglas av med "Rarity i filnamn".

## Så funkar det

1. Du loggar in med ett lösenord.
2. I **Single** eller **Batch** skriver du dina assets och trycker Generate.
3. Jobben läggs i Postgres-kön. **Workern** (egen tjänst) plockar dem ett i taget, anropar
   bild-API:t, kör `scripts/process_image.py` (beskär, centrerar, paddar, 512x512 transparent)
   och sparar bilden i databasen.
4. Eftersom workern kör på servern kan du **stänga fliken och gå iväg** — jobben fortsätter.
5. **Gallery** visar allt som är klart. Ladda ner allt som en zip (per kategori + manifest.csv).
6. **Settings** låter dig sätta en **master-prompt** (husstil) som läggs på varje bild — du skriver
   bara namnet per asset, plus valfria notes. I Batch kan du **Avbryt kö** medan den kör.

## Deploy - steg for steg (allt via webben)

Du behover: ett GitHub-konto, ett Railway-konto och din OpenAI-nyckel. Inget installeras lokalt.

**1. Lagg koden pa GitHub**
Skapa ett nytt, tomt repo och ladda upp alla filer i den har mappen (GitHubs webb-uppladdning
med drag-and-drop funkar).

**2. Skapa Railway-projekt fran repot**
Railway -> New Project -> Deploy from GitHub repo -> valj ditt repo. Railway hittar
`Dockerfile` och bygger automatiskt (Node + Python).

**3. Lagg till Postgres**
I projektet: New -> Database -> PostgreSQL. Railway skapar en `DATABASE_URL`.

**4. Konfigurera webb-tjansten (den som byggdes i steg 2)**
Under Variables, lagg till:
```
DATABASE_URL      = ${{Postgres.DATABASE_URL}}
OPENAI_API_KEY    = sk-...            (din nyckel - klistras in HAR, inte i koden)
IMAGE_PROVIDER    = openai
IMAGE_QUALITY     = medium
APP_PASSWORD      = valfritt-starkt-losenord
APP_SESSION_SECRET= en-lang-slumpstrang
PYTHON_BIN        = python3
```
Sedan Settings -> Networking -> Generate Domain for att fa en publik URL.

**5. Lagg till worker-tjansten**
New -> GitHub Repo -> samma repo igen. Pa den tjansten:
- Settings -> Deploy -> Custom Start Command: `npm run worker`
- Variables: samma som webben, men den behover bara `DATABASE_URL`, `OPENAI_API_KEY`,
  `IMAGE_PROVIDER`, `IMAGE_QUALITY`, `PYTHON_BIN` (ingen `APP_PASSWORD`/doman).

**6. Klart**
Oppna webb-URL:en, logga in med `APP_PASSWORD`, och generera. Tabellerna skapas automatiskt
vid forsta anropet.

## Bra att veta

- **gpt-image-1** kan krava org-verifiering pa OpenAI for bildgenerering - verifiera ditt
  konto om du far ett fel om det. gpt-image-1 ger transparent bakgrund direkt, sa Python-steget
  bara beskar/centrerar/skalar.
- **Kostnad:** Railway (web + worker + Postgres) landar oftast pa ~$5-15/man, plus API-kostnaden
  per bild. Satt `IMAGE_QUALITY=medium` for ~4x lagre bildkostnad - det ser anda likadant ut efter
  nedskalning till 512.
- **Byt till Replicate** genom att satta `IMAGE_PROVIDER=replicate` + `REPLICATE_API_TOKEN`
  (da ar bilderna opaka; installera `rembg` i `requirements.txt` for snygg bg-borttagning).
- **Filnamn** taggas med rarity (`fire-boots-legendary.png`); togglas av med "Rarity i filnamn".

## Miljovariabler

Se `.env.example` for hela listan.

## Lokalt (valfritt)

Vill du kora lokalt behover du Node + Python + en Postgres. Satt `DATABASE_URL`, `OPENAI_API_KEY`,
`APP_PASSWORD`, `APP_SESSION_SECRET` i `.env.local`, kor `npm install`, `pip install -r requirements.txt`,
`npm run build && npm start` i en terminal och `npm run worker` i en annan.

## Struktur

```
app/
  page.js, login/page.js        UI + inloggning
  api/enqueue                   lagger jobb i kon
  api/status                    pollar jobbstatus
  api/asset                     serverar PNG fran DB
  api/gallery                   listar fardiga assets
  api/login                     satter auth-cookie
  api/settings                  master-prompt (husstil)
  api/cancel                    avbryt koade jobb
  api/export                    ladda ner alla assets som zip
  SinglePanel / BatchPanel / GalleryPanel / SettingsPanel
middleware.js                   losenordsskydd
worker.mjs                      ko-worker (generera + Python + spara)
lib/
  db.js                         Postgres pool + schema
  prompt.js, parseBatch.js, providers.js, colors.js
scripts/process_image.py        bildbearbetning
Dockerfile                      Node + Python i en image
```
