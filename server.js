import express from 'express'
import { TID } from '@atproto/common-web'
import { lex } from './lexicons.js'

const app = express()
const PORT = 3000

// In-memory storage for records
const records = new Map()

app.use(express.json())

// POST /xrpc/com.atproto.repo.createRecord
app.post('/xrpc/com.atproto.repo.createRecord', (req, res) => {
  try {
    const { repo, collection, record } = req.body

    if (!repo || !collection || !record) {
      return res.status(400).json({
        error: 'InvalidRequest',
        message: 'Missing required fields: repo, collection, record'
      })
    }

    // Validate the record against its lexicon
    try {
      lex.assertValidRecord(collection, record)
    } catch (validationError) {
      return res.status(400).json({
        error: 'InvalidRecord',
        message: validationError.message
      })
    }

    // Generate a TID for the record key
    const rkey = TID.nextStr()
    const uri = `at://${repo}/${collection}/${rkey}`

    // Store the record
    if (!records.has(collection)) {
      records.set(collection, new Map())
    }
    records.get(collection).set(rkey, {
      uri,
      cid: 'bafyreib2rxk3rh6kzwstatue', // Mock CID
      value: record
    })

    res.json({
      uri,
      cid: 'bafyreib2rxk3rh6kzwstate'
    })

    console.log(`✓ Created record: ${uri}`)
  } catch (error) {
    console.error('Error creating record:', error)
    res.status(500).json({
      error: 'InternalServerError',
      message: error.message
    })
  }
})

// GET /xrpc/com.atproto.repo.listRecords
app.get('/xrpc/com.atproto.repo.listRecords', (req, res) => {
  try {
    const { repo, collection, limit = 50 } = req.query

    if (!repo || !collection) {
      return res.status(400).json({
        error: 'InvalidRequest',
        message: 'Missing required parameters: repo, collection'
      })
    }

    const collectionRecords = records.get(collection)
    if (!collectionRecords) {
      return res.json({ records: [] })
    }

    // Get records as array and sort by rkey (which are TIDs, timestamp-based)
    const recordArray = Array.from(collectionRecords.entries())
      .map(([rkey, record]) => ({
        uri: record.uri,
        cid: record.cid,
        value: record.value
      }))
      .sort((a, b) => b.uri.localeCompare(a.uri)) // Reverse chronological
      .slice(0, parseInt(limit))

    res.json({
      records: recordArray
    })

    console.log(`✓ Listed ${recordArray.length} records from ${collection}`)
  } catch (error) {
    console.error('Error listing records:', error)
    res.status(500).json({
      error: 'InternalServerError',
      message: error.message
    })
  }
})

// GET /xrpc/com.atproto.repo.getRecord
app.get('/xrpc/com.atproto.repo.getRecord', (req, res) => {
  try {
    const { repo, collection, rkey } = req.query

    if (!repo || !collection || !rkey) {
      return res.status(400).json({
        error: 'InvalidRequest',
        message: 'Missing required parameters: repo, collection, rkey'
      })
    }

    const collectionRecords = records.get(collection)
    if (!collectionRecords || !collectionRecords.has(rkey)) {
      return res.status(404).json({
        error: 'RecordNotFound',
        message: `Record not found: ${collection}/${rkey}`
      })
    }

    const record = collectionRecords.get(rkey)
    res.json(record)

    console.log(`✓ Retrieved record: ${record.uri}`)
  } catch (error) {
    console.error('Error getting record:', error)
    res.status(500).json({
      error: 'InternalServerError',
      message: error.message
    })
  }
})

app.listen(PORT, () => {
  console.log(`\n🐱 Ffion Tracker API running on http://localhost:${PORT}`)
  console.log(`\nAvailable endpoints:`)
  console.log(`  POST   /xrpc/com.atproto.repo.createRecord`)
  console.log(`  GET    /xrpc/com.atproto.repo.listRecords`)
  console.log(`  GET    /xrpc/com.atproto.repo.getRecord`)
  console.log(`\nLexicons loaded: ${lex.defs.size} definitions`)
})
