# Ffion Tracker

An ATProto-based social network for tracking Ffion the cat's activities. This is a learning project for understanding AT Protocol development.

## Getting Started

### Install dependencies

```bash
npm install
```

### Start the API server

```bash
node server.js
```

The server will start on `http://localhost:3000`

## API Usage

### Create a status record

```bash
curl -X POST http://localhost:3000/xrpc/com.atproto.repo.createRecord \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "did:plc:ffion",
    "collection": "com.ffion.status",
    "record": {
      "$type": "com.ffion.status",
      "state": "com.ffion.sleeping",
      "text": "Ffion is napping after a big meal",
      "createdAt": "2025-10-11T20:11:00.000Z"
    }
  }'
```

### List all status records

```bash
curl "http://localhost:3000/xrpc/com.atproto.repo.listRecords?repo=did:plc:ffion&collection=com.ffion.status"
```

### Get a specific record

```bash
curl "http://localhost:3000/xrpc/com.atproto.repo.getRecord?repo=did:plc:ffion&collection=com.ffion.status&rkey=<rkey>"
```

## Available States

- `com.ffion.eating` - Ffion is eating
- `com.ffion.zoomies` - Ffion is being insane
- `com.ffion.playing` - Ffion is playing
- `com.ffion.sleeping` - Ffion is sleeping

## Project Structure

```
lexicons/com/ffion/     # Lexicon schema definitions
├── eating.json         # Token: eating state
├── zoomies.json        # Token: zoomies state
├── playing.json        # Token: playing state
├── sleeping.json       # Token: sleeping state
├── status.json         # Record: status update with state, text, image, timestamp
└── listStatuses.json   # Query: list status records

lexicons.js             # Loads all lexicons and validates
server.js               # Express API server with XRPC-style endpoints
cat-lexicon.json        # (deprecated) Original combined lexicon file
```

## Notes

- Records are stored in-memory and will be lost when the server restarts
- The server implements basic XRPC-style endpoints following ATProto conventions
- Record keys (rkeys) are generated using TIDs (Timestamp Identifiers)
- All records are validated against their lexicon schemas before storage
