# Host the demo on Vercel

The hosted copy is the web app on its own: the landing page, the playable demo office at `/demo`, and a
**demo account** anyone can sign in with. There is no server behind it, so nothing a visitor does reaches
Telegram or Switch. To run Kratos for your own team (sign-up, your Telegram group, live agents), self-host
it with [DEPLOY.md](DEPLOY.md).

## Deploy in four steps

1. **Import the repo.** In Vercel: Add New → Project → pick this GitHub repo.
2. **Keep the root.** Root Directory stays the repo root (`./`). The web app reads the team and the demo
   story from `contracts/`, `demo/` and `data/`, so it needs the whole repo.
3. **Leave the build settings alone.** `vercel.json` sets them: Framework Preset *Other*, install
   `npm ci --prefix web`, build `npm run build:static --prefix web`, output `web/dist`. The build never touches
   `server/`.
4. **Deploy.** `build:static` already sets `VITE_STATIC=1`, so there is nothing to add. (Adding
   `VITE_STATIC=1` under Environment Variables does no harm.)

Open the URL Vercel gives you. Deep links such as `/demo`, `/login` and `/app` all work, and a reload never
404s.

## What visitors can do

| Page | What happens |
|---|---|
| `/` | The landing page. |
| `/demo` | The Kesar & Co. festive sale. Press start, watch the team plan it, then approve the plan or ask for changes. |
| `/login` | Shows the demo account. **Email** `demo@kratos.app`, **password** `kratos-demo`, or press **Sign in as demo**. |
| `/app` (demo account) | The full office, read-only. All 16 agents are at their desks, every topic has a day of chat, and sale day one keeps playing. Topics, chat, the Data Wall numbers, ROI, the Switch panel, the library, agent cards and the hire form all open. |
| `/signup` | Says this copy is a demo and points to the demo account. |

The demo account works in the browser alone: the password is checked on the page and never sent anywhere.
Sending a message, approving, hiring or re-shelving the library shows *Demo account is read-only: run
Kratos with your own Telegram group to do this*.

## What `vercel.json` does

- **SPA rewrites:** any path that isn't a file serves `index.html`.
- **Caching:** `/assets/*` (hashed file names) is cached for a year; images and models for a day.
- **Gallery banners:** `/gallery/*.html` is copied in by `build:static` and served sandboxed, like the server does.

## Check it locally

```sh
npm ci --prefix web
npm run build:static --prefix web
npm run preview --prefix web   # serves web/dist on :4173, deep links included
```

The same demo account also works on a self-hosted server. Real accounts there work as before.
