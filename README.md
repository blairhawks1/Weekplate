# WeekPlate

Production: https://weekplate.blairhawks1.workers.dev/

Latest deployment trigger: 2026-08-23 18:40 America/Chicago.

WeekPlate is a private, device-local meal planner for families. It builds one- or two-week dinner plans, creates store-priced shopping lists, tracks pantry leftovers and use-by dates, and includes 150 recipes with nutrition estimates.

## Run it

Open `index.html` in a modern browser. There is no build step and no required backend.

For iPhone use, publish the repository on a static host, open the URL in Safari, then choose **Share → Add to Home Screen**. The manifest and service worker provide a proper icon, standalone display, and offline app shell.

## Privacy and storage

Household settings, plans, pantry contents, prices, and photos stay in the browser's local storage. There is no account or cloud sync. Use **Setup → Export backup** periodically, especially before clearing browser data or changing phones.

Receipt OCR optionally downloads Tesseract.js from jsDelivr when a receipt is scanned. Google Fonts are optional presentation enhancements; system fonts are used when offline.

## Development

The deployable app intentionally remains a single file. Keep that constraint when changing the code.

Run the dependency-free integrity checks with:

```sh
python3 tests/integrity.py
```

Serve the repository over HTTP and open `tests/planner-simulation.html` to run 160 randomized planner simulations covering diets, alternate meals, two-week horizons, leftovers, blocking, and expiry scoring.

See `HANDOVER.md` for the architecture, planner behavior, storage fallbacks, and regression scenarios.

## License

Private project. All rights reserved.
