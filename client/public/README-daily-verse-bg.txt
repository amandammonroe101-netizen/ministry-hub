Daily Verse splash background
=============================

Currently: an open Bible with stained-glass window light falling
across the pages, by Shane Hoving (Unsplash License — free to use,
no attribution required). Photo page:
https://unsplash.com/photos/an-open-bible-on-a-table-in-the-sunlight-SZaxKdLwz6o

Save the photo here as:

    daily-verse-bg.jpg

(That exact filename, in this `public/` folder.)

Vite serves everything in `public/` at the site root, so the splash
loads it from `/daily-verse-bg.jpg`. Until the file is added, the
splash falls back to a warm sunset-colored gradient automatically — it
will never look broken.

To use a different filename or format (e.g. .png), update the
`background-image` url in:

    src/components/DailyVerseSplash.css
