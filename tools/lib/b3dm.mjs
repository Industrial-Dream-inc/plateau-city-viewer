// Minimal Batched 3D Model (b3dm) reader: returns one triangle list per
// feature (_BATCHID) in ECEF metres, with a few PLATEAU building attributes.
import draco3d from 'draco3d';

let dracoPromise;
const draco = () => (dracoPromise ||= draco3d.createDecoderModule({}));

const COMPONENT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const BT_TYPES = { BYTE: Int8Array, UNSIGNED_BYTE: Uint8Array, SHORT: Int16Array, UNSIGNED_SHORT: Uint16Array, INT: Int32Array, UNSIGNED_INT: Uint32Array, FLOAT: Float32Array, DOUBLE: Float64Array };

export async function decodeB3dm(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.toString('latin1', 0, 4) !== 'b3dm') throw new Error('not a b3dm');
  const ftJ = dv.getUint32(12, true), ftB = dv.getUint32(16, true), btJ = dv.getUint32(20, true), btB = dv.getUint32(24, true);
  let o = 28;
  const ft = ftJ ? JSON.parse(buf.toString('utf8', o, o + ftJ)) : {}; o += ftJ + ftB;
  const bt = btJ ? JSON.parse(buf.toString('utf8', o, o + btJ)) : {}; o += btJ;
  const btBin = buf.subarray(o, o + btB); o += btB;
  const glb = buf.subarray(o);

  const nBatch = ft.BATCH_LENGTH || 0;
  const prop = (name, i) => {
    const v = bt[name];
    if (v == null) return undefined;
    if (Array.isArray(v)) return v[i];
    if (v.byteOffset != null) {
      const T = BT_TYPES[v.componentType];
      return new T(btBin.buffer.slice(btBin.byteOffset + v.byteOffset, btBin.byteOffset + v.byteOffset + T.BYTES_PER_ELEMENT * nBatch))[i];
    }
    return undefined;
  };

  const { positions, batchIds, indices } = await readGlb(glb);
  const rtc = ft.RTC_CENTER || [0, 0, 0];

  // group triangles by the batch id of their first vertex
  const groups = new Map();
  for (let t = 0; t < indices.length; t += 3) {
    const b = batchIds ? batchIds[indices[t]] : 0;
    let g = groups.get(b); if (!g) groups.set(b, g = []);
    g.push(indices[t], indices[t + 1], indices[t + 2]);
  }
  const features = [];
  for (const [b, tri] of groups) {
    const map = new Map(); const pos = []; const idx = [];
    for (const v of tri) {
      let j = map.get(v);
      if (j === undefined) {
        j = pos.length / 3; map.set(v, j);
        pos.push(positions[v * 3] + rtc[0], positions[v * 3 + 1] + rtc[1], positions[v * 3 + 2] + rtc[2]);
      }
      idx.push(j);
    }
    features.push({
      batchId: b,
      positions: pos,
      indices: idx,
      props: {
        buildingId: prop('uro:BuildingIDAttribute_uro:buildingID', b),
        gmlId: prop('gml_id', b) ?? prop('gml:id', b),
        measuredHeight: prop('bldg:measuredHeight', b),
        usage: prop('bldg:usage', b),
        name: prop('gml:name', b),
      },
    });
  }
  return { features };
}

async function readGlb(glb) {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not glb');
  let o = 12, json, bin;
  while (o < glb.length) {
    const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true);
    const chunk = glb.subarray(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    o += 8 + len;
  }
  const center = json.extensions?.CESIUM_RTC?.center || [0, 0, 0];
  const view = (bvIndex) => {
    const bv = json.bufferViews[bvIndex];
    return bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  };
  const accessor = (i) => {
    const ac = json.accessors[i];
    const T = COMPONENT[ac.componentType];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[ac.type];
    const bv = json.bufferViews[ac.bufferView];
    const stride = bv.byteStride || n * T.BYTES_PER_ELEMENT;
    const src = view(ac.bufferView);
    const out = new Float64Array(ac.count * n);
    const d = new DataView(src.buffer, src.byteOffset + (ac.byteOffset || 0));
    const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[ac.componentType];
    for (let k = 0; k < ac.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = d[get](k * stride + c * T.BYTES_PER_ELEMENT, true);
    return out;
  };

  const P = [], B = [], I = [];
  const nodes = json.nodes || [];
  for (const node of nodes) {
    if (node.mesh == null) continue;
    const t = node.translation || [0, 0, 0];
    for (const prim of json.meshes[node.mesh].primitives) {
      let pos, bid, idx;
      const dext = prim.extensions?.KHR_draco_mesh_compression;
      if (dext) ({ pos, bid, idx } = await decodeDraco(view(dext.bufferView), dext.attributes));
      else {
        pos = accessor(prim.attributes.POSITION);
        bid = prim.attributes._BATCHID != null ? accessor(prim.attributes._BATCHID) : null;
        idx = prim.indices != null ? accessor(prim.indices) : Float64Array.from({ length: pos.length / 3 }, (_, k) => k);
      }
      const base = P.length / 3;
      // glTF is y-up; 3D Tiles 1.0 content is z-up ECEF: (x, y, z) -> (x, -z, y)
      for (let k = 0; k < pos.length; k += 3) {
        const x = pos[k] + t[0], y = pos[k + 1] + t[1], z = pos[k + 2] + t[2];
        P.push(x + center[0], -z + center[1], y + center[2]);
        B.push(bid ? bid[k / 3] : 0);
      }
      for (const v of idx) I.push(v + base);
    }
  }
  return { positions: P, batchIds: B, indices: I };
}

async function decodeDraco(bytes, attrIds) {
  const m = await draco();
  const dec = new m.Decoder();
  const db = new m.DecoderBuffer();
  db.Init(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), bytes.byteLength);
  const mesh = new m.Mesh();
  const st = dec.DecodeBufferToMesh(db, mesh);
  if (!st.ok()) throw new Error('draco: ' + st.error_msg());
  const read = (uid, comps) => {
    if (uid == null) return null;
    const attr = dec.GetAttributeByUniqueId(mesh, uid);
    const arr = new m.DracoFloat32Array();
    dec.GetAttributeFloatForAllPoints(mesh, attr, arr);
    const out = new Float64Array(mesh.num_points() * comps);
    for (let k = 0; k < out.length; k++) out[k] = arr.GetValue(k);
    m.destroy(arr);
    return out;
  };
  const pos = read(attrIds.POSITION, 3);
  const bid = read(attrIds._BATCHID, 1);
  const nf = mesh.num_faces();
  const idx = new Uint32Array(nf * 3);
  const fa = new m.DracoInt32Array();
  for (let f = 0; f < nf; f++) {
    dec.GetFaceFromMesh(mesh, f, fa);
    idx[f * 3] = fa.GetValue(0); idx[f * 3 + 1] = fa.GetValue(1); idx[f * 3 + 2] = fa.GetValue(2);
  }
  m.destroy(fa); m.destroy(mesh); m.destroy(db); m.destroy(dec);
  return { pos, bid, idx };
}
