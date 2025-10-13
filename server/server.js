import express from 'express'
import cors from 'cors'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { analyzeBuffer, analyzePlainRows } from './analyzer.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(cors())
// se quiser, aumente o limite de JSON caso cole muitas linhas
app.use(express.json({ limit: '10mb' }))

// Log simples de todas as requisições (ajuda no debug)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`)
  next()
})

// Multer: memória + limites + filtro de tipo
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            || file.originalname.toLowerCase().endsWith('.xlsx')
    if (!ok) return cb(new Error('Envie um arquivo .xlsx'))
    cb(null, true)
  }
})

// carrega config
const configPath = path.join(__dirname, 'config.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

// healthcheck
app.get('/api/ping', (_, res) => res.json({ ok: true }))

// upload .xlsx + análise
app.post('/api/analisar', upload.single('file'), async (req, res) => {
  try {
    console.log('Upload recebido:', {
      hasFile: !!req.file,
      name: req.file?.originalname,
      size: req.file?.size,
      type: req.file?.mimetype
    })
    if (!req.file) {
      return res.status(400).json({ error: 'Envie um arquivo .xlsx no campo "file"' })
    }

    const result = await analyzeBuffer(req.file.buffer, config)
    res.json(result)
  } catch (err) {
    console.error('ERRO /api/analisar:', err)
    res.status(500).json({ error: String(err.message || err) })
  }
})

// NOVO: aceita dados colados/editados em JSON -> { rows: [...] }
app.post('/api/analisar-json', async (req, res) => {
  try {
    const rows = req.body?.rows
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Envie { rows: [...] } com ao menos 1 linha' })
    }
    const result = await analyzePlainRows(rows, config)
    res.json(result)
  } catch (err) {
    console.error('ERRO /api/analisar-json:', err)
    res.status(500).json({ error: String(err.message || err) })
  }
})

// handler de erros do multer (tamanho, tipo, etc.)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // erros do multer (ex.: limite de tamanho)
    return res.status(400).json({ error: `Upload error: ${err.message}` })
  }
  if (err && err.message === 'Envie um arquivo .xlsx') {
    return res.status(400).json({ error: err.message })
  }
  return next(err)
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`))
