import { useEffect, useRef, useState } from "react";
import data from "../../data/cube.json";

// Level_02's gravity cube in 3-D. Every box, room and landmark comes from src/data/cube.json, exported from a
// geometry dump of the shipped map (Tools/Stage2/DumpStage2Geometry.py). Unreal is left-handed and Z-up; Three.js is
// right-handed and Y-up, so (x, y, z) cm -> (x, z, y) / 100 m. Swapping two axes also fixes the handedness.

type V3 = [number, number, number];
type Zone = { room: string; kind: string; origin: V3; axes: [V3, V3, V3]; extent: V3; gravity: V3 };
const D = data as unknown as {
  zones: Zone[]; boxes: { c: V3; a: [V3, V3, V3]; v: boolean; g: number; s: number }[];
  seams: { name: string; center: V3 }[]; artifacts: { name: string; at: V3; inCube: boolean }[];
  swords: { name: string; at: V3 }[]; guards: { name: string; at: V3 }[]; shelves: { name: string; at: V3 }[];
  core: { name: string; at: V3 }[]; source: string;
};

const ROOM_INFO: Record<string, { color: string; label: string; text: string }> = {
  Floor: { color: "#d79a4a", label: "Floor", text: "Spawn room, black return gate, departure zone. Gravity −Z." },
  WallN: { color: "#78a552", label: "North wall", text: "Column hall and the 1B colour-gate maze; reached by tipping off the golden step of the corner tower." },
  WallS: { color: "#c8673f", label: "South wall", text: "The rescue cage (six-seal puzzle) and the south library." },
  WallE: { color: "#5c9fbf", label: "East wall", text: "Floating plates, the ring network of the second layer, the lower sanctum." },
  WallW: { color: "#9476c9", label: "West wall", text: "Room B door sentry, the drain that flings players across the cube." },
  Ceiling: { color: "#d9b25e", label: "Ceiling", text: "The rolling-shelf library maze and the tide well sword." },
};
const LANE_INFO: Record<string, string> = {
  Shaft: "Zenith shaft: fall through the cube from the ceiling to the floor (and onto the core deck).",
  ChimneyE: "East chimney: after the east sword, drop out of the trough back to the floor.",
  ChimneyEPassage: "Chimney passage back into the floor room.",
  FlingX: "Drain lane: gravity +X flings a body from the west wall to the east wall's iron trough.",
  LaunchW: "Launch lane: gravity +Z throws a body from the floor grate up onto the ceiling's shelves.",
  VoidW: "Void around the ceiling island (room A).", VoidE: "Void around the ceiling island (room A).",
  VoidS: "Void around the ceiling island (room A).", VoidN: "Void around the ceiling island (room A).",
};

export default function GravityCube() {
  const mount = useRef<HTMLDivElement>(null);
  const api = useRef<{ setLayer: (k: string, v: boolean) => void; focus: (room: string | null) => void; setCore: (t: number) => void; setSpin: (v: boolean) => void } | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [layers, setLayers] = useState({ boxes: true, rooms: true, gravity: true, lanes: true, landmarks: true });
  const [focus, setFocus] = useState<string | null>(null);
  const [swords, setSwords] = useState(0);
  const [spin, setSpin] = useState(false);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const el = mount.current;
      if (!el || disposed) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setFailed(true);
        return;
      }
      const P = (v: V3) => new THREE.Vector3(v[0] / 100, v[2] / 100, v[1] / 100);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 600);
      camera.position.set(70, 52, -62);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      el.appendChild(renderer.domElement);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 24, 0);
      controls.enableDamping = true;
      controls.minDistance = 20;
      controls.maxDistance = 220;
      scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a2018, 1.25));
      const sun = new THREE.DirectionalLight(0xfff0d0, 1.1);
      sun.position.set(40, 90, -30);
      scene.add(sun);

      const groups: Record<string, InstanceType<typeof THREE.Group>> = {};
      for (const k of ["boxes", "rooms", "gravity", "lanes", "landmarks"]) { groups[k] = new THREE.Group(); scene.add(groups[k]); }

      // cube frame
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(48, 48, 48)), new THREE.LineBasicMaterial({ color: 0x8f7337 }));
      frame.position.set(0, 24, 0);
      scene.add(frame);

      // collision boxes (instanced)
      // Dollhouse cutaway: every box belongs to the face it sits on; faces turned towards the camera fade out,
      // so the rooms stay visible from any angle. Outward normals in Three.js space (y = up).
      const FACES: Record<string, [number, number, number]> = { Floor: [0, -1, 0], Ceiling: [0, 1, 0], WallN: [0, 0, 1], WallS: [0, 0, -1], WallE: [1, 0, 0], WallW: [-1, 0, 0] };
      const faceOf = (c: V3) => {
        const d: Record<string, number> = { Floor: Math.abs(c[2]), Ceiling: Math.abs(c[2] - 4800), WallN: Math.abs(c[1] - 2400), WallS: Math.abs(c[1] + 2400), WallE: Math.abs(c[0] - 2400), WallW: Math.abs(c[0] + 2400) };
        return Object.keys(d).sort((a, b) => d[a] - d[b])[0];
      };
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const m = new THREE.Matrix4();
      const faceMats: Record<string, InstanceType<typeof THREE.MeshLambertMaterial>> = {};
      for (const f of Object.keys(FACES)) {
        const list = D.boxes.filter((b) => faceOf(b.c) === f);
        const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 1 });
        faceMats[f] = mat;
        const inst = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((b, i) => {
          const [a0, a1, a2] = b.a.map((a) => P(a).multiplyScalar(2));
          m.makeBasis(a0, a1, a2);
          m.setPosition(P(b.c));
          inst.setMatrixAt(i, m);
          inst.setColorAt(i, new THREE.Color(b.g ? 0xd9b25e : b.s ? 0x6e5c48 : 0xa88f72));
        });
        groups.boxes.add(inst);
      }
      const center = new THREE.Vector3(0, 24, 0);
      const updateCutaway = () => {
        const dir = camera.position.clone().sub(center).normalize();
        for (const [f, n] of Object.entries(FACES)) {
          const facing = dir.x * n[0] + dir.y * n[1] + dir.z * n[2];
          const o = facing > 0.25 ? 0.07 : 1;
          const mat = faceMats[f];
          mat.opacity += (o - mat.opacity) * 0.2;
          mat.depthWrite = mat.opacity > 0.9;
        }
      };

      // rooms: faces + gravity arrows + labels
      const label = (text: string, color: string, size = 1) => {
        const c = document.createElement("canvas");
        c.width = 512; c.height = 128;
        const g = c.getContext("2d")!;
        g.font = "600 56px Cinzel, Georgia, serif";
        g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle";
        g.shadowColor = "#000"; g.shadowBlur = 10;
        g.fillText(text, 256, 64);
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
        s.scale.set(12 * size, 3 * size, 1);
        return s;
      };
      const faceMeshes: Record<string, InstanceType<typeof THREE.Mesh>> = {};
      for (const z of D.zones) {
        const o = P(z.origin), ax = P(z.axes[0]), ay = P(z.axes[1]), up = P(z.axes[2]);
        const grav = P(z.gravity).normalize();
        if (z.kind === "face") {
          const info = ROOM_INFO[z.room];
          const plane = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), new THREE.MeshBasicMaterial({ color: info.color, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
          const basis = new THREE.Matrix4().makeBasis(ax, ay, new THREE.Vector3().crossVectors(ax, ay));
          plane.quaternion.setFromRotationMatrix(basis);
          plane.position.copy(o).addScaledVector(up, 0.05);
          faceMeshes[z.room] = plane;
          groups.rooms.add(plane);
          const tag = label(info.label, info.color);
          tag.position.copy(o).addScaledVector(up, 9);
          groups.rooms.add(tag);
          const arrow = new THREE.ArrowHelper(grav, o.clone().addScaledVector(up, 12), 8, new THREE.Color(info.color).getHex(), 2.4, 1.4);
          groups.gravity.add(arrow);
        } else {
          const e = z.extent;
          const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x5fa7b5, transparent: true, opacity: 0.12, depthWrite: false }));
          const bm = new THREE.Matrix4().makeBasis(ax.clone().multiplyScalar(e[0] * 2 / 100), ay.clone().multiplyScalar(e[1] * 2 / 100), up.clone().multiplyScalar(e[2] * 2 / 100));
          bm.setPosition(o);
          box.applyMatrix4(bm);
          groups.lanes.add(box);
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x5fa7b5, transparent: true, opacity: 0.6 }));
          edges.applyMatrix4(bm);
          groups.lanes.add(edges);
          if (!z.room.startsWith("Void")) groups.gravity.add(new THREE.ArrowHelper(grav, o, Math.min(10, e[2] / 100), 0x5fa7b5, 2, 1.1));
        }
      }
      // seams
      const seamMat = new THREE.MeshBasicMaterial({ color: 0xf0d48f });
      for (const s of D.seams) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 12), seamMat);
        p.position.copy(P(s.center));
        groups.gravity.add(p);
      }
      // landmarks
      const dot = (v: V3, color: number, r: number) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 16), new THREE.MeshBasicMaterial({ color }));
        s.position.copy(P(v));
        groups.landmarks.add(s);
        return s;
      };
      D.artifacts.filter((a) => a.inCube).forEach((a) => dot(a.at, 0xf0c66a, 0.8));
      D.swords.forEach((s) => dot(s.at, 0x8fe3ff, 0.7));
      D.guards.forEach((g) => dot(g.at, 0xc2493c, 0.55));
      D.shelves.forEach((s) => dot(s.at, 0x2fb3aa, 0.45));
      const coreStart = P(D.core[0].at);
      const coreEnd = P([300, 900, D.core[0].at[2]]);
      const core = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 5), new THREE.MeshLambertMaterial({ color: 0x9a82d6, emissive: 0x30204a }));
      core.position.copy(coreStart);
      groups.landmarks.add(core);

      let coreT = 0, coreGoal = 0, spinning = false, focusTarget: InstanceType<typeof THREE.Vector3> | null = null, focusCam: InstanceType<typeof THREE.Vector3> | null = null;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const resize = () => {
        const w = el.clientWidth, h = Math.max(320, Math.min(620, w * 0.66));
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      let raf = 0;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        if (coreT !== coreGoal) {
          coreT += Math.sign(coreGoal - coreT) * Math.min(Math.abs(coreGoal - coreT), reduce ? 1 : 0.012);
          // two nested sliders: first along +Y (north sword), then along +X (east sword); simplified to one L path
          const k = Math.min(1, coreT);
          const mid = new THREE.Vector3(coreStart.x, coreStart.y, coreEnd.z);
          core.position.copy(k < 0.64 ? coreStart.clone().lerp(mid, k / 0.64) : mid.clone().lerp(coreEnd, (k - 0.64) / 0.36));
        }
        if (focusTarget && focusCam) {
          controls.target.lerp(focusTarget, reduce ? 1 : 0.08);
          camera.position.lerp(focusCam, reduce ? 1 : 0.08);
          if (camera.position.distanceTo(focusCam) < 0.3) { focusTarget = null; focusCam = null; }
        }
        controls.autoRotate = spinning && !reduce;
        controls.autoRotateSpeed = 0.6;
        controls.update();
        updateCutaway();
        renderer.render(scene, camera);
      };
      tick();

      api.current = {
        setLayer: (k, v) => { groups[k].visible = v; },
        setSpin: (v) => { spinning = v; },
        setCore: (t) => { coreGoal = t; },
        focus: (room) => {
          for (const [r, mesh] of Object.entries(faceMeshes)) (mesh.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = room === null ? 0.07 : r === room ? 0.32 : 0.03;
          const z = D.zones.find((q) => q.room === room);
          if (!z) { focusTarget = new THREE.Vector3(0, 24, 0); focusCam = new THREE.Vector3(70, 52, -62); return; }
          const up = P(z.axes[2]);
          focusTarget = P(z.origin);
          // look at the face from the opposite side of the cube, a little off-axis
          focusCam = P(z.origin).addScaledVector(up, 44).add(new THREE.Vector3(14, 10, -14));
        },
      };
      setReady(true);
      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        controls.dispose();
        renderer.dispose();
        el.removeChild(renderer.domElement);
      };
    })().catch(() => setFailed(true));
    return () => { disposed = true; cleanup(); };
  }, []);

  useEffect(() => { if (!ready) return; for (const [k, v] of Object.entries(layers)) api.current?.setLayer(k, v); }, [layers, ready]);
  useEffect(() => { if (ready) api.current?.focus(focus); }, [focus, ready]);
  useEffect(() => { if (ready) api.current?.setCore(swords >= 3 ? 1 : 0); }, [swords, ready]);
  useEffect(() => { if (ready) api.current?.setSpin(spin); }, [spin, ready]);

  const roomText = focus ? ROOM_INFO[focus]?.text : null;
  return (
    <div className="demo">
      <div className="demo-bar">
        <div className="btn-row" aria-label="Focus a room">
          <button className="btn" aria-pressed={focus === null} onClick={() => setFocus(null)}>Whole cube</button>
          {Object.entries(ROOM_INFO).map(([k, v]) => (
            <button key={k} className="btn" aria-pressed={focus === k} onClick={() => setFocus(k)}>
              <span className="dot" style={{ background: v.color }} /> {v.label}
            </button>
          ))}
        </div>
        <div className="btn-row">
          {Object.keys(layers).map((k) => (
            <label key={k} className="small muted" style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
              <input type="checkbox" checked={(layers as any)[k]} onChange={(e) => setLayers((l) => ({ ...l, [k]: e.target.checked }))} /> {k}
            </label>
          ))}
          <button className="btn" aria-pressed={spin} onClick={() => setSpin((s) => !s)}>Auto-rotate</button>
        </div>
      </div>
      <div className="demo-body">
        {failed ? (
          <div className="card">
            <strong>3-D view unavailable (WebGL could not start).</strong>
            <p className="small muted">The cube has six rooms: {Object.values(ROOM_INFO).map((r) => r.label).join(", ")}; each has its own gravity, with 12 seams on the edges and {D.zones.length - 6} extra gravity volumes for shafts and lanes.</p>
          </div>
        ) : (
          <div ref={mount} className="gc-mount" aria-label="Interactive 3D view of the gravity cube. Drag to orbit, scroll to zoom." role="img" />
        )}
        <div className="gc-info">
          <div className="small">{roomText ?? "Drag to orbit, scroll or pinch to zoom. Pick a room to fly to it."}</div>
          <details style={{ marginTop: 8 }}>
            <summary className="small" style={{ cursor: "pointer" }}>Gravity lanes and shafts ({D.zones.filter((z) => z.kind === "lane").length})</summary>
            <ul className="small muted">
              {D.zones.filter((z) => z.kind === "lane" && !z.room.startsWith("Void")).map((z) => (
                <li key={z.room}><code>{z.room}</code> — gravity ({z.gravity.join(", ")}) — {LANE_INFO[z.room]}</li>
              ))}
              <li><code>Void W/E/S/N</code> — {LANE_INFO.VoidW}</li>
            </ul>
          </details>
          <div className="btn-row" style={{ marginTop: 8 }}>
            <span className="small muted">Swords drawn:</span>
            {[0, 1, 2, 3].map((n) => (
              <button key={n} className="btn" aria-pressed={swords === n} onClick={() => setSwords(n)}>{n}</button>
            ))}
            <span className="small muted">{swords >= 3 ? "Solo seal satisfied: the core slides under the zenith shaft." : "The core waits until the seal has enough swords (3 solo, 4 duo)."}</span>
          </div>
        </div>
      </div>
      <div className="demo-foot">
        <div className="legend">
          <span><i className="sw" style={{ background: "#8a7258" }} /> collision box ({D.boxes.length})</span>
          <span><i className="sw" style={{ background: "#5fa7b5" }} /> gravity lane / shaft</span>
          <span><i className="sw" style={{ background: "#f0d48f" }} /> seam</span>
          <span><i className="sw" style={{ background: "#f0c66a" }} /> artifact</span>
          <span><i className="sw" style={{ background: "#8fe3ff" }} /> sword</span>
          <span><i className="sw" style={{ background: "#c2493c" }} /> guard</span>
          <span><i className="sw" style={{ background: "#9a82d6" }} /> core</span>
        </div>
        <div style={{ marginTop: 6 }}>Source: {D.source}. The fifth artifact lives in the time temple behind the gate, outside the cube. The core's travel is drawn as one L-shaped path (it is two nested sliders).</div>
      </div>
      <style>{`.gc-mount { width: 100%; min-height: 320px; border-radius: 10px; overflow: hidden; background: radial-gradient(circle at 50% 40%, #1d1712, #0c0907); border: 1px solid var(--line); touch-action: none; }
      .gc-info { margin-top: 10px; }`}</style>
    </div>
  );
}
