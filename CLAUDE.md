# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a learning project for building an ATProto-based social network application for Ffion (a cat). The goal is to gain hands-on experience with AT Protocol development by creating a fun, personal social network that tracks and shares Ffion's activities.

## Dependencies

- `@atproto/lexicon` (^0.5.1): TypeScript implementation of the Lexicon schema description language from the AT Protocol ecosystem

## Project Structure

```
lexicons/com/ffion/     # Lexicon schema definitions
├── eating.json         # Token: eating state
├── zoomies.json        # Token: zoomies state
├── playing.json        # Token: playing state
├── sleeping.json       # Token: sleeping state
├── status.json         # Record: status update with state, text, image, timestamp
└── listStatuses.json   # Query: list status records (pagination support)

lexicons.js             # Loads all lexicons from directory and validates
server.js               # Express API server with XRPC-style endpoints
cat-lexicon.json        # (deprecated) Original combined lexicon file
```

Key files:
- `lexicons.js`: Loads all lexicon files from `lexicons/com/ffion/` directory and creates a `Lexicons` collection for validation
- `server.js`: Express server implementing ATProto-style XRPC endpoints with in-memory storage

## ATProto Lexicon Architecture

AT Protocol uses Lexicons to define schemas for data and API interactions. This project uses two main schema types:

1. **Token definitions**: Simple identifiers representing distinct states (e.g., "eating", "zoomies")
2. **Record definitions**: Structured data types with required properties that reference tokens as known values

The `com.ffion.status` record requires a `state` property of type string, with the four Ffion activity tokens as known values. This creates a type-safe way to represent Ffion's current activity.

## Working with Lexicons

When adding or modifying lexicon schemas:

1. Token definitions use `"type": "token"` with a description
2. Record definitions use `"type": "record"` with a nested record object
3. The `knownValues` array in record properties should reference the full lexicon IDs of token types
4. All lexicon documents require `"lexicon": 1` and a unique `id` following reverse-DNS naming (e.g., `com.ffion.*`)

## Validation Methods

The `Lexicons` class provides validation methods:

- `assertValidRecord()`: Validates record-type data
- `assertValidXrpcParams()`: Validates XRPC query parameters
- `assertValidXrpcInput()`: Validates XRPC procedure inputs
- `assertValidXrpcOutput()`: Validates XRPC query/procedure outputs

Note: The object being validated must include a `$type` property matching the lexicon ID.

## Running the Application

Start the API server:
```bash
node server.js
```

The server runs on port 3000 and implements three XRPC endpoints:
- `POST /xrpc/com.atproto.repo.createRecord` - Create a new status record
- `GET /xrpc/com.atproto.repo.listRecords` - List records from a collection
- `GET /xrpc/com.atproto.repo.getRecord` - Get a specific record by rkey

Records are validated against their lexicon schemas before storage. Records are stored in-memory (lost on restart).

## Development Philosophy

This is an experimental learning project focused on understanding ATProto fundamentals through practical application development. The server implements a simplified version of ATProto repository operations without requiring a full PDS (Personal Data Server) setup.
