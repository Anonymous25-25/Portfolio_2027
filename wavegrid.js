/* Wave Grid Background — Youness portfolio
   Ported from the React/Next "WaveGridBackground" component (Three.js + GLSL)
   into a self-contained vanilla module for the static portfolio.

   behaviour: 40x40 instanced cubes that ripple in fluid waves where the
   cursor moves (raycast onto the grid plane), with gentle auto ripples when
   the pointer idles, plus a vignette + RGB-shift post pass.

   adapted to the site identity: dark cubes, orange (#ff5c1a) crests.

   layering:  #wavegrid-canvas is fixed, inset:0, z-index:-1 (behind all
              content, pointer-events none) — sketch/clicks land on the site.
   fallback:  no WebGL2 / reduced-motion / load error -> canvas removed,
              the plain #0a0a0b background stays. */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/* ---------------- config (site palette: dark + orange) ---------------- */
const CONFIG = {
  gridSize: 40,            // N x N cubes (mobile: 30)
  cubeWidth: 0.8,
  cubeHeight: 3,
  gap: 0.01,
  colorBase: "#3a3f47",    // dark steel cube
  colorHigh: "#ff5c1a",    // site accent on wave crests
  bgColor: "#0a0a0b",      // matches html background token
  waveAmplitude: 0.5,
  waveSpeed: 6.0,
  waveFrequency: 1.2,
  waveWidth: 3.0,
  waveMaxHeight: 0.5,
  waveJitter: 0.2,
  exposure: 1.7,
};

const MAX_TRAIL = 128;
const VIGNETTE_RGB_SHIFT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    shiftAmount: { value: 0.005 },
    vignetteRadius: { value: 0.3 },
    vignetteSoftness: { value: 0.3 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float shiftAmount;
    uniform float vignetteRadius;
    uniform float vignetteSoftness;
    varying vec2 vUv;

    void main() {
      vec2 center = vec2(0.5);
      float dist = distance(vUv, center);
      float horzQuadrant = sign(vUv.x - center.x);
      float vertQuadrant = sign(vUv.y - center.y);

      float vignetteFactor = smoothstep(vignetteRadius, vignetteRadius + vignetteSoftness, dist);
      float currentShift = shiftAmount * vignetteFactor;

      float r = texture2D(tDiffuse, vUv + vec2(currentShift * horzQuadrant, currentShift * vertQuadrant)).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - vec2(currentShift * horzQuadrant, currentShift * vertQuadrant)).b;

      float darken = 1.0 - vignetteFactor * 0.5;
      gl_FragColor = vec4(vec3(r, g, b) * darken, 1.0);
    }
  `,
};

// Injects the mouse-trail wave displacement into a standard material's vertex
// shader. Shared between the visible material and the depth material so the
// shadows follow the same deformation.
function overrideVertexShader(vertexShader) {
  return vertexShader
    .replace(
      "#include <common>",
      /* glsl */ `#include <common>
      varying float vHeight;
      attribute vec2 aOffset;
      uniform sampler2D uTrailTexture;
      uniform int       uTrailCount;
      uniform float     uWaveSpeed;
      uniform float     uWaveFreq;
      uniform float     uWaveWidth;
      uniform float     uFadeTime;
      uniform float     uAmplitude;
      uniform float     uJitter;
      uniform float     uMaxHeight;

      vec2 hash2( vec2 p ) {
        p = vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) );
        return fract( sin( p ) * 43758.5453123 ) - 0.5;
      }`,
    )
    .replace(
      "#include <begin_vertex>",
      /* glsl */ `#include <begin_vertex>

      vHeight = 0.0;

      if ( position.y > 0.0 ) {
        vec2 jitter  = hash2( aOffset ) * uJitter;
        vec2 worldXZ = aOffset + jitter;
        float waveHeight  = 0.0;
        float totalWeight = 0.0;

        for ( int i = 0; i < uTrailCount; i++ ) {
          vec4 td = texture2D( uTrailTexture, vec2( ( float(i) + 0.5 ) / 128.0, 0.5 ) );
          float dist      = length( worldXZ - td.rg );
          float wavefront = uWaveSpeed * td.b;
          float relDist   = dist - wavefront;

          float window = exp( -( relDist * relDist ) / ( uWaveWidth * uWaveWidth ) );
          float fade   = exp( -td.b / uFadeTime );
          float atten  = 1.0 / ( 1.0 + dist * 0.1 );
          float weight = fade * window * atten * td.a;

          waveHeight  += weight * cos( uWaveFreq * relDist );
          totalWeight += weight;
        }

        waveHeight /= max( totalWeight, 1.0 );

        float displacement = clamp( waveHeight * uAmplitude, -uMaxHeight, uMaxHeight );
        transformed.y += displacement;
        vHeight = displacement;
      }`,
    );
}

/* ---------------- boot ---------------- */
(function boot() {
  const canvas = document.getElementById("wavegrid-canvas");
  if (!canvas) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const webglOK = (function () {
    try {
      return !!(window.WebGL2RenderingContext && document.createElement("canvas").getContext("webgl2"));
    } catch (e) { return false; }
  })();
  if (reduced || !webglOK) {
    canvas.remove(); // plain dark background remains
    return;
  }

  try { init(canvas); } catch (e) {
    /* no wave grid rather than a broken page */
    console.warn("wavegrid disabled:", e && e.message);
    canvas.remove();
  }

  function init(canvas) {
    const cubeWidth = CONFIG.cubeWidth;
    const cubeHeight = CONFIG.cubeHeight;
    const gap = CONFIG.gap;
    let gridSize = CONFIG.gridSize;
    let maxPixelRatio = 2;
    if (window.matchMedia("(max-width: 767px)").matches) {
      gridSize = 30;              // lighter mesh on phones
      maxPixelRatio = 1.75;
    }
    const bounds = gridSize * (cubeWidth + gap);

    /* sizes */
    const getSize = () => ({
      width: window.innerWidth || 1,
      height: window.innerHeight || 1,
      pixelRatio: Math.min(window.devicePixelRatio || 1, maxPixelRatio),
    });
    let size = getSize();

    /* scene */
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.bgColor);

    /* camera (mouse-driven orbit) */
    const alphaRange = Math.PI * 0.03;
    const betaRange = Math.PI * 0.05;
    const mouse = new THREE.Vector2(0, 0);
    const lerpedMouse = new THREE.Vector2(0, 0);

    const camera = new THREE.PerspectiveCamera(40, size.width / size.height, 0.1, 500);
    let cameraRadius = 12;
    const fitCamera = () => {
      const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
      const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * camera.aspect);
      const halfBounds = bounds / 2;
      cameraRadius = Math.min(
        halfBounds / Math.tan(verticalHalfFov),
        halfBounds / Math.tan(horizontalHalfFov),
      ) * 0.9 + cubeHeight * 0.5;
    };
    const positionCamera = (mx, my) => {
      const alpha = my * alphaRange;
      const beta = mx * betaRange;
      camera.position.set(
        -cameraRadius * Math.cos(alpha) * Math.sin(beta),
        cameraRadius * Math.cos(alpha) * Math.cos(beta),
        cameraRadius * Math.sin(alpha),
      );
      camera.up.set(0, 0, -1);
      camera.lookAt(0, 0, 0);
    };
    fitCamera();
    positionCamera(0, 0);
    scene.add(camera);

    /* lighting */
    const ambientLight = new THREE.AmbientLight("#ffffff", 0.5);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight("#ffffff", 2.8);
    keyLight.position.set(-20, 10, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.radius = 6;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 80;
    keyLight.shadow.camera.left = -22;
    keyLight.shadow.camera.right = 22;
    keyLight.shadow.camera.top = 22;
    keyLight.shadow.camera.bottom = -22;
    keyLight.shadow.bias = 0.0001;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight("#ffffff", 0.7);
    fillLight.position.set(10, 5, -3);
    scene.add(fillLight);

    /* mouse trail (world-space ripple sources) */
    const trailData = new Float32Array(MAX_TRAIL * 4);
    const trailTexture = new THREE.DataTexture(trailData, MAX_TRAIL, 1, THREE.RGBAFormat, THREE.FloatType);
    trailTexture.needsUpdate = true;

    const trailUniforms = {
      uTrailTexture: { value: trailTexture },
      uTrailCount: { value: 0 },
      uFadeTime: { value: 2.0 },
      uWaveSpeed: { value: CONFIG.waveSpeed },
      uWaveFreq: { value: CONFIG.waveFrequency },
      uWaveWidth: { value: CONFIG.waveWidth },
      uAmplitude: { value: CONFIG.waveAmplitude },
      uJitter: { value: CONFIG.waveJitter },
      uMaxHeight: { value: CONFIG.waveMaxHeight },
    };
    const colorUniforms = {
      uColorBase: { value: new THREE.Color(CONFIG.colorBase) },
      uColorHigh: { value: new THREE.Color(CONFIG.colorHigh) },
    };

    const trail = [];
    let lastPoint = null;
    let timeSinceLastMove = 0;
    let randomPointTimer = 0;
    let placingRandom = true;
    const fadeTime = 2.0;
    const trailSpacing = 0.1;

    const rayPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(bounds, bounds),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, visible: false }),
    );
    rayPlane.rotation.x = -Math.PI / 2;
    rayPlane.updateMatrixWorld(true);

    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();

    /* events on window: the canvas sits BEHIND the content (z-index:-1),
       so the ripple must follow the pointer everywhere over the page */
    const onPointerMove = (e) => {
      pointerNDC.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
      mouse.copy(pointerNDC);
      raycaster.setFromCamera(pointerNDC, camera);
      const hits = raycaster.intersectObject(rayPlane);
      if (hits.length === 0) return;
      const x = hits[0].point.x;
      const z = hits[0].point.z;

      let distDelta = 0;
      if (lastPoint) {
        const dx = x - lastPoint.x;
        const dz = z - lastPoint.z;
        distDelta = Math.sqrt(dx * dx + dz * dz);
        if (distDelta < trailSpacing) return;
      }
      if (trail.length >= MAX_TRAIL) trail.shift();
      trail.push({ x, z, age: 0, distDelta });
      lastPoint = { x, z };
      timeSinceLastMove = 0;
      placingRandom = false;
      randomPointTimer = 0;
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    const onPointerLeave = () => { mouse.set(0, 0); lastPoint = null; };
    document.documentElement.addEventListener("pointerleave", onPointerLeave);

    const addRandomPoint = () => {
      const x = (Math.random() * 0.5 - 0.25) * bounds;
      const z = (Math.random() * 0.5 - 0.25) * bounds;
      const distDelta = 0.8 + Math.random() * 0.2;
      if (trail.length >= MAX_TRAIL) trail.shift();
      trail.push({ x, z, age: 0, distDelta });
    };

    const updateTrail = (delta) => {
      const expiry = fadeTime * 4;
      for (let i = trail.length - 1; i >= 0; i--) {
        trail[i].age += delta;
        if (trail[i].age > expiry) trail.splice(i, 1);
      }

      timeSinceLastMove += delta;
      if (timeSinceLastMove >= 3.0 && !placingRandom) {
        placingRandom = true;
        randomPointTimer = 0;
      }
      if (placingRandom) {
        randomPointTimer += delta;
        if (randomPointTimer >= 1.5) {
          addRandomPoint();
          randomPointTimer = 0;
        }
      }

      const count = Math.min(trail.length, MAX_TRAIL);
      if (count > 0 || trailUniforms.uTrailCount.value > 0) {
        for (let i = 0; i < count; i++) {
          const ti = i * 4;
          trailData[ti] = trail[i].x;
          trailData[ti + 1] = trail[i].z;
          trailData[ti + 2] = trail[i].age;
          trailData[ti + 3] = trail[i].distDelta;
        }
        trailTexture.needsUpdate = true;
        trailUniforms.uTrailCount.value = count;
      }
    };

    /* grid (instanced cubes with wave shader) */
    const count = gridSize * gridSize;
    const geometry = new THREE.BoxGeometry(cubeWidth, cubeHeight, cubeWidth);
    const offsetAttribute = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
    geometry.setAttribute("aOffset", offsetAttribute);

    const material = new THREE.MeshPhongMaterial({ color: 0xffffff });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, trailUniforms, colorUniforms);
      shader.vertexShader = overrideVertexShader(shader.vertexShader);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          varying float vHeight;
          uniform vec3  uColorBase;
          uniform vec3  uColorHigh;
          uniform float uMaxHeight;`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          float t = clamp( vHeight / uMaxHeight, 0.0, 1.0 );
          diffuseColor.rgb = mix( uColorBase, uColorHigh, t );`,
        );
    };

    const depthMaterial = new THREE.MeshDepthMaterial();
    depthMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, trailUniforms);
      shader.vertexShader = overrideVertexShader(shader.vertexShader);
    };

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count);
    instancedMesh.customDepthMaterial = depthMaterial;
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;
    scene.add(instancedMesh);

    const dummy = new THREE.Object3D();
    const spacing = cubeWidth + gap;
    const offset = ((gridSize - 1) * spacing) / 2;
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const index = i * gridSize + j;
        const x = i * spacing - offset;
        const z = j * spacing - offset;
        dummy.position.set(x, 0, z);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(index, dummy.matrix);
        offsetAttribute.setXY(index, x, z);
      }
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    offsetAttribute.needsUpdate = true;

    /* renderer + post-processing */
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = CONFIG.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor(CONFIG.bgColor);
    renderer.setSize(size.width, size.height);
    renderer.setPixelRatio(size.pixelRatio);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new ShaderPass(VIGNETTE_RGB_SHIFT_SHADER));
    composer.addPass(new OutputPass());
    composer.setSize(size.width, size.height);
    composer.setPixelRatio(size.pixelRatio);

    /* resize */
    const applySize = () => {
      size = getSize();
      camera.aspect = size.width / size.height;
      camera.updateProjectionMatrix();
      fitCamera();
      positionCamera(lerpedMouse.x, lerpedMouse.y);
      renderer.setSize(size.width, size.height);
      renderer.setPixelRatio(size.pixelRatio);
      composer.setSize(size.width, size.height);
      composer.setPixelRatio(size.pixelRatio);
    };
    window.addEventListener("resize", applySize);

    /* animation loop (paused in hidden tabs; jittered 30fps cap on mobile) */
    const clock = new THREE.Clock();
    let running = false;
    const renderFrame = () => {
      const delta = Math.min(clock.getDelta(), 0.05);
      updateTrail(delta);
      lerpedMouse.x += (mouse.x - lerpedMouse.x) * 0.04;
      lerpedMouse.y += (mouse.y - lerpedMouse.y) * 0.04;
      positionCamera(lerpedMouse.x, lerpedMouse.y);
      composer.render();
    };
    const startLoop = () => {
      if (running) return;
      running = true;
      clock.getDelta();
      renderer.setAnimationLoop(renderFrame);
    };
    const stopLoop = () => {
      running = false;
      renderer.setAnimationLoop(null);
    };
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopLoop();
      else startLoop();
    });
    startLoop();
  }
})();
