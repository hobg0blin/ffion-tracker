import express from 'express'
import multer from 'multer'
import { TID } from '@atproto/common-web'
import { Agent } from '@atproto/api'
import { isValidHandle } from '@atproto/syntax'
import { getIronSession } from 'iron-session'
import { lex } from './lexicons.js'
import { createOAuthClient } from './oauth-client.js'

const app = express()
const upload = multer({ storage: multer.memoryStorage() })
const PORT = 3000

// In-memory storage for records
const records = new Map()

// In-memory storage for sessions (maps session IDs to DIDs)
const sessions = new Map()

// Cookie secret for session encryption (in production, use a secure random string)
const COOKIE_SECRET = 'this-is-a-development-secret-please-change-in-production-min-32-chars'

// Initialize OAuth client
let oauthClient
const initOAuthClient = async () => {
  oauthClient = await createOAuthClient(PORT)
  console.log('✓ OAuth client initialized')
}

// Helper function to get session
async function getSession(req, res) {
  return await getIronSession(req, res, {
    cookieName: 'ffion_sid',
    password: COOKIE_SECRET,
    cookieOptions: {
      secure: false, // Allow cookies over HTTP for localhost
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    }
  })
}

// Helper function to get authenticated agent for current session
async function getSessionAgent(req, res) {
  const session = await getSession(req, res)
  if (!session.did) return null
  try {
    const oauthSession = await oauthClient.restore(session.did)
    return oauthSession ? new Agent(oauthSession) : null
  } catch (err) {
    console.error('Failed to restore OAuth session:', err)
    await session.destroy()
    return null
  }
}

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// GET / - Display Ffion status with navigation
app.get('/', async (req, res) => {
  try {
    const hardcodedDid = 'did:plc:crwugtsporw4ixhqqyul4km6'
    const index = parseInt(req.query.index || '0')

    // Create an agent without authentication (public access)
    const agent = new Agent({ service: 'https://atproto.bront.rodeo' })

    // Fetch all statuses
    const response = await agent.com.atproto.repo.listRecords({
      repo: hardcodedDid,
      collection: 'com.ffion.status',
      limit: 100
    })

    const records = response.data.records

    if (records.length === 0) {
      return res.send(`
        <html>
          <head>
            <style>
              body { font-family: 'Comic Sans MS', cursive, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; background: #f5f5f5; }
              .container { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              h1 { color: #ff6b9d; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🐱 Ffion's Status</h1>
              <p>No status updates yet!</p>
            </div>
          </body>
        </html>
      `)
    }

    // Clamp index to valid range
    const validIndex = Math.max(0, Math.min(index, records.length - 1))
    const currentStatus = records[validIndex].value
    const currentRecord = records[validIndex]
    const stateEmojis = {
      'com.ffion.eating': '🍽️',
      'com.ffion.zoomies': '💨',
      'com.ffion.playing': '🎾',
      'com.ffion.sleeping': '😴'
    }

    const stateName = currentStatus.state.replace('com.ffion.', '')
    const emoji = stateEmojis[currentStatus.state] || '🐱'
    const timestamp = new Date(currentStatus.createdAt).toLocaleString()

    // Extract rkey from URI (format: at://did/collection/rkey)
    const rkey = currentRecord.uri.split('/').pop()

    let imageHtml = ''
    if (currentStatus.image) {
      // Extract CID from blob reference
      // The ref property is a CID object, so we need to convert it to a string
      let blobCid = null

      if (currentStatus.image.ref) {
        // CID objects have a toString() method
        blobCid = currentStatus.image.ref.toString()
      } else if (typeof currentStatus.image.ref === 'string') {
        blobCid = currentStatus.image.ref
      }

      console.log('Extracted CID:', blobCid)

      if (blobCid) {
        const blobUrl = `https://atproto.bront.rodeo/xrpc/com.atproto.sync.getBlob?did=${hardcodedDid}&cid=${blobCid}`
        imageHtml = `<img src="${blobUrl}" alt="Ffion" style="max-width: 100%; border-radius: 10px; margin: 20px 0;">`
      } else {
        console.error('Could not extract CID from image blob')
      }
    }

    // Navigation
    const hasPrevious = validIndex > 0
    const hasNext = validIndex < records.length - 1
    const previousIndex = validIndex - 1
    const nextIndex = validIndex + 1

    res.send(`
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Ffion's Latest Status</title>
          <style>
            body {
              font-family: 'Comic Sans MS', cursive, sans-serif;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
            }
            .container {
              background: white;
              padding: 30px;
              border-radius: 20px;
              box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            }
            h1 {
              color: #ff6b9d;
              font-size: 2.5em;
              margin-bottom: 10px;
            }
            .status {
              font-size: 1.5em;
              padding: 20px;
              background: #f0f0f0;
              border-radius: 10px;
              margin: 20px 0;
              border-left: 5px solid #ff6b9d;
            }
            .emoji { font-size: 2em; margin-right: 10px; }
            .text {
              font-style: italic;
              color: #555;
              margin: 15px 0;
              font-size: 1.2em;
            }
            .timestamp {
              color: #999;
              font-size: 0.9em;
              margin-top: 20px;
            }
            .refresh {
              text-align: center;
              margin-top: 20px;
            }
            .refresh a {
              background: #ff6b9d;
              color: white;
              padding: 10px 20px;
              text-decoration: none;
              border-radius: 5px;
              display: inline-block;
            }
            .refresh a:hover {
              background: #ff5a8c;
            }
            .navigation {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-top: 20px;
              gap: 10px;
            }
            .nav-button {
              background: #667eea;
              color: white;
              padding: 10px 20px;
              text-decoration: none;
              border-radius: 5px;
              display: inline-block;
              flex: 1;
              text-align: center;
            }
            .nav-button:hover:not(.disabled) {
              background: #5568d3;
            }
            .nav-button.disabled {
              background: #ccc;
              cursor: not-allowed;
              pointer-events: none;
            }
            .status-counter {
              color: #999;
              font-size: 0.9em;
              text-align: center;
              margin-top: 10px;
            }
            .delete-button {
              background: #dc3545;
              color: white;
              padding: 12px 24px;
              border: none;
              border-radius: 5px;
              font-size: 16px;
              cursor: pointer;
              margin-top: 20px;
              width: 100%;
              font-family: 'Comic Sans MS', cursive, sans-serif;
              font-weight: bold;
            }
            .delete-button:hover {
              background: #c82333;
            }
            .delete-button:disabled {
              background: #ccc;
              cursor: not-allowed;
            }
          </style>
          <script>
            async function deleteStatus() {
              if (!confirm('Are you sure you want to delete this status? This cannot be undone.')) {
                return;
              }

              const deleteBtn = document.getElementById('deleteBtn');
              deleteBtn.disabled = true;
              deleteBtn.textContent = 'Deleting...';

              try {
                const response = await fetch('/ffion/status/${rkey}', {
                  method: 'DELETE',
                  credentials: 'include'
                });

                if (response.ok) {
                  alert('Status deleted successfully!');
                  window.location.href = '/';
                } else {
                  const data = await response.json();
                  if (response.status === 401) {
                    alert('Not authenticated. Please log in first at /login');
                  } else {
                    alert('Failed to delete: ' + (data.message || 'Unknown error'));
                  }
                  deleteBtn.disabled = false;
                  deleteBtn.textContent = '🗑️ Delete This Status';
                }
              } catch (error) {
                alert('Network error: ' + error.message);
                deleteBtn.disabled = false;
                deleteBtn.textContent = '🗑️ Delete This Status';
              }
            }
          </script>
        </head>
        <body>
          <div class="container">
            <h1>Ffion Is <strong>${stateName.toUpperCase()}</strong></h1>
            ${currentStatus.text ? `<div class="text">"${currentStatus.text}"</div>` : ''}
            ${imageHtml}
            <div class="timestamp">📅 ${timestamp}</div>
            <div class="status-counter">Status ${validIndex + 1} of ${records.length}</div>
            <div class="navigation">
              <a href="/?index=${previousIndex}" class="nav-button ${!hasPrevious ? 'disabled' : ''}">
                ← Newer
              </a>
              <a href="/?index=0" class="nav-button">
                Latest
              </a>
              <a href="/?index=${nextIndex}" class="nav-button ${!hasNext ? 'disabled' : ''}">
                Older →
              </a>
            </div>
            <button id="deleteBtn" class="delete-button" onclick="deleteStatus()">
              🗑️ Delete This Status
            </button>
          </div>
        </body>
      </html>
    `)
  } catch (err) {
    console.error('Error fetching status:', err)
    res.status(500).send(`
      <html>
        <head>
          <style>
            body { font-family: monospace; padding: 40px; max-width: 800px; margin: 0 auto; }
            .error { background: #ffebee; padding: 20px; border-radius: 10px; color: #c62828; }
          </style>
        </head>
        <body>
          <div class="error">
            <h1>Error Loading Status</h1>
            <p>${err.message}</p>
          </div>
        </body>
      </html>
    `)
  }
})

// OAuth endpoints

// GET /client-metadata.json - OAuth client metadata
app.get('/client-metadata.json', (req, res) => {
  res.json(oauthClient.clientMetadata)
})

// GET /login - Display login form
app.get('/login', (req, res) => {
  res.send(`
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Ffion Tracker - Login</title>
        <style>
          body {
            font-family: 'Comic Sans MS', cursive, sans-serif;
            padding: 20px;
            max-width: 600px;
            margin: 0 auto;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            width: 100%;
          }
          h1 {
            color: #ff6b9d;
            text-align: center;
            margin-bottom: 30px;
          }
          .form-group {
            margin-bottom: 20px;
          }
          label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-weight: bold;
          }
          input[type="text"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 8px;
            font-size: 16px;
            box-sizing: border-box;
            font-family: monospace;
          }
          input[type="text"]:focus {
            outline: none;
            border-color: #ff6b9d;
          }
          button {
            width: 100%;
            padding: 15px;
            background: #ff6b9d;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            font-family: 'Comic Sans MS', cursive, sans-serif;
          }
          button:hover {
            background: #ff5a8c;
          }
          button:disabled {
            background: #ccc;
            cursor: not-allowed;
          }
          .example {
            color: #666;
            font-size: 14px;
            margin-top: 5px;
          }
          .status {
            margin-top: 20px;
            padding: 15px;
            border-radius: 8px;
            display: none;
          }
          .status.error {
            background: #ffebee;
            color: #c62828;
            display: block;
          }
          .status.success {
            background: #e8f5e9;
            color: #2e7d32;
            display: block;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🐱 Ffion Tracker Login</h1>
          <form id="loginForm">
            <div class="form-group">
              <label for="handle">ATProto Handle:</label>
              <input
                type="text"
                id="handle"
                name="handle"
                placeholder="your-handle.bsky.social"
                required
              >
              <div class="example">Example: alice.bsky.social or alice.example.com</div>
            </div>
            <button type="submit" id="submitBtn">Login with ATProto</button>
          </form>
          <div id="status" class="status"></div>
        </div>

        <script>
          const form = document.getElementById('loginForm');
          const status = document.getElementById('status');
          const submitBtn = document.getElementById('submitBtn');

          form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const handle = document.getElementById('handle').value.trim();

            if (!handle) {
              status.className = 'status error';
              status.textContent = 'Please enter your ATProto handle';
              return;
            }

            // Disable form
            submitBtn.disabled = true;
            submitBtn.textContent = 'Connecting...';
            status.className = 'status';
            status.style.display = 'none';

            try {
              const response = await fetch('/login', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ handle }),
              });

              const data = await response.json();

              if (response.ok && data.authUrl) {
                status.className = 'status success';
                status.textContent = 'Redirecting to authentication...';
                status.style.display = 'block';

                // Redirect to OAuth provider
                setTimeout(() => {
                  window.location.href = data.authUrl;
                }, 1000);
              } else {
                status.className = 'status error';
                status.textContent = data.message || 'Login failed. Please try again.';
                status.style.display = 'block';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Login with ATProto';
              }
            } catch (error) {
              status.className = 'status error';
              status.textContent = 'Network error. Please try again.';
              status.style.display = 'block';
              submitBtn.disabled = false;
              submitBtn.textContent = 'Login with ATProto';
            }
          });
        </script>
      </body>
    </html>
  `)
})

// POST /login - Initiate OAuth flow
app.post('/login', async (req, res) => {
  try {
    const { handle } = req.body

    if (!handle || !isValidHandle(handle)) {
      return res.status(400).json({
        error: 'InvalidRequest',
        message: 'Invalid or missing handle'
      })
    }

    // Initiate OAuth flow
    const url = await oauthClient.authorize(handle, {
      scope: 'atproto transition:generic',
    })

    // Return the authorization URL for the user to visit
    res.json({
      authUrl: url.toString(),
      message: 'Visit the authUrl in your browser to complete authentication'
    })
  } catch (err) {
    console.error('OAuth authorize failed:', err)
    res.status(500).json({
      error: 'OAuthError',
      message: err.message || 'Failed to initiate OAuth flow'
    })
  }
})

// GET /oauth/callback - OAuth callback to complete authentication
app.get('/oauth/callback', async (req, res) => {
  try {
    const params = new URLSearchParams(req.originalUrl.split('?')[1])
    const { session: oauthSession } = await oauthClient.callback(params)

    console.log('OAuth callback successful, DID:', oauthSession.did)

    // Create iron-session
    const session = await getSession(req, res)
    console.log('Session before save:', session)
    session.did = oauthSession.did
    await session.save()

    console.log('Session saved with DID:', session.did)
    console.log('Session after save:', session)

    // Get the cookie that was set
    const setCookieHeader = res.getHeader('Set-Cookie')
    console.log('Set-Cookie header:', setCookieHeader)
    console.log('Request host:', req.headers.host)

    res.send(`
      <html>
        <head>
          <style>
            body { font-family: monospace; padding: 20px; max-width: 800px; margin: 0 auto; }
            .cookie-box { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; word-break: break-all; }
            .success { color: green; }
            code { background: #e0e0e0; padding: 2px 6px; border-radius: 3px; }
            .button { background: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
          </style>
        </head>
        <body>
          <h1 class="success">✓ Authentication successful!</h1>
          <p>You are now logged in as: <strong>${oauthSession.did}</strong></p>

          <h2>For CURL Usage:</h2>
          <p>Visit this page to get your session cookie value:</p>
          <a href="/get-cookie" class="button">Get Cookie for CURL</a>

          <p>Or check your browser's developer tools (F12) → Application → Cookies → <code>http://127.0.0.1:3000</code></p>
          <p>Look for the cookie named <code>ffion_sid</code></p>

          <hr>
          <p><small>You can close this window now.</small></p>
        </body>
      </html>
    `)
  } catch (err) {
    console.error('OAuth callback failed:', err)
    res.status(500).send(`
      <html>
        <body>
          <h1>Authentication failed</h1>
          <p>Error: ${err.message}</p>
        </body>
      </html>
    `)
  }
})

// GET /get-cookie - Display session cookie for copying to curl
app.get('/get-cookie', async (req, res) => {
  try {
    const session = await getSession(req, res)

    if (!session.did) {
      return res.send(`
        <html>
          <head><style>body { font-family: monospace; padding: 20px; max-width: 800px; margin: 0 auto; }</style></head>
          <body>
            <h1>No active session</h1>
            <p>Please complete the OAuth flow first by visiting <a href="/login">POST /login</a></p>
          </body>
        </html>
      `)
    }

    // Get the cookie value from the request
    const cookies = req.headers.cookie || ''
    const cookieMatch = cookies.match(/ffion_sid=([^;]+)/)
    const cookieValue = cookieMatch ? cookieMatch[1] : 'not found'

    res.send(`
      <html>
        <head>
          <style>
            body { font-family: monospace; padding: 20px; max-width: 900px; margin: 0 auto; }
            .cookie-box {
              background: #f0f0f0;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
              word-break: break-all;
              border: 2px solid #4CAF50;
            }
            code { background: #e0e0e0; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
            pre { background: #2d2d2d; color: #f8f8f8; padding: 15px; border-radius: 5px; overflow-x: auto; }
            .success { color: green; }
            button { background: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
            button:hover { background: #45a049; }
          </style>
          <script>
            function copyCookie() {
              const text = document.getElementById('cookie-value').textContent;
              navigator.clipboard.writeText(text).then(() => {
                document.getElementById('copy-status').textContent = '✓ Copied!';
                setTimeout(() => {
                  document.getElementById('copy-status').textContent = '';
                }, 2000);
              });
            }
          </script>
        </head>
        <body>
          <h1 class="success">✓ Session Active</h1>
          <p><strong>DID:</strong> ${session.did}</p>

          <h2>Cookie Value for CURL:</h2>
          <div class="cookie-box">
            <code id="cookie-value">${cookieValue}</code>
          </div>
          <button onclick="copyCookie()">📋 Copy Cookie Value</button>
          <span id="copy-status" style="margin-left: 10px; color: green;"></span>

          <h2>Create cookies.txt file:</h2>
          <pre># Netscape HTTP Cookie File
127.0.0.1	FALSE	/	FALSE	0	ffion_sid	${cookieValue}</pre>

          <h2>Then test with CURL:</h2>
          <pre>curl http://127.0.0.1:3000/session -b cookies.txt</pre>

          <h2>Or use directly with -b flag:</h2>
          <pre>curl http://127.0.0.1:3000/session -b "ffion_sid=${cookieValue}"</pre>

          <h2>Post a status:</h2>
          <pre>curl -X POST http://127.0.0.1:3000/ffion/status \\
  -H "Content-Type: application/json" \\
  -b "ffion_sid=${cookieValue}" \\
  -d '{"state": "com.ffion.eating", "text": "Nom nom!"}'</pre>
        </body>
      </html>
    `)
  } catch (err) {
    console.error('Error getting cookie:', err)
    res.status(500).send(`
      <html>
        <body>
          <h1>Error</h1>
          <p>${err.message}</p>
        </body>
      </html>
    `)
  }
})

// POST /logout - Clear session
app.post('/logout', async (req, res) => {
  try {
    const session = await getSession(req, res)
    await session.destroy()
    res.json({ message: 'Logged out successfully' })
  } catch (err) {
    console.error('Logout failed:', err)
    res.status(500).json({
      error: 'LogoutError',
      message: err.message
    })
  }
})

// GET /session - Check current session
app.get('/session', async (req, res) => {
  try {
    console.log('Session check - Cookies received:', req.headers.cookie)
    const session = await getSession(req, res)
    console.log('Session data:', session)
    console.log('Session DID:', session.did)

    if (!session.did) {
      console.log('No DID in session')
      return res.json({ authenticated: false, debug: 'No DID in session' })
    }

    try {
      const oauthSession = await oauthClient.restore(session.did)
      console.log('OAuth session restored:', !!oauthSession)

      if (!oauthSession) {
        console.log('Failed to restore OAuth session')
        return res.json({ authenticated: false, debug: 'Failed to restore OAuth session' })
      }

      const agent = new Agent(oauthSession)
      res.json({
        authenticated: true,
        did: agent.assertDid
      })
    } catch (err) {
      console.error('Error restoring OAuth session:', err)
      return res.json({
        authenticated: false,
        debug: 'Error restoring OAuth session',
        error: err.message
      })
    }
  } catch (err) {
    console.error('Session error:', err)
    res.status(500).json({
      error: 'SessionError',
      message: err.message
    })
  }
})

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

// DELETE /ffion/status/:rkey - Delete a Ffion status from the PDS
app.delete('/ffion/status/:rkey', async (req, res) => {
  try {
    // Check authentication
    const agent = await getSessionAgent(req, res)
    if (!agent) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'You must be logged in to delete a status.'
      })
    }

    const { rkey } = req.params

    if (!rkey) {
      return res.status(400).json({
        error: 'InvalidRequest',
        message: 'Missing record key (rkey)'
      })
    }

    // Delete the record from the PDS
    try {
      await agent.com.atproto.repo.deleteRecord({
        repo: agent.assertDid,
        collection: 'com.ffion.status',
        rkey
      })

      console.log(`✓ Deleted status from PDS: at://${agent.assertDid}/com.ffion.status/${rkey}`)

      res.json({
        success: true,
        message: 'Status deleted successfully',
        uri: `at://${agent.assertDid}/com.ffion.status/${rkey}`
      })
    } catch (err) {
      console.error('Failed to delete from PDS:', err)
      res.status(500).json({
        error: 'PDSError',
        message: `Failed to delete from PDS: ${err.message}`
      })
    }
  } catch (err) {
    console.error('Error deleting status:', err)
    res.status(500).json({
      error: 'InternalServerError',
      message: err.message
    })
  }
})

// POST /ffion/status - Post a Ffion status to authenticated user's PDS
app.post('/ffion/status', upload.single('image'), async (req, res) => {
  try {
    // Check authentication
    const agent = await getSessionAgent(req, res)
    if (!agent) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'You must be logged in to post a status. Use POST /login first.'
      })
    }

    const { state, text } = req.body

    // Validate state
    const validStates = [
      'com.ffion.eating',
      'com.ffion.zoomies',
      'com.ffion.playing',
      'com.ffion.sleeping'
    ]

    if (!state || !validStates.includes(state)) {
      return res.status(400).json({
        error: 'InvalidRequest',
        message: `Invalid state. Must be one of: ${validStates.join(', ')}`
      })
    }

    // Upload image blob if provided
    let blobRef = null
    if (req.file) {
      try {
        console.log(`Uploading image blob: ${req.file.mimetype}, ${req.file.size} bytes`)

        const blobResponse = await agent.com.atproto.repo.uploadBlob(
          req.file.buffer,
          {
            encoding: req.file.mimetype
          }
        )

        blobRef = blobResponse.data.blob
        console.log(`✓ Blob uploaded: ${blobRef.ref.$link}`)
      } catch (err) {
        console.error('Failed to upload blob:', err)
        return res.status(500).json({
          error: 'BlobUploadError',
          message: `Failed to upload image: ${err.message}`
        })
      }
    }

    // Construct the status record
    const rkey = TID.nextStr()
    const record = {
      $type: 'com.ffion.status',
      state,
      createdAt: new Date().toISOString()
    }

    if (text) {
      record.text = text
    }

    if (blobRef) {
      record.image = blobRef
    }

    // Validate against lexicon
    try {
      lex.assertValidRecord('com.ffion.status', record)
    } catch (validationError) {
      return res.status(400).json({
        error: 'InvalidRecord',
        message: validationError.message
      })
    }

    // Write to the user's PDS
    try {
      const result = await agent.com.atproto.repo.putRecord({
        repo: agent.assertDid,
        collection: 'com.ffion.status',
        rkey,
        record,
        validate: false
      })

      console.log(`✓ Posted status to PDS: ${result.data.uri}`)

      res.json({
        success: true,
        uri: result.data.uri,
        cid: result.data.cid,
        record
      })
    } catch (err) {
      console.error('Failed to write to PDS:', err)
      res.status(500).json({
        error: 'PDSError',
        message: `Failed to write to PDS: ${err.message}`
      })
    }
  } catch (err) {
    console.error('Error posting status:', err)
    res.status(500).json({
      error: 'InternalServerError',
      message: err.message
    })
  }
})

app.listen(PORT, async () => {
  await initOAuthClient()
  console.log(`\n🐱 Ffion Tracker API running on http://127.0.0.1:${PORT}`)
  console.log(`\nOAuth endpoints:`)
  console.log(`  POST   /login                           - Initiate OAuth login`)
  console.log(`  GET    /oauth/callback                  - OAuth callback (browser)`)
  console.log(`  GET    /get-cookie                      - Get session cookie for CURL (browser)`)
  console.log(`  POST   /logout                          - Logout`)
  console.log(`  GET    /session                         - Check session status`)
  console.log(`  GET    /client-metadata.json            - OAuth client metadata`)
  console.log(`\nAuthenticated endpoints:`)
  console.log(`  POST   /ffion/status                    - Post Ffion status to PDS`)
  console.log(`\nLocal XRPC endpoints (in-memory):`)
  console.log(`  POST   /xrpc/com.atproto.repo.createRecord`)
  console.log(`  GET    /xrpc/com.atproto.repo.listRecords`)
  console.log(`  GET    /xrpc/com.atproto.repo.getRecord`)
  console.log(`\nLexicons loaded: ${lex.defs.size} definitions`)
  console.log(`\nTo get started:`)
  console.log(`  1. POST to /login with your ATProto handle`)
  console.log(`  2. Visit the authUrl in your browser`)
  console.log(`  3. Visit http://127.0.0.1:3000/get-cookie in browser to get cookie`)
  console.log(`  4. Use the cookie with CURL to POST to /ffion/status`)
})
