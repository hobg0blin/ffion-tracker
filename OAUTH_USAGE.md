# OAuth Usage Guide for Ffion Tracker

This guide shows you how to authenticate with your self-hosted PDS and post Ffion statuses using CURL.

## Prerequisites

1. Start the server: `node server.js`
2. Have your ATProto handle ready (e.g., `yourhandle.atproto.bront.rodeo`)

## Step 1: Initiate OAuth Login

Note: The server uses `127.0.0.1` for OAuth compliance (RFC 8252), so use that in URLs instead of `localhost`.

```bash
curl -X POST http://127.0.0.1:3000/login \
  -H "Content-Type: application/json" \
  -d '{"handle": "yourhandle.atproto.bront.rodeo"}' \
  -c cookies.txt
```

This will return a JSON response with an `authUrl`:

```json
{
  "authUrl": "https://atproto.bront.rodeo/oauth/authorize?...",
  "message": "Visit the authUrl in your browser to complete authentication"
}
```

## Step 2: Complete Authentication in Browser

1. Copy the `authUrl` from the response
2. Open it in your browser
3. Log in to your PDS and authorize the app
4. You'll be redirected back to `http://127.0.0.1:3000/oauth/callback`
5. You should see a success message with your DID

The callback will automatically save your session cookie.

## Step 3: Get the Session Cookie for CURL

After completing OAuth in the browser, visit this URL in the **same browser**:

```
http://127.0.0.1:3000/get-cookie
```

This page will:
- Display your active session DID
- Show the exact cookie value you need
- Provide ready-to-use CURL commands
- Let you copy the cookie value with one click

### Alternative: Manual extraction via Browser Developer Tools
1. In the browser where you completed OAuth, open Developer Tools (F12)
2. Go to Application/Storage → Cookies → `http://127.0.0.1:3000`
3. Copy the value of the `ffion_sid` cookie

## Step 4: Check Your Session

```bash
curl http://127.0.0.1:3000/session \
  -b cookies.txt
```

Should return:
```json
{
  "authenticated": true,
  "did": "did:plc:..."
}
```

## Step 5: Post a Ffion Status to Your PDS

Now you can post statuses! The status will be written to your PDS at `atproto.bront.rodeo`.

### Post that Ffion is eating:

```bash
curl -X POST http://127.0.0.1:3000/ffion/status \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "state": "com.ffion.eating",
    "text": "Ffion is enjoying her dinner!"
  }'
```

### Post that Ffion has the zoomies:

```bash
curl -X POST http://127.0.0.1:3000/ffion/status \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "state": "com.ffion.zoomies"
  }'
```

### Post that Ffion is playing:

```bash
curl -X POST http://127.0.0.1:3000/ffion/status \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "state": "com.ffion.playing",
    "text": "Playing with her favorite toy mouse"
  }'
```

### Post that Ffion is sleeping:

```bash
curl -X POST http://127.0.0.1:3000/ffion/status \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "state": "com.ffion.sleeping",
    "text": "Napping in her favorite sunny spot"
  }'
```

## Response Format

Successful posts will return:

```json
{
  "success": true,
  "uri": "at://did:plc:xyz.../com.ffion.status/3k...",
  "cid": "bafyrei...",
  "record": {
    "$type": "com.ffion.status",
    "state": "com.ffion.eating",
    "text": "Ffion is enjoying her dinner!",
    "createdAt": "2025-10-14T12:34:56.789Z"
  }
}
```

The URI shows where the record was created in your PDS!

## Logout

```bash
curl -X POST http://127.0.0.1:3000/logout \
  -b cookies.txt
```

## Valid States

- `com.ffion.eating` - Ffion is eating
- `com.ffion.zoomies` - Ffion has the zoomies
- `com.ffion.playing` - Ffion is playing
- `com.ffion.sleeping` - Ffion is sleeping

## Notes

- The `text` field is optional
- Sessions are stored in-memory, so they'll be lost when the server restarts
- The OAuth client is configured for local development (localhost)
- For production, you'd need to:
  - Use a public URL for your client
  - Set up proper client metadata hosting
  - Use a database for persistent session storage
  - Use a secure, random COOKIE_SECRET
