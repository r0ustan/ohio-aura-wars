import { Color3, Color4 } from '@dcl/sdk/math'

/** Solid painted surface — default for most of the scene */
export function solid(hex: string, roughness = 0.7, metallic = 0.05) {
  return {
    albedoColor: Color4.fromHexString(hex),
    emissiveColor: Color3.create(0, 0, 0),
    emissiveIntensity: 0,
    roughness,
    metallic
  }
}

/** Soft lit surface for faces / plastic toys */
export function plastic(hex: string, roughness = 0.45) {
  return {
    albedoColor: Color4.fromHexString(hex),
    emissiveColor: Color3.create(0, 0, 0),
    emissiveIntensity: 0,
    roughness,
    metallic: 0.02
  }
}

/** Glossy ceramic / porcelain */
export function ceramic(hex: string) {
  return {
    albedoColor: Color4.fromHexString(hex),
    emissiveColor: Color3.create(0, 0, 0),
    emissiveIntensity: 0,
    roughness: 0.18,
    metallic: 0.05
  }
}

/** Selective glow — use sparingly for accents only */
export function glow(hex: string, intensity = 2.2, roughness = 0.35) {
  return {
    albedoColor: Color4.fromHexString(hex),
    emissiveColor: Color3.fromHexString(hex),
    emissiveIntensity: intensity,
    roughness,
    metallic: 0.1
  }
}
