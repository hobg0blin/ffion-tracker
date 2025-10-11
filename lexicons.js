import { Lexicons } from '@atproto/lexicon'
import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// create lexicons collection
const lex = new Lexicons()

// load all lexicon files from lexicons/com/ffion/ directory
const lexiconsDir = join(__dirname, 'lexicons', 'com', 'ffion')
const lexiconFiles = readdirSync(lexiconsDir).filter(f => f.endsWith('.json'))

for (const file of lexiconFiles) {
  const lexiconPath = join(lexiconsDir, file)
  const lexiconData = JSON.parse(readFileSync(lexiconPath, 'utf-8'))
  lex.add(lexiconData)
}

// example: validate a status record
lex.assertValidRecord('com.ffion.status', {
  $type: 'com.ffion.status',
  state: 'com.ffion.sleeping',
  createdAt: new Date().toISOString()
})

console.log('✓ All lexicons loaded successfully')
console.log('✓ Status record validation passed')

export { lex }