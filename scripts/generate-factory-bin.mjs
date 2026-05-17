#!/usr/bin/env node
/**
 * Generate the binary buffer for factory-scene.gltf
 * Produces factory-scene.bin with all geometry data + ground indices
 */
import { writeFileSync } from 'fs'

const buf = Buffer.alloc(4812)
let offset = 0

function writeBox(ox, oy, oz, w, h, d) {
  const hw = w / 2, hh = h / 2, hd = d / 2
  // 6 faces × 2 triangles × 3 vertices = 36 vertices
  const faces = [
    // Front (z+)
    [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd],
    [-hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd],
    // Back (z-)
    [hw, -hh, -hd], [-hw, -hh, -hd], [-hw, hh, -hd],
    [hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd],
    // Top (y+)
    [-hw, hh, -hd], [-hw, hh, hd], [hw, hh, hd],
    [-hw, hh, -hd], [hw, hh, hd], [hw, hh, -hd],
    // Bottom (y-)
    [-hw, -hh, hd], [-hw, -hh, -hd], [hw, -hh, -hd],
    [-hw, -hh, hd], [hw, -hh, -hd], [hw, -hh, hd],
    // Right (x+)
    [hw, -hh, hd], [hw, -hh, -hd], [hw, hh, -hd],
    [hw, -hh, hd], [hw, hh, -hd], [hw, hh, hd],
    // Left (x-)
    [-hw, -hh, -hd], [-hw, -hh, hd], [-hw, hh, hd],
    [-hw, -hh, -hd], [-hw, hh, hd], [-hw, hh, -hd],
  ]
  for (const [x, y, z] of faces) {
    buf.writeFloatLE(x + ox, offset); offset += 4
    buf.writeFloatLE(y + oy, offset); offset += 4
    buf.writeFloatLE(z + oz, offset); offset += 4
  }
}

// 0: Ground plane - 4 vertices
const gv = [
  [-60, 0, -50], [60, 0, -50], [60, 0, 50], [-60, 0, 50]
]
for (const [x, y, z] of gv) {
  buf.writeFloatLE(x, offset); offset += 4
  buf.writeFloatLE(y, offset); offset += 4
  buf.writeFloatLE(z, offset); offset += 4
}
console.assert(offset === 48, `Ground: expected 48, got ${offset}`)

// 1: Workshop1 24×16×8
writeBox(0, 0, 0, 24, 8, 16)
console.assert(offset === 480, `Workshop1: expected 480, got ${offset}`)

// 2: Workshop2 20×14×7
writeBox(0, 0, 0, 20, 7, 14)
console.assert(offset === 912, `Workshop2: expected 912, got ${offset}`)

// 3: Warehouse 18×12×6
writeBox(0, 0, 0, 18, 6, 12)
console.assert(offset === 1344, `Warehouse: expected 1344, got ${offset}`)

// 4: Office 16×12×12
writeBox(0, 0, 0, 16, 12, 12)
console.assert(offset === 1776, `Office: expected 1776, got ${offset}`)

// 5: PowerStation 8×4×8
writeBox(0, 0, 0, 8, 4, 8)
console.assert(offset === 2208, `PowerStation: expected 2208, got ${offset}`)

// 6: GuardHouse 6×3×4
writeBox(0, 0, 0, 6, 3, 4)
console.assert(offset === 2640, `GuardHouse: expected 2640, got ${offset}`)

// 7: WallLeft 0.3×3×100
writeBox(0, 0, 0, 0.3, 3, 100)
console.assert(offset === 3072, `WallLeft: expected 3072, got ${offset}`)

// 8: WallRight
writeBox(0, 0, 0, 0.3, 3, 100)
console.assert(offset === 3504, `WallRight: expected 3504, got ${offset}`)

// 9: WallBack 110×3×0.3
writeBox(0, 0, 0, 110, 3, 0.3)
console.assert(offset === 3936, `WallBack: expected 3936, got ${offset}`)

// 10: WallFront
writeBox(0, 0, 0, 110, 3, 0.3)
console.assert(offset === 4368, `WallFront: expected 4368, got ${offset}`)

// 11: Camera body 1×1.2×1
writeBox(0, 0, 0, 1, 1.2, 1)
console.assert(offset === 4800, `Camera: expected 4800, got ${offset}`)

// 12: Ground indices (6 indices as unsigned short)
// Triangle 1: 0, 1, 2
// Triangle 2: 0, 2, 3
const indices = [0, 1, 2, 0, 2, 3]
for (const idx of indices) {
  buf.writeUInt16LE(idx, offset); offset += 2
}
console.assert(offset === 4812, `Indices: expected 4812, got ${offset}`)

writeFileSync('public/models/factory/factory-scene.bin', buf.slice(0, offset))
console.log(`✅ factory-scene.bin generated (${offset} bytes)`)
