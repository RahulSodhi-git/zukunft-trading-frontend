# Zukunft Trading Frontend

Static frontend for Zukunft Trading.

## Local use

Open `zukunft-trading.html` or `account.html` directly, or serve this folder with any static server.

The account page calls the local backend when opened from `file://`, `localhost`, or `127.0.0.1`:

```text
http://localhost:5050
```

When deployed online, it calls:

```text
https://api.zukunfttrading.com
```

You can override this before the page script loads by setting:

```html
<script>
  window.ZUKUNFT_API_URL = "https://your-api-url";
</script>
```

## Vercel

Deploy this folder as a static project. `vercel.json` routes `/` to `zukunft-trading.html`.
