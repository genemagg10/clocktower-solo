# Clocktower Solo

A one-player storybook for **Bad Moon Rising**. You take a random seat. The rest of the town is played by neighbors with personalities, bluffs, and no peek at the grimoire.

This is an unofficial fan game for Luca Maggio. It is not made by or affiliated with The Pandemonium Institute. Ability text and token drawings are original.

## Play

From a static file server (GitHub Pages works; opening the file directly will not, because the game uses ES modules):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. Pick 5 to 15 players, deal the tokens, and play. A saved tale lives in this browser under `localStorage`.

Sound is synthesized in the browser. The moon and the night creature are clickable.

## Tests

```bash
node --test
```

The suite covers the 5–15 role table, the Godfather's setup shift, night order, the Lunatic, poison, each Demon's kill, Mastermind and Moonchild wins, and full bot games at several player counts.

## Rulings worth knowing

Notes on choices that the script leaves to the storyteller are in `CHANGELOG.md`.
