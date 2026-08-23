# WeekPlate

WeekPlate is a private, device-local meal planner for families. It builds one- or two-week dinner plans, creates store-priced shopping lists, tracks pantry leftovers, and includes 100 recipes with nutrition estimates.

## Run it

Open `index.html` in a modern browser. There is no build step and no required backend.

For iPhone use, publish `index.html` on any static host, open the URL in Safari, then choose **Share → Add to Home Screen**.

## Privacy and storage

Household settings, plans, pantry contents, prices, and photos stay in the browser's local storage. There is no account or cloud sync. Use **Setup → Export backup** periodically, especially before clearing browser data or changing phones.

Receipt OCR optionally downloads Tesseract.js from jsDelivr when a receipt is scanned. Google Fonts are optional presentation enhancements; system fonts are used when offline.

## Development

The deployable app intentionally remains a single file. Keep that constraint when changing the code.

Run the dependency-free integrity checks with:

```sh
python3 tests/integrity.py
```

See `HANDOVER.md` for the architecture, planner behavior, storage fallbacks, and regression scenarios.

## License

Private project. All rights reserved.
