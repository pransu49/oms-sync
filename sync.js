name: Zippy Order Sync

on:
  schedule:
    - cron: "*/15 * * * *"   # every 15 minutes, same cadence as OMS Guru sync
  workflow_dispatch: {}       # lets you also trigger it manually from the Actions tab

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm install firebase-admin node-fetch@2

      - name: Run Zippy sync
        env:
          ZIPPY_REFRESH_TOKEN: ${{ secrets.ZIPPY_REFRESH_TOKEN }}
          FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        run: node zippy-sync.js
