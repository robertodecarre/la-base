import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

/**
 * One LoadingManager for everything so the loader bar reflects real progress.
 * Decoders are served from a pinned CDN path matching the installed three version;
 * for production, copy them into /public/decoders and point the paths there.
 */
const THREE_VERSION = THREE.REVISION
const DRACO_PATH = `https://cdn.jsdelivr.net/npm/three@0.${THREE_VERSION}.0/examples/jsm/libs/draco/gltf/`
const BASIS_PATH = `https://cdn.jsdelivr.net/npm/three@0.${THREE_VERSION}.0/examples/jsm/libs/basis/`

export type Manifest = {
  models?: Record<string, string>
  textures?: Record<string, string>
}

export class Assets {
  readonly manager = new THREE.LoadingManager()
  readonly models = new Map<string, GLTF>()
  readonly textures = new Map<string, THREE.Texture>()
  private readonly gltf: GLTFLoader
  private readonly tex = new THREE.TextureLoader(this.manager)

  constructor(renderer: THREE.WebGLRenderer, onProgress: (p: number) => void) {
    const draco = new DRACOLoader(this.manager).setDecoderPath(DRACO_PATH)
    const ktx2 = new KTX2Loader(this.manager).setTranscoderPath(BASIS_PATH).detectSupport(renderer)
    this.gltf = new GLTFLoader(this.manager)
      .setDRACOLoader(draco)
      .setKTX2Loader(ktx2)
      .setMeshoptDecoder(MeshoptDecoder)
    this.manager.onProgress = (_url, loaded, total) => onProgress(total ? loaded / total : 1)
  }

  async load(manifest: Manifest): Promise<void> {
    const jobs: Promise<unknown>[] = []
    for (const [key, url] of Object.entries(manifest.models ?? {})) {
      jobs.push(this.gltf.loadAsync(url).then((g) => this.models.set(key, g)))
    }
    for (const [key, url] of Object.entries(manifest.textures ?? {})) {
      jobs.push(
        this.tex.loadAsync(url).then((t) => {
          t.colorSpace = THREE.SRGBColorSpace
          t.anisotropy = 4
          this.textures.set(key, t)
        }),
      )
    }
    // A missing asset must not brick the whole experience: log and continue with procedural fallbacks.
    const results = await Promise.allSettled(jobs)
    results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .forEach((r) => console.error('[assets] failed to load', r.reason))
  }
}
