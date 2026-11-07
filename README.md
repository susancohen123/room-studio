# Room Studio

A private design workspace: clients → homes → rooms, with wall finishes, furniture cutouts, design options, pricing, AI pictures and a chat assistant.

## Run it on your computer

1. Open a terminal in this folder.
2. Start it:

   ```
   npm run dev
   ```

3. Open http://localhost:3000 and sign in with the password in `.env.local`.

## Settings (`.env.local`, never uploaded)

| Setting | What it's for |
|---|---|
| `APP_PASSWORD` | Your sign-in password |
| `SESSION_SECRET` | Keeps you signed in. Leave it alone |
| `REPLICATE_API_TOKEN` | Turns on AI pictures (replicate.com) |
| `REPLICATE_MODEL` | Which AI picture model to use |
| `ANTHROPIC_API_KEY` | Turns on the chat assistant (console.anthropic.com) |

Restart the app after changing settings.

## Where your work is saved

- On your computer: the `.data` folder in this app (not uploaded to GitHub).
- Online (Vercel): Vercel Blob storage, once it's connected.
