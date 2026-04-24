#!/usr/bin/env node
// Cut a 2×2 Gemini character grid (magenta background) into a game-ready sprite sheet.
//
// Input  : 2×2 grid where top row = back views, bottom row = front views
//          (whichever horizontal direction — we mirror to fill both sides)
// Output : 60×448 single-frame sheet (1 col × 4 rows) matching the game's layout.
//          Row order top→bottom: DL, UL, UR, DR (matches existing owner.png)
//
// Usage  : node scripts/tile-sprites.mjs --in assets/monkey_raw.png --out public/assets/owner.png
//          Optional flags:
//            --frame-h 112    Output frame height in px (default 112)
//            --frame-w 60     Output frame width in px (default 60)
//            --back-side right|left   Which column in top row to extract the back pose from
//                                     (default: right — uses top-right cell)
//            --front-side right|left  Same for bottom row front pose (default: right)
//            --back-faces left|right  Which iso direction the back-view pose actually faces.
//                                     Default: left (most AI-generated back views lean screen-left).
//            --front-faces left|right Same for the front-view pose.
//                                     Default: right (AI-generated front views commonly lean the other way).
//            --source-faces both      Shortcut: override both (takes 'left' or 'right').
//            --magenta-tol 60 Chroma-key tolerance for magenta removal (default 60)
//            --margin 0.08    Fraction of frame to leave as bottom padding so feet aren't clipped

import sharp from 'sharp'
import path from 'node:path'
import fs from 'node:fs'

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, arr) => {
    if (v.startsWith('--')) acc.push([v.slice(2), arr[i + 1]])
    return acc
  }, [])
)

const IN          = args.in || 'assets/monkey_raw.png'
const OUT         = args.out || 'public/assets/owner.png'
const FRAME_W     = parseInt(args['frame-w'] || '60', 10)
const FRAME_H     = parseInt(args['frame-h'] || '112', 10)
const BACK_SIDE    = args['back-side'] || 'right'
const FRONT_SIDE   = args['front-side'] || 'right'
// Back and front can face different directions in AI-generated sources.
// Defaults reflect the first monkey we processed (back faces left, front faces right).
const BACK_FACES   = args['back-faces']  || args['source-faces'] || 'left'
const FRONT_FACES  = args['front-faces'] || args['source-faces'] || 'right'
const MAG_TOL     = parseInt(args['magenta-tol'] || '60', 10)
const MARGIN_FRAC = parseFloat(args.margin || '0.06')

if (!fs.existsSync(IN)) {
  console.error(`Input not found: ${IN}`)
  console.error(`Save your 2×2 character grid PNG to that path, or pass --in <path>.`)
  process.exit(1)
}

console.log(`→ reading ${IN}`)
const src = sharp(IN)
const meta = await src.metadata()
console.log(`   source ${meta.width}×${meta.height}`)

const cellW = Math.floor(meta.width / 2)
const cellH = Math.floor(meta.height / 2)

// Pick the two canonical cells we need
const backLeft  = BACK_SIDE === 'left'
const frontLeft = FRONT_SIDE === 'left'
const backX  = backLeft  ? 0 : cellW
const frontX = frontLeft ? 0 : cellW

async function cutCell(x, y) {
  return await sharp(IN).extract({ left: x, top: y, width: cellW, height: cellH }).toBuffer()
}

// Chroma-key magenta (FF00FF ± tol): set alpha=0 for near-magenta pixels.
// Works on raw RGBA — we detect pixels with high R, high B, low G.
async function keyMagenta(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  if (channels !== 4) throw new Error(`expected RGBA, got ${channels} channels`)
  const out = Buffer.from(data)
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i], g = out[i + 1], b = out[i + 2]
    // Magenta/pink detection: R is high relative to G, B is also clearly above G.
    // Uses min(R,B) so we catch both pure magenta (255,0,255) and dark pink (~185,15,128).
    // Gates on low G + high magenta-ness; threshold MAG_TOL defaults to 60.
    const magenta = Math.min(r, b) - g
    if (g < 90 && r > 140 && b > 80 && magenta > MAG_TOL) {
      out[i + 3] = 0 // transparent
    } else if (magenta > 30 && g < 180) {
      // Soft edge: fringe pixels still have a magenta tint — nudge green up and
      // pull red/blue toward green to kill the purple halo.
      const bleed = Math.min(magenta - 20, 120)
      out[i]     = Math.max(0, r - Math.floor(bleed * 0.35))
      out[i + 1] = Math.min(255, g + Math.floor(bleed * 0.35))
      out[i + 2] = Math.max(0, b - Math.floor(bleed * 0.25))
    }
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer()
}

// Erase everything except the largest connected component of opaque pixels.
// Removes stray watermarks, sparkles, and isolated specks that survive chroma-keying.
async function keepLargestBlob(buf) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  const N = width * height
  const labels = new Int32Array(N) // 0 = unvisited or background
  const sizes = [0]                 // index 0 reserved
  const bestFor = []                // label index → pixel count
  let nextLabel = 1
  const stack = new Int32Array(N)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      if (labels[idx] !== 0) continue
      if (data[idx * 4 + 3] <= 16) continue
      // BFS flood-fill
      const label = nextLabel++
      let top = 0
      stack[top++] = idx
      labels[idx] = label
      let count = 0
      while (top > 0) {
        const p = stack[--top]
        count++
        const py = (p / width) | 0
        const px = p - py * width
        // 4-connectivity neighbours
        if (px > 0) {
          const np = p - 1
          if (labels[np] === 0 && data[np * 4 + 3] > 16) { labels[np] = label; stack[top++] = np }
        }
        if (px < width - 1) {
          const np = p + 1
          if (labels[np] === 0 && data[np * 4 + 3] > 16) { labels[np] = label; stack[top++] = np }
        }
        if (py > 0) {
          const np = p - width
          if (labels[np] === 0 && data[np * 4 + 3] > 16) { labels[np] = label; stack[top++] = np }
        }
        if (py < height - 1) {
          const np = p + width
          if (labels[np] === 0 && data[np * 4 + 3] > 16) { labels[np] = label; stack[top++] = np }
        }
      }
      bestFor[label] = count
    }
  }
  // Find the largest blob
  let bestLabel = 0, bestSize = 0
  for (let i = 1; i < nextLabel; i++) {
    if (bestFor[i] > bestSize) { bestSize = bestFor[i]; bestLabel = i }
  }
  // Zero alpha on everything that isn't the best label
  const out = Buffer.from(data)
  for (let i = 0; i < N; i++) {
    if (labels[i] !== bestLabel) {
      out[i * 4 + 3] = 0
    }
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer()
}

// Trim transparent edges so the character fills the cell nicely, then pad to target ratio.
async function tightTrim(buf) {
  const img = sharp(buf)
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  const { width, height } = info
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3]
      if (a > 16) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return buf // nothing opaque found
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  return sharp(buf).extract({ left: minX, top: minY, width: w, height: h }).toBuffer()
}

// Resize the trimmed silhouette to fit inside FRAME_W × FRAME_H (with bottom alignment + margin).
async function fitToFrame(buf) {
  const m = await sharp(buf).metadata()
  const availH = Math.floor(FRAME_H * (1 - MARGIN_FRAC)) // leave a little air at top and bottom
  const availW = Math.floor(FRAME_W * 0.96)
  // Scale so both fit within available space, preserve aspect
  const scale = Math.min(availW / m.width, availH / m.height)
  const newW = Math.max(1, Math.round(m.width * scale))
  const newH = Math.max(1, Math.round(m.height * scale))
  const resized = await sharp(buf)
    .resize(newW, newH, { kernel: 'lanczos3', fit: 'fill' })
    .toBuffer()
  // Composite onto a transparent FRAME_W × FRAME_H canvas, feet near bottom
  const padBottom = Math.floor(FRAME_H * (MARGIN_FRAC * 0.5))
  const top = FRAME_H - newH - padBottom
  const left = Math.floor((FRAME_W - newW) / 2)
  return sharp({
    create: {
      width: FRAME_W, height: FRAME_H, channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, left: Math.max(0, left), top: Math.max(0, top) }])
    .png()
    .toBuffer()
}

async function mirror(buf) {
  return sharp(buf).flop().toBuffer()
}

console.log('→ cutting back & front cells')
const backRawRight  = await cutCell(backX,  0)       // top row
const frontRawRight = await cutCell(frontX, cellH)   // bottom row

console.log('→ chroma-keying magenta')
const backKeyed  = await keyMagenta(backRawRight)
const frontKeyed = await keyMagenta(frontRawRight)

console.log('→ keeping only largest connected component (removes watermarks/sparkles)')
const backClean  = await keepLargestBlob(backKeyed)
const frontClean = await keepLargestBlob(frontKeyed)

console.log('→ trimming transparent margins')
const backTight  = await tightTrim(backClean)
const frontTight = await tightTrim(frontClean)

console.log(`→ resizing to ${FRAME_W}×${FRAME_H} frames`)
// The source pose faces one way; mirror to produce the opposite. When the source
// faces iso-left (common for AI art), we put the AS-IS pose in UL/DL and use mirrors for UR/DR.
const backFitted  = await fitToFrame(backTight)
const frontFitted = await fitToFrame(frontTight)
const backMirror  = await mirror(backFitted)
const frontMirror = await mirror(frontFitted)
// Back view: if source faces right, as-is goes to UR. Else mirror goes to UR.
const [UR_frame, UL_frame] = BACK_FACES === 'right'
  ? [backFitted, backMirror]
  : [backMirror, backFitted]
// Front view: same logic, but front typically faces the opposite way of back in AI art.
const [DR_frame, DL_frame] = FRONT_FACES === 'right'
  ? [frontFitted, frontMirror]
  : [frontMirror, frontFitted]
console.log(`   back faces ${BACK_FACES} (UR=${BACK_FACES === 'right' ? 'as-is' : 'mirrored'}), front faces ${FRONT_FACES} (DR=${FRONT_FACES === 'right' ? 'as-is' : 'mirrored'})`)

console.log('→ assembling 1×4 sprite sheet (DL, UL, UR, DR top→bottom)')
const sheet = await sharp({
  create: {
    width: FRAME_W, height: FRAME_H * 4, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([
    { input: DL_frame, left: 0, top: FRAME_H * 0 },
    { input: UL_frame, left: 0, top: FRAME_H * 1 },
    { input: UR_frame, left: 0, top: FRAME_H * 2 },
    { input: DR_frame, left: 0, top: FRAME_H * 3 },
  ])
  .png()
  .toBuffer()

await fs.promises.mkdir(path.dirname(OUT), { recursive: true })
await fs.promises.writeFile(OUT, sheet)
console.log(`✓ wrote ${OUT}  (${FRAME_W}×${FRAME_H * 4}, 1 col × 4 rows)`)
console.log(`  Remember: for single-frame-per-direction mode, set COLS = 1 in src/components/Player.tsx`)
