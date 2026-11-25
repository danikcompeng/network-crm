// The 3D map's drawing (plans/crm.md, Feature 7), the one file that uses
// three.js. It's loaded with a dynamic import() from the map's 3D frame,
// so three.js is a chunk only /map downloads.
//
// No React here: one scene, drawn when the frame asks (draw()), with no
// work between. All the maths (where everyone is, the camera, sizes) is
// lib/map-3d.ts; this file only turns it into pixels:
// - people: one instanced, camera-facing disc each (an impostor), sized
//   in screen px like lib/map-3d.ts's spherePx, drawn in its token colour
//   with a small highlight and its stage glyph, writing depth, so what's
//   in front covers what's behind; their glow is a second pass after;
// - You: a real sphere, shaded only away from the background (lighter at
//   night, darker by day), so its contrast never drops below the token's;
// - lines 1.5 px (introductions) and 1 px (rings) in screen space;
// - stars, at night only.
// Unlit, no tone mapping: what's drawn is the tokens.

import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  NormalBlending,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  WebGLRenderer,
} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { STAGES, type Stage } from "@/lib/crm";
import {
  DEPTH_FADE,
  FOV,
  LIMB,
  PERSPECTIVE,
  PLANET_RADIUS,
  PLANET_RING,
  cameraPosition,
  easeOut,
  sphereBasePx,
  starField,
  type Orbit,
  type OrbitLayout,
  type Vec3,
} from "@/lib/map-3d";
import { stageTone } from "@/lib/people";

/** The map's colours, read from the CSS variables (app/globals.css). */
export type SceneColors = {
  dark: boolean;
  space: string;
  orbitLine: string;
  mapEdge: string;
  mapStar: string;
  planet: string;
  sphere: { muted: string; ink: string; accent: string };
};

export type ScenePerson = { id: string; stage: Stage; interactions: number };
export type SceneLine = { from: string; to: string; a: Vec3; b: Vec3 };

export type OrbitScene = {
  setColors(colors: SceneColors): void;
  /** The same people (same ids, same order) with new stages or interaction counts: colours, glyphs and sizes. */
  setPeople(people: readonly ScenePerson[]): void;
  /** Who's shown; with `animate`, newcomers scale in over 200 ms from `now`. */
  setVisible(visible: ReadonlySet<string>, animate: boolean, now: number): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  /** Draws the view; true while something is still animating (a scale-in). */
  draw(orbit: Orbit, now: number): boolean;
  dispose(): void;
};

const SCALE_IN_MS = 200;
/** The glow's strength per stage tone: the people that matter (cobalt) glow most. */
const GLOW = {
  dark: { accent: 0.45, ink: 0.16, muted: 0.12 },
  light: { accent: 0.22, ink: 0.06, muted: 0.06 },
} as const;
/** The glow reaches this far out, as a multiple of the sphere's radius. */
const HALO = 1.8;
const GLYPH_CELL = 64;

/** The six stage glyphs (components/stage-mark.tsx's shapes, on its 16 px grid), white on clear, in a row. */
function glyphAtlas(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = GLYPH_CELL * STAGES.length;
  canvas.height = GLYPH_CELL;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  STAGES.forEach((stage, i) => {
    ctx.save();
    ctx.translate(i * GLYPH_CELL, 0);
    ctx.scale(GLYPH_CELL / 16, GLYPH_CELL / 16);
    const ring = () => {
      ctx.lineWidth = 1.9; // a little heavier than the lists' 1.5: it's drawn small, on a sphere
      ctx.beginPath();
      ctx.arc(8, 8, 5.25, 0, Math.PI * 2);
      ctx.stroke();
    };
    switch (stage) {
      case "new":
        ctx.lineWidth = 2.4; // on a sphere 8 px across, a thinner ring reads as a dot
        ctx.beginPath();
        ctx.arc(8, 8, 5, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "reached_out":
        ring();
        ctx.fill(new Path2D("M8 8V2.75A5.25 5.25 0 0 1 13.25 8Z"));
        break;
      case "talking":
        // Smaller than the lists' dot: a big pale dot on a dark ball reads as a washer.
        ctx.beginPath();
        ctx.arc(8, 8, 3.8, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "interviewing":
        ctx.fill(new Path2D("M8 1.5L14.5 8L8 14.5L1.5 8Z"));
        break;
      case "offer":
        ctx.fill(new Path2D("M8 1.2l1.95 4.1 4.5.55-3.3 3.1.85 4.45L8 11.2l-4 2.2.85-4.45-3.3-3.1 4.5-.55Z"));
        break;
      case "parked":
        ctx.fill(new Path2D("M2.5 6.75h11v2.5h-11Z"));
        break;
    }
    ctx.restore();
  });
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

const IMPOSTOR_VERTEX = /* glsl */ `
  attribute vec3 aCenter;
  attribute float aRadius;
  attribute vec3 aColor;
  attribute float aGlyph;
  attribute float aScale;
  attribute float aGlow;
  uniform vec2 uViewport;
  uniform float uCentreDepth;
  uniform float uSpread;
  uniform float uTanHalf;
  uniform float uReach;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vGlyph;
  varying float vGlow;
  varying float vFade;
  void main() {
    vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
    // Behind the centre, a little toward the background: depth you can see.
    vFade = clamp((-mv.z - uCentreDepth) / uReach, 0.0, 1.0) * ${DEPTH_FADE.toFixed(4)};
    vGlow = aGlow;
    float depth = max(-mv.z, 1e-4);
    float persp = clamp(uCentreDepth / depth, ${PERSPECTIVE.far.toFixed(4)}, ${PERSPECTIVE.near.toFixed(4)});
    float px = aRadius * persp * aScale;
    // The disc stands at the sphere's front, not its centre, so lines that
    // end at the centre go behind it, as they would into a ball. It moves
    // along its own ray to the eye, so it stays where the centre projects.
    float lift = px * depth * 2.0 * uTanHalf / uViewport.y;
    mv.xyz *= (depth - lift) / depth;
    float r = px * uSpread;
    vec4 clip = projectionMatrix * mv;
    clip.xy += position.xy * r * 2.0 / uViewport * clip.w;
    gl_Position = clip;
    vUv = position.xy * uSpread;
    vColor = aColor;
    vGlyph = aGlyph;
  }
`;

const DISC_FRAGMENT = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uSpace;
  uniform float uGlyphs;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vGlyph;
  varying float vFade;
  void main() {
    float r = length(vUv);
    // A smooth rim (alpha to coverage, so it still writes depth).
    float edge = 1.0 - smoothstep(1.0 - fwidth(r) * 1.5, 1.0, r);
    if (edge <= 0.0) discard;
    // Darker toward the rim (a ball, not a washer), and a small soft
    // highlight up and to the left, clear of the edge.
    vec3 colour = vColor * mix(1.0, ${LIMB.toFixed(4)}, smoothstep(0.55, 1.0, r));
    float h = 1.0 - smoothstep(0.0, 0.3, length(vUv - vec2(-0.42, 0.42)));
    colour = mix(colour, vec3(1.0), h * 0.3);
    colour = mix(colour, uSpace, vFade);
    // The stage glyph, in the background's colour, in the middle 60%.
    vec2 g = vUv / 0.6 * 0.5 + 0.5;
    if (g.x >= 0.0 && g.x <= 1.0 && g.y >= 0.0 && g.y <= 1.0) {
      float a = texture2D(uAtlas, vec2((vGlyph + g.x) / uGlyphs, g.y)).a;
      colour = mix(colour, uSpace, a);
    }
    gl_FragColor = linearToOutputTexel(vec4(colour, edge));
  }
`;

const HALO_FRAGMENT = /* glsl */ `
  uniform float uSpread;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vGlow;
  varying float vFade;
  void main() {
    float r = length(vUv);
    if (r < 1.0 || r > uSpread) discard;
    float t = 1.0 - (r - 1.0) / (uSpread - 1.0);
    gl_FragColor = linearToOutputTexel(vec4(vColor, t * t * vGlow * (1.0 - vFade * 3.0)));
  }
`;

const PLANET_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const PLANET_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uDark;
  varying vec3 vNormal;
  void main() {
    float lit = max(dot(normalize(vNormal), normalize(vec3(-0.5, 0.7, 0.6))), 0.0);
    // Only ever away from the background: lighter at night, darker by day.
    vec3 night = mix(uColor, vec3(1.0), 0.28 * lit * lit);
    vec3 day = mix(uColor * (0.78 + 0.22 * lit), vec3(1.0), 0.18 * lit * lit);
    gl_FragColor = linearToOutputTexel(vec4(mix(day, night, uDark), 1.0));
  }
`;

/** A closed loop of `segments` straight pieces through at(angle), as line-segment positions. */
function ringPoints(segments: number, at: (angle: number) => Vec3): number[] {
  const out: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = at((i / segments) * Math.PI * 2);
    const b = at(((i + 1) / segments) * Math.PI * 2);
    out.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  return out;
}

export function createOrbitScene(
  canvas: HTMLCanvasElement,
  input: { layout: OrbitLayout; people: readonly ScenePerson[]; lines: readonly SceneLine[]; ringPoint: (depth: number, angle: number) => Vec3 },
  colors: SceneColors,
): OrbitScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "low-power" });
  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.05, 400);
  const viewport = new Vector2(1, 1);

  // People.
  const n = input.people.length;
  const quad = new PlaneGeometry(2, 2);
  const geometry = new InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute("position", quad.getAttribute("position"));
  const centers = new Float32Array(n * 3);
  input.people.forEach((p, i) => {
    const at = input.layout.people.get(p.id)!.position;
    centers.set([at.x, at.y, at.z], i * 3);
  });
  const radiusAttr = new InstancedBufferAttribute(new Float32Array(n), 1);
  const glyphAttr = new InstancedBufferAttribute(new Float32Array(n), 1);
  const colourAttr = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const scaleAttr = new InstancedBufferAttribute(new Float32Array(n), 1);
  const glowAttr = new InstancedBufferAttribute(new Float32Array(n), 1);
  scaleAttr.setUsage(DynamicDrawUsage);
  geometry.setAttribute("aCenter", new InstancedBufferAttribute(centers, 3));
  geometry.setAttribute("aRadius", radiusAttr);
  geometry.setAttribute("aGlyph", glyphAttr);
  geometry.setAttribute("aColor", colourAttr);
  geometry.setAttribute("aScale", scaleAttr);
  geometry.setAttribute("aGlow", glowAttr);
  geometry.instanceCount = n;

  const atlas = glyphAtlas();
  const shared = {
    uViewport: { value: viewport },
    uCentreDepth: { value: 10 },
    uTanHalf: { value: Math.tan((FOV * Math.PI) / 360) },
    uReach: { value: Math.max(input.layout.reach, 0.5) },
  };
  const discMaterial = new ShaderMaterial({
    vertexShader: IMPOSTOR_VERTEX,
    fragmentShader: DISC_FRAGMENT,
    uniforms: { ...shared, uSpread: { value: 1 }, uAtlas: { value: atlas }, uSpace: { value: new Color() }, uGlyphs: { value: STAGES.length } },
    alphaToCoverage: true,
  });
  const haloMaterial = new ShaderMaterial({
    vertexShader: IMPOSTOR_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    uniforms: { ...shared, uSpread: { value: HALO } },
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  });
  const discs = new Mesh(geometry, discMaterial);
  const halos = new Mesh(geometry, haloMaterial);
  // The quads move in the shader, so three can't know their bounds.
  discs.frustumCulled = false;
  halos.frustumCulled = false;
  halos.renderOrder = 2;
  scene.add(discs, halos);

  // You.
  const planetGeometry = new SphereGeometry(PLANET_RADIUS, 48, 32);
  const planetMaterial = new ShaderMaterial({
    vertexShader: PLANET_VERTEX,
    fragmentShader: PLANET_FRAGMENT,
    uniforms: { uColor: { value: new Color() }, uDark: { value: 0 } },
  });
  scene.add(new Mesh(planetGeometry, planetMaterial));

  // Lines.
  const lineMaterial = (width: number) => new LineMaterial({ linewidth: width, worldUnits: false });
  const edgeMaterial = lineMaterial(1.5);
  const ringMaterial = lineMaterial(1);
  const planetRingMaterial = lineMaterial(1);
  planetRingMaterial.transparent = true;
  planetRingMaterial.opacity = 0.5; // decorative: it mustn't read as a ring nobody is on
  const edgeGeometry = new LineSegmentsGeometry();
  const ringGeometry = new LineSegmentsGeometry();
  const edges = new LineSegments2(edgeGeometry, edgeMaterial);
  const rings = new LineSegments2(ringGeometry, ringMaterial);
  // The planet's own ring, like the app icon's orbit.
  const tiltZ = (-22 * Math.PI) / 180;
  const planetRingGeometry = new LineSegmentsGeometry().setPositions(
    ringPoints(96, (a) => {
      const x = PLANET_RADIUS * PLANET_RING * Math.cos(a);
      const z = PLANET_RADIUS * PLANET_RING * Math.sin(a);
      return { x: x * Math.cos(tiltZ), y: x * Math.sin(tiltZ), z };
    }),
  );
  const planetRing = new LineSegments2(planetRingGeometry, planetRingMaterial);
  scene.add(rings, edges, planetRing);

  // Stars, at night.
  const starGeometry = new BufferGeometry();
  starGeometry.setAttribute("position", new Float32BufferAttribute(starField(260, 40, 60).flatMap((s) => [s.x, s.y, s.z]), 3));
  const starMaterial = new PointsMaterial({ size: 1.6, sizeAttenuation: false });
  const stars = new Points(starGeometry, starMaterial);
  scene.add(stars);

  // Who's shown, and their scale-ins.
  const index = new Map(input.people.map((p, i) => [p.id, i]));
  // When each person started scaling in: -1 once they're fully shown, NaN while hidden.
  const appearAt = new Float64Array(n).fill(Number.NaN);
  let visible: ReadonlySet<string> = new Set();

  let people = input.people;
  let colours = colors;

  function setPeople(next: readonly ScenePerson[]) {
    people = next;
    people.forEach((p, i) => {
      radiusAttr.setX(i, sphereBasePx(p.interactions));
      glyphAttr.setX(i, STAGES.indexOf(p.stage));
    });
    radiusAttr.needsUpdate = true;
    glyphAttr.needsUpdate = true;
    setColors(colours);
  }

  function setColors(c: SceneColors) {
    colours = c;
    const tone = { muted: new Color(c.sphere.muted), ink: new Color(c.sphere.ink), accent: new Color(c.sphere.accent) };
    const glow = GLOW[c.dark ? "dark" : "light"];
    people.forEach((p, i) => {
      const t = stageTone(p.stage);
      colourAttr.setXYZ(i, tone[t].r, tone[t].g, tone[t].b);
      glowAttr.setX(i, glow[t]);
    });
    colourAttr.needsUpdate = true;
    glowAttr.needsUpdate = true;
    renderer.setClearColor(new Color(c.space), 1);
    discMaterial.uniforms.uSpace.value.set(c.space);
    planetMaterial.uniforms.uColor.value.set(c.planet);
    planetMaterial.uniforms.uDark.value = c.dark ? 1 : 0;
    edgeMaterial.color.set(c.mapEdge);
    ringMaterial.color.set(c.orbitLine);
    planetRingMaterial.color.set(c.planet);
    starMaterial.color.set(c.mapStar);
    stars.visible = c.dark;
  }

  function setVisible(next: ReadonlySet<string>, animate: boolean, now: number) {
    for (const [id, i] of index) {
      const was = visible.has(id);
      const is = next.has(id);
      if (!is) appearAt[i] = Number.NaN;
      else if (!was) appearAt[i] = animate ? now : -1;
    }
    visible = next;
    // A line once both ends are there (You is always there). setPositions
    // makes new buffers each time; at most 40 times for Watch it grow, so
    // the old ones are left to the browser rather than pooled.
    const shown = input.lines.filter((l) => next.has(l.to) && (l.from === "you" || next.has(l.from)));
    edgeGeometry.setPositions(shown.length ? shown.flatMap((l) => [l.a.x, l.a.y, l.a.z, l.b.x, l.b.y, l.b.z]) : [0, 0, 0, 0, 0, 0]);
    edges.visible = shown.length > 0;
    // Only the rings someone is on.
    const depths = new Set(people.filter((p) => next.has(p.id)).map((p) => input.layout.people.get(p.id)!.depth));
    const points: number[] = [];
    for (const depth of [...depths].sort((a, b) => a - b)) {
      const radius = input.layout.rings.get(depth)!.radius;
      points.push(...ringPoints(Math.max(96, Math.round(radius * 40)), (a) => input.ringPoint(depth, a)));
    }
    ringGeometry.setPositions(points.length ? points : [0, 0, 0, 0, 0, 0]);
    rings.visible = points.length > 0;
  }

  function setSize(width: number, height: number, pixelRatio: number) {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    viewport.set(width, height);
    for (const m of [edgeMaterial, ringMaterial, planetRingMaterial]) m.resolution.set(width, height);
  }

  function draw(orbit: Orbit, now: number): boolean {
    const eye = cameraPosition(orbit);
    camera.position.set(eye.x, eye.y, eye.z);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    shared.uCentreDepth.value = orbit.distance;
    let animating = false;
    for (let i = 0; i < n; i++) {
      const at = appearAt[i];
      let s = 1;
      if (Number.isNaN(at)) s = 0;
      else if (at >= 0) {
        const t = (now - at) / SCALE_IN_MS;
        s = easeOut(t);
        if (t < 1) animating = true;
        else appearAt[i] = -1;
      }
      scaleAttr.setX(i, s);
    }
    scaleAttr.needsUpdate = true;
    renderer.render(scene, camera);
    return animating;
  }

  function dispose() {
    for (const g of [quad, geometry, planetGeometry, edgeGeometry, ringGeometry, planetRingGeometry, starGeometry]) g.dispose();
    for (const m of [discMaterial, haloMaterial, planetMaterial, edgeMaterial, ringMaterial, planetRingMaterial, starMaterial]) m.dispose();
    atlas.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  setPeople(people);
  return { setColors, setPeople, setVisible, setSize, draw, dispose };
}
