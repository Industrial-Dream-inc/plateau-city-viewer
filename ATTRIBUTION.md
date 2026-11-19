# Data and third-party notices

The MIT license in `LICENSE` covers the source code only. Data and
dependencies keep their own terms.

## PLATEAU 3D city models (data)

`public/data/ginza.city.json` is processed from:

- 「3D都市モデル（Project PLATEAU）東京都中央区（2025年度）」（国土交通省）
  https://www.mlit.go.jp/plateau/ — building model, LOD2 (no texture), 3D Tiles
- Terms: PLATEAU site policy (PDL 1.0, compatible with CC BY 4.0)
  https://www.mlit.go.jp/plateau/site-policy/

Processing: buildings inside a 400 m x 300 m rectangle around
35.6717 N, 139.7640 E were cut out, converted to local metres, placed on a
flat ground and quantised to 0.1 m. Only id, height and usage attributes are
kept.

If you publish a city made with this tool, credit the source and say you
processed it, for example:

> 「3D都市モデル（Project PLATEAU）〇〇市（20XX年度）」（国土交通省）を加工して作成
> Processed from MLIT Project PLATEAU 3D city model, 〇〇 (20XX)

Do not present processed data as if MLIT made it.

## Dependencies

| Package | License | Used for |
| --- | --- | --- |
| three | MIT | rendering (shipped in the bundle) |
| vite | MIT | dev server and build (not shipped) |
| draco3d | Apache-2.0 | decoding Draco meshes in `tools/` (not shipped) |
