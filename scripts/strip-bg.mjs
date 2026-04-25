#!/usr/bin/env node
// One-shot BG stripper: takes every Gemini JPG in assets/ that has a magenta
// background and chroma-keys it into a transparent PNG in public/assets/sprites/.

import sharp from 'sharp'
import path from 'node:path'
import fs from 'node:fs'

const MAG_TOL = 60

async function keyMagenta(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  if (channels !== 4) throw new Error(`expected RGBA, got ${channels}`)
  const out = Buffer.from(data)
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i], g = out[i + 1], b = out[i + 2]
    const magenta = Math.min(r, b) - g
    if (g < 90 && r > 140 && b > 80 && magenta > MAG_TOL) {
      out[i + 3] = 0
    } else if (magenta > 30 && g < 180) {
      const bleed = Math.min(magenta - 20, 120)
      out[i]     = Math.max(0, r - Math.floor(bleed * 0.35))
      out[i + 1] = Math.min(255, g + Math.floor(bleed * 0.35))
      out[i + 2] = Math.max(0, b - Math.floor(bleed * 0.25))
    }
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer()
}

const SRC = 'assets'
const DST = 'public/assets/sprites'

const FILES = [
  // Station nameplates
  'templates_sign', 'intake_sign', 'data_sign', 'counter_sign',
  'shareout_sign', 'trash_sign', 'feedback_sign',
  'analysis_sign', 'synthesis_sign', 'copilot_sign',
  // Recipe icons
  'snapshot_recipe', 'snapshot_insight', 'snapshot_deepdive', 'snapshot_framework',
  // Data cooking badges + particle
  'ready', 'stale', 'steam_puf',
]

await fs.promises.mkdir(DST, { recursive: true })

for (const name of FILES) {
  const src = path.join(SRC, `${name}.jpg`)
  const dst = path.join(DST, `${name}.png`)
  if (!fs.existsSync(src)) {
    console.log(`  skip ${name}.jpg (not found)`)
    continue
  }
  const buf = await fs.promises.readFile(src)
  const keyed = await keyMagenta(buf)
  await fs.promises.writeFile(dst, keyed)
  console.log(`  ✓ ${name}.png`)
}

console.log('done')
